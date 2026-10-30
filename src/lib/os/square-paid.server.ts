import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { renderSaySukiiEmail } from "@/lib/os/email-layout";
import { sendStudioEmail } from "@/lib/os/email.server";
import { pushProjectToGoogleCalendar } from "@/lib/os/google.server";
import type { SquareCompletedPayment } from "@/lib/os/square.server";

/**
 * A completed square payment: mark it paid, open the project, and tell the client their date is held.
 * The client's page and square's webhook both report the same payment, so every step is safe twice.
 */
export async function settleSquarePayment(payment: SquareCompletedPayment) {
  if (!payment.order_id) throw new Error("Square payment is missing an order");
  if (await settleLeadInvoice(payment.order_id)) return;
  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("invoices")
    .select("*, proposals(*, clients(name, email))")
    .eq("square_order_id", payment.order_id)
    .maybeSingle();
  if (invoiceError) throw new Error(invoiceError.message);
  // a sale at the register or anything else square sends that the studio didn't bill here
  if (!invoice) return;

  const amount = Number(payment.amount_money?.amount ?? invoice.amount_cents);
  const { data: paymentRow, error: paymentError } = await supabaseAdmin
    .from("payments")
    .upsert(
      {
        proposal_id: invoice.proposal_id,
        invoice_id: invoice.id,
        square_payment_id: payment.id,
        square_order_id: payment.order_id,
        amount_cents: amount,
        status: "completed",
        paid_at: payment.updated_at ?? new Date().toISOString(),
        raw_payload: payment as unknown as Json,
      },
      { onConflict: "square_payment_id" },
    )
    .select("id")
    .single();
  if (paymentError) throw new Error(paymentError.message);

  const { data: booked } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("proposal_id", invoice.proposal_id)
    .maybeSingle();
  const { data: projectId, error: projectError } = await supabaseAdmin.rpc(
    "create_project_from_paid_deposit",
    { p_payment_id: paymentRow.id },
  );
  if (projectError) throw new Error(projectError.message);

  // the second report of the same payment finds the project already open, and stays quiet
  if (booked) return;

  const proposal = invoice.proposals as unknown as {
    number: string;
    clients: { name: string; email: string };
  };
  await sendStudioEmail({
    to: proposal.clients.email,
    subject: `your date is held · ${proposal.number}`,
    eventType: "deposit_received",
    referenceType: "proposal",
    referenceId: invoice.proposal_id,
    html: renderSaySukiiEmail({
      eyebrow: "deposit",
      eyebrowColor: "#6F8A72",
      headline: "your date is held",
      body: `thank you, ${proposal.clients.name}. your deposit is complete and your project has moved into the studio.`,
      facts: [{ label: "proposal", value: proposal.number }],
    }),
  });

  if (projectId) {
    void pushProjectToGoogleCalendar(projectId).catch(async (error) => {
      await supabaseAdmin.from("integration_events").insert({
        provider: "google",
        event_type: "calendar_create",
        status: "failed",
        reference_type: "project",
        reference_id: projectId,
        error_message: error instanceof Error ? error.message : String(error),
        attempts: 1,
      });
    });
  }
}

/** A lead's own invoice: ask square where it stands rather than adding payments up, so a repeated event can't count twice. */
async function settleLeadInvoice(orderId: string) {
  const { data: row, error } = await supabaseAdmin
    .from("inquiry_invoices")
    .select("id, square_invoice_id, inquiry_id")
    .eq("square_order_id", orderId)
    .maybeSingle();
  if (error || !row?.square_invoice_id) return false;
  const { readSquareInvoice } = await import("@/lib/os/square.server");
  const square = await readSquareInvoice(row.square_invoice_id);
  const status =
    square.status === "PAID" ? "paid" : square.status === "PARTIALLY_PAID" ? "deposit_paid" : null;
  await supabaseAdmin
    .from("inquiry_invoices")
    .update({
      paid_cents: square.paidCents,
      ...(status ? { status } : {}),
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    })
    .eq("id", row.id);
  const { refreshInquirySummarySafe } = await import("@/lib/os/inquiry-summary.server");
  await refreshInquirySummarySafe(supabaseAdmin, row.inquiry_id);
  return true;
}
