import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { fillTemplate } from "@/lib/email-templates";
import { signatureName } from "@/lib/os/mail-signature";

const item = z.object({
  name: z.string().trim().max(200),
  note: z.string().trim().max(500).nullable(),
  quantity: z.number().int().min(1).max(999),
  unit_cents: z.number().int().min(0).max(100_000_000),
  square_id: z.string().trim().max(120).nullable(),
  catalog_cents: z.number().int().min(0).nullable(),
});

/**
 * Bills a lead for an add-on or on its own: an arrangement, a delivery. The invoice gets its own page
 * in the app, and the client gets Sukii's letter from gmail with a button to it.
 */
export const sendInquiryInvoice = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: z.string().uuid(),
        items: z.array(item).min(1).max(40),
        courtesy_cents: z.number().int().min(0),
        pay_in_full: z.boolean(),
        letter: z.string().trim().min(1).max(8000),
        /** "Booking for … per approved proposal." */
        booking: z.string().trim().max(300).optional(),
        /** the saved subject, with {invoice} where the number goes */
        subject: z.string().trim().max(300).optional(),
        to: z.array(z.string().trim().email().max(200)).max(12).optional().default([]),
        cc: z.array(z.string().trim().email().max(200)).max(12).optional().default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const subtotal = data.items.reduce((sum, line) => sum + line.unit_cents * line.quantity, 0);
    if (subtotal <= 0) throw new Error("add a price to the items first.");
    if (data.courtesy_cents >= subtotal)
      throw new Error("the courtesy discount has to stay under the total.");
    const total = subtotal - data.courtesy_cents;
    const dueNow = data.pay_in_full ? total : Math.round(total / 2);

    const inquiry = await context.supabase
      .from("inquiries")
      .select("id, client_id, event_date, event_date_tbd")
      .eq("id", data.inquiry_id)
      .eq("archived", false)
      .single();
    if (inquiry.error) throw new Error(inquiry.error.message);
    const person = await context.supabase
      .from("clients")
      .select("name, email")
      .eq("id", inquiry.data.client_id)
      .single();
    if (person.error) throw new Error(person.error.message);
    if (!person.data.email)
      throw new Error("this client needs an email address before you can invoice them.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { claimInvoiceNumber } = await import("@/lib/os/invoice-number.server");
    const number = await claimInvoiceNumber();

    // the invoice gets its own page in the app, paid in the same pop-up as a proposal's;
    // square sees the payment as an itemized order numbered like the invoice (SS-751)
    const { createPublicToken } = await import("@/lib/os/crypto.server");
    const { publicOrigin } = await import("@/lib/os/proposals.functions");
    const { token } = createPublicToken();
    const pageUrl = `${publicOrigin()}/invoice/${token}`;

    const saved = await context.supabase.from("inquiry_invoices").insert({
      inquiry_id: data.inquiry_id,
      number,
      items: data.items as unknown as Json,
      subtotal_cents: subtotal,
      courtesy_cents: data.courtesy_cents,
      total_cents: total,
      due_now_cents: dueNow,
      pay_in_full: data.pay_in_full,
      access_token: token,
      booking: data.booking || null,
      public_url: pageUrl,
      status: "sent",
      created_by: context.profile.id,
    });
    if (saved.error) {
      throw new Error(
        /access_token|booking|payments/.test(saved.error.message)
          ? "Run the invoice pages migration in Supabase first."
          : saved.error.message,
      );
    }

    const { deliverLetter } = await import("@/lib/os/letter-send.server");
    try {
      await deliverLetter(context.supabase, {
        inquiryId: data.inquiry_id,
        body: `${fillTemplate(data.letter, { invoice: number })}\n\n[pay your invoice](${pageUrl})\n\n<3`,
        subject: fillTemplate(data.subject || "{invoice}", { invoice: number }),
        fresh: true,
        threadId: null,
        to: data.to,
        cc: data.cc,
        attachments: [],
        sender: signatureName(context.profile.full_name),
        createdBy: context.profile.id,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "gmail didn't answer";
      throw new Error(
        `${number} is saved, but the letter didn't send (${reason}). copy the pay link from the invoice tab.`,
      );
    }
    return { number, url: pageUrl };
  });
