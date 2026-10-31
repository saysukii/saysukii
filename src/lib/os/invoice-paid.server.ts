import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { InquiryInvoicePayment, InquiryInvoiceRow, Json } from "@/integrations/supabase/types";
import { convenienceFee, splitCharge, withFee } from "@/lib/convenience-fee";
import { discountLabel } from "@/lib/discount";
import { floralPackageName } from "@/lib/floral-agreement";
import { invoiceTitle } from "@/lib/invoice-title";
import type { SquareCompletedPayment } from "@/lib/os/square.server";

export type InvoiceItemRow = {
  name?: string;
  note?: string | null;
  quantity?: number;
  unit_cents?: number;
};

export function invoiceItemRows(items: Json): InvoiceItemRow[] {
  return Array.isArray(items) ? (items as InvoiceItemRow[]) : [];
}

/** what's due next on an add-on invoice: the deposit first, then the rest */
export function invoiceDueNow(
  row: Pick<InquiryInvoiceRow, "paid_cents" | "due_now_cents" | "total_cents">,
) {
  return row.paid_cents > 0 ? row.total_cents - row.paid_cents : row.due_now_cents;
}

/**
 * A payment on an add-on invoice, from its own page or square's webhook: kept once on the invoice,
 * then the receipt to the client (filed with them) and a note to the studio. Safe to run twice.
 */
export async function settleInquiryInvoicePayment(
  invoiceId: string,
  payment: SquareCompletedPayment,
  options: {
    receiptEmail?: string | null;
    baseCents?: number;
    feeCents?: number;
    /** marked paid by the studio: how it came, "Zelle" */
    method?: string;
    /** false when the studio marks it paid without emailing a receipt */
    sendReceipt?: boolean;
  } = {},
) {
  const { data: row, error } = await supabaseAdmin
    .from("inquiry_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (error) throw new Error(error.message);
  const kept = (row.payments ?? []) as InquiryInvoicePayment[];
  if (kept.some((item) => item.square_payment_id === payment.id)) return;

  const { paidWith } = await import("./proposals.functions");
  // what the card was charged, taken apart: what it paid toward the invoice, and the 4% fee
  const charged = Number(payment.amount_money?.amount ?? 0);
  const split =
    options.baseCents != null
      ? { baseCents: options.baseCents, feeCents: options.feeCents ?? 0 }
      : splitCharge(charged, row.paid_cents);
  const amount = split.baseCents;
  const paidAt = payment.updated_at ?? new Date().toISOString();
  const payments = [
    ...kept,
    {
      square_payment_id: payment.id,
      amount_cents: amount,
      fee_cents: split.feeCents,
      paid_at: paidAt,
      method: options.method ?? paidWith(payment),
    },
  ];
  const paidCents = payments.reduce((sum, item) => sum + item.amount_cents, 0);
  const inFull = paidCents >= row.total_cents;
  const { error: saveError } = await supabaseAdmin
    .from("inquiry_invoices")
    .update({
      payments,
      paid_cents: paidCents,
      status: inFull ? "paid" : "deposit_paid",
      ...(inFull ? { paid_at: paidAt } : {}),
    })
    .eq("id", row.id);
  if (saveError) throw new Error(saveError.message);

  if (options.sendReceipt !== false) {
    await sendInvoiceReceipt(
      { ...row, paid_cents: paidCents },
      payments,
      amount,
      paidAt,
      options,
    ).catch((letterError: unknown) =>
      console.error("[add-on paid] the receipt did not all send:", letterError),
    );
  }
  const { refreshInquirySummarySafe } = await import("./inquiry-summary.server");
  await refreshInquirySummarySafe(supabaseAdmin, row.inquiry_id);
}

async function sendInvoiceReceipt(
  row: InquiryInvoiceRow,
  payments: InquiryInvoicePayment[],
  amount: number,
  paidAt: string,
  options: { receiptEmail?: string | null },
) {
  const { data: inquiry, error } = await supabaseAdmin
    .from("inquiries")
    .select("id, client_id, event_type, event_date, venue_text, clients(name, email, phone)")
    .eq("id", row.inquiry_id)
    .single();
  if (error) throw new Error(error.message);
  const client = inquiry.clients as unknown as {
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  const number = invoiceTitle(row.number);
  const items = invoiceItemRows(row.items);
  const {
    letterDate,
    clientPaidHtml,
    clientPaidSubject,
    paidText,
    sendClientLetter,
    studioPaidHtml,
    studioPaidSubject,
  } = await import("./paid-email.server");
  const { renderReceiptPdf } = await import("@/lib/pdf.server");
  const left = Math.max(0, row.total_cents - row.paid_cents);
  // once its payments carry the 4% convenience fee, the receipt shows it
  const carriesFee = payments.some((item) => (item.fee_cents ?? 0) > 0);
  const receipt = await renderReceiptPdf({
    number,
    title: [
      items.length === 1 && items[0]?.name ? items[0].name : "Floral Add-Ons",
      letterDate(inquiry.event_date),
    ]
      .filter(Boolean)
      .join(" "),
    booking: row.booking ?? null,
    client: {
      name: client?.name ?? "",
      email: client?.email ?? null,
      phone: client?.phone ?? null,
    },
    eventDate: inquiry.event_date ? letterDate(inquiry.event_date) : null,
    venue: inquiry.venue_text,
    items: [
      ...items.map((item) => {
        const quantity = item.quantity ?? 1;
        const unit = item.unit_cents ?? 0;
        return {
          name: item.name || "Custom item",
          qty: quantity,
          unitPriceCents: unit,
          lineTotalCents: unit * quantity,
          ...(item.note ? { details: [item.note] } : {}),
        };
      }),
      ...(row.courtesy_cents > 0
        ? [
            {
              name: (() => {
                const label = discountLabel(
                  row.discount_label,
                  row.discount_percent,
                  "Courtesy discount",
                );
                return label.charAt(0).toUpperCase() + label.slice(1);
              })(),
              qty: 1,
              unitPriceCents: -row.courtesy_cents,
              lineTotalCents: -row.courtesy_cents,
            },
          ]
        : []),
    ],
    totalCents: row.total_cents,
    ...(carriesFee ? { feeCents: convenienceFee(row.total_cents) } : {}),
    payments: payments.map((item) => ({
      amountCents: item.amount_cents + (item.fee_cents ?? 0),
      paidOn: letterDate(item.paid_at),
      method: item.method,
    })),
    balance:
      left > 0
        ? { amountCents: carriesFee ? withFee(left, row.paid_cents) : left, due: null }
        : null,
    createdOn: letterDate(new Date().toISOString()),
  });
  const files = [
    { name: `Say Sukii receipt ${number}.pdf`, type: "application/pdf", data: receipt },
  ];

  // into the client's file, beside the proposal's documents
  const { fileForClient } = await import("./proposals.functions");
  await fileForClient(
    { clientId: inquiry.client_id, inquiryId: inquiry.id },
    `say-sukii-receipt-${number}.pdf`,
    receipt,
  ).catch((fileError: unknown) => console.error("[add-on paid] client file:", fileError));

  const letter = {
    ...(carriesFee ? { feeCents: payments.at(-1)?.fee_cents ?? 0 } : {}),
    clientName: client?.name ?? "",
    invoiceNumber: number,
    amountCents: amount,
    paidCents: row.paid_cents,
    totalCents: row.total_cents,
    booking: false,
    addOn: true,
    // what the add-on was: "bud vases", or "bud vases + candles + delivery"
    occasion:
      items
        .map((item) => item.name?.trim())
        .filter(Boolean)
        .join(" + ") || floralPackageName(inquiry.event_type).toLowerCase(),
    eventDate: inquiry.event_date,
    paidAt,
    inquiryId: inquiry.id,
    eventType: inquiry.event_type,
  };
  const to = options.receiptEmail || client?.email;
  if (to) {
    const subject = clientPaidSubject(letter);
    const html = clientPaidHtml(letter);
    const result = await sendClientLetter({
      to,
      subject,
      html,
      text: paidText(letter),
      attachments: files,
    });
    await supabaseAdmin.from("integration_events").insert({
      provider: "studio",
      event_type: "paid_letter",
      status: result.sent ? "succeeded" : "failed",
      reference_type: "inquiry_invoice",
      reference_id: row.id,
      attempts: 1,
      payload: { to, amount_cents: amount, subject, html },
    });
  }
  const { deliverStudioNotice } = await import("./inquiry-email.server");
  await deliverStudioNotice(
    studioPaidSubject(letter),
    studioPaidHtml(letter),
    paidText(letter),
    files,
  );
}
