import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { pushProjectToGoogleCalendar } from "@/lib/os/google.server";
import type { SquareCompletedPayment } from "@/lib/os/square.server";

/**
 * A completed square payment: mark it paid, open the project, and tell the client their date is held.
 * The client's page and square's webhook both report the same payment, so every step is safe twice.
 */
export async function settleSquarePayment(
  payment: SquareCompletedPayment,
  options: { receiptEmail?: string | null } = {},
) {
  if (!payment.order_id) throw new Error("Square payment is missing an order");
  if (await settleLeadInvoice(payment, options)) return;
  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("invoices")
    .select("*, proposals(*, clients(name, email))")
    .eq("square_order_id", payment.order_id)
    .maybeSingle();
  if (invoiceError) throw new Error(invoiceError.message);
  // a sale at the register or anything else square sends that the studio didn't bill here
  if (!invoice) return;

  // the second report of the same payment (the page, then square's webhook) changes nothing
  const { data: known } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("square_payment_id", payment.id)
    .maybeSingle();
  if (known) return;

  const amount = Number(payment.amount_money?.amount ?? invoice.amount_cents);
  const paidAt = payment.updated_at ?? new Date().toISOString();
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
        paid_at: paidAt,
        raw_payload: payment as unknown as Json,
      },
      { onConflict: "square_payment_id" },
    )
    .select("id")
    .single();
  if (paymentError) throw new Error(paymentError.message);

  const { data: projectId, error: projectError } = await supabaseAdmin.rpc(
    "create_project_from_paid_deposit",
    { p_payment_id: paymentRow.id },
  );
  if (projectError) throw new Error(projectError.message);

  // the receipt (and, when this booked the project, the signed agreement) to the client,
  // and a note to the studio
  const { count: before } = await supabaseAdmin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", invoice.proposal_id)
    .eq("status", "completed")
    .neq("id", paymentRow.id);
  const { sendPaidLetters } = await import("@/lib/os/proposals.functions");
  await sendPaidLetters(invoice.proposal_id, {
    amountCents: amount,
    paidAt,
    booking: !before,
    receiptEmail: options.receiptEmail ?? null,
  }).catch((error: unknown) =>
    console.error("[square paid] the paid letters did not all send:", error),
  );

  // the inquiry's summary now says they're booked
  const inquiryId = (invoice.proposals as { inquiry_id?: string } | null)?.inquiry_id;
  if (inquiryId) {
    const { refreshInquirySummarySafe } = await import("@/lib/os/inquiry-summary.server");
    await refreshInquirySummarySafe(supabaseAdmin, inquiryId);
  }

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

/**
 * A lead's own invoice. One paid on its page in the app is kept payment by payment, each once; an
 * older one sent through square's invoice page asks square where it stands instead.
 */
async function settleLeadInvoice(
  payment: SquareCompletedPayment,
  options: { receiptEmail?: string | null },
) {
  const { data: row, error } = await supabaseAdmin
    .from("inquiry_invoices")
    .select("id, square_invoice_id, inquiry_id")
    .eq("square_order_id", payment.order_id!)
    .maybeSingle();
  if (error || !row) return false;
  if (!row.square_invoice_id) {
    const { settleInquiryInvoicePayment } = await import("@/lib/os/invoice-paid.server");
    await settleInquiryInvoicePayment(row.id, payment, options);
    return true;
  }
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
