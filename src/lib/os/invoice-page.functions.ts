import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CONVENIENCE_FEE_LABEL, convenienceFee, paymentFee } from "@/lib/convenience-fee";
import { invoiceTitle, squareInvoiceNumber } from "@/lib/invoice-title";
import { invoiceDueNow, invoiceItemRows } from "@/lib/os/invoice-paid.server";

const tokenInput = z.object({ token: z.string().min(32).max(200) });

async function invoiceByToken(token: string) {
  const { data, error } = await supabaseAdmin
    .from("inquiry_invoices")
    .select("*, inquiries(event_date, clients(name, email))")
    .eq("access_token", token)
    .neq("status", "canceled")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This invoice isn't available.");
  return data;
}

/** An add-on invoice as its client sees it, on its own page. */
export const getInvoicePage = createServerFn({ method: "GET" })
  .validator((input: unknown) => tokenInput.parse(input))
  .handler(async ({ data }) => {
    const row = await invoiceByToken(data.token);
    const inquiry = row.inquiries as unknown as {
      event_date: string | null;
      clients: { name: string; email: string | null } | null;
    } | null;
    const payments = (row.payments ?? []) as Array<{ fee_cents?: number }>;
    const carriesFee =
      row.paid_cents === 0 || payments.some((payment) => (payment.fee_cents ?? 0) > 0);
    return {
      number: invoiceTitle(row.number),
      clientName: inquiry?.clients?.name ?? "",
      clientEmail: inquiry?.clients?.email ?? "",
      eventDate: inquiry?.event_date ?? null,
      booking: row.booking ?? null,
      items: invoiceItemRows(row.items).map((item) => ({
        name: item.name || "Custom item",
        note: item.note ?? null,
        quantity: item.quantity ?? 1,
        unitCents: item.unit_cents ?? 0,
      })),
      subtotalCents: row.subtotal_cents,
      courtesyCents: row.courtesy_cents,
      totalCents: row.total_cents,
      paidCents: row.paid_cents,
      dueCents: Math.max(0, invoiceDueNow(row)),
      // the 4% convenience fee: on the whole, and on what's due now. an invoice already paid
      // before the fee began keeps reading as it was paid
      feeCents: carriesFee ? convenienceFee(row.total_cents) : 0,
      dueFeeCents: carriesFee ? paymentFee(Math.max(0, invoiceDueNow(row)), row.paid_cents) : 0,
      feePaidCents: carriesFee ? convenienceFee(row.paid_cents) : 0,
      payInFull: row.pay_in_full,
      sentAt: row.sent_at,
    };
  });

/**
 * Pays an add-on invoice from its page: an itemized square order numbered like the invoice
 * (SS-751), the card or apple pay charge, then the receipt.
 */
export const payInquiryInvoice = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenInput
      .extend({
        source_id: z.string().trim().min(1).max(500),
        verification_token: z.string().trim().max(4000).optional(),
        receipt_email: z.string().trim().email().max(320).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const row = await invoiceByToken(data.token);
    const due = invoiceDueNow(row);
    if (!(due > 0)) return { paid: true as const };
    const number = invoiceTitle(row.number);
    const items = invoiceItemRows(row.items);
    const firstPayment = row.paid_cents === 0;
    // the card carries the 4% convenience fee, its own line in square
    const fee = paymentFee(due, row.paid_cents);
    const charge = due + fee;
    // paying it all at once lists every item; a deposit or the rest after it is one clear line
    const itemized = firstPayment && due === row.total_cents;
    const { createSquareOrder, createSquareCardPayment } = await import("./square.server");
    const order = await createSquareOrder({
      idempotencyKey: `addon-${row.id}-${row.paid_cents}-${charge}`.slice(0, 45),
      referenceId: squareInvoiceNumber(number),
      ...(itemized
        ? {
            lines: [
              ...items.map((item) => {
                const quantity = item.quantity ?? 1;
                return {
                  name: `${item.name || "Custom item"}${quantity > 1 ? ` × ${quantity}` : ""}`,
                  ...(item.note ? { note: item.note } : {}),
                  amountCents: (item.unit_cents ?? 0) * quantity,
                };
              }),
              { name: CONVENIENCE_FEE_LABEL, amountCents: fee },
            ],
            discountCents: row.courtesy_cents,
          }
        : {
            lines: [
              {
                name: firstPayment ? `Deposit · ${number}` : `Balance · ${number}`,
                ...(row.booking ? { note: row.booking } : {}),
                amountCents: due,
              },
              { name: CONVENIENCE_FEE_LABEL, amountCents: fee },
            ],
          }),
    });
    if (order.totalCents !== charge)
      throw new Error("The amount due changed. Reload and try again.");
    await supabaseAdmin
      .from("inquiry_invoices")
      .update({ square_order_id: order.orderId })
      .eq("id", row.id);

    let payment;
    try {
      payment = await createSquareCardPayment({
        sourceId: data.source_id,
        verificationToken: data.verification_token,
        idempotencyKey: crypto.randomUUID(),
        amountCents: charge,
        orderId: order.orderId,
        referenceId: number,
        buyerEmail: data.receipt_email ?? null,
        note: `${number} · add-on`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      throw new Error(
        /declin|insufficient|cvv|expir|verification/i.test(detail)
          ? "That card wasn't accepted. Check the details or try another card."
          : "The payment didn't go through. Nothing was charged, so you can try again.",
      );
    }
    if (payment.status !== "COMPLETED") {
      return { paid: false as const, status: payment.status ?? "PENDING" };
    }
    const { settleInquiryInvoicePayment } = await import("./invoice-paid.server");
    await settleInquiryInvoicePayment(row.id, payment, {
      receiptEmail: data.receipt_email ?? null,
      baseCents: due,
      feeCents: fee,
    });
    return { paid: true as const };
  });
