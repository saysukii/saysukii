import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import { BOOK_DETECTION_STATUSES } from "@/lib/os/inquiry-detection";
import type {
  ClientRow,
  InquiryRow,
  ProposalLineItemRow,
  ProposalRow,
  VenueRow,
} from "@/integrations/supabase/types";
import { buildAgreementContent } from "@/lib/agreement-templates";
import { renderAgreementPdf, renderInvoicePdf, renderProposalPdf } from "@/lib/pdf.server";
import { createPublicToken, hashToken } from "./crypto.server";
import { emailFrame, escapeHtml, sendStudioEmail } from "./email.server";
import { createSquarePaymentLink } from "./square.server";
import { syncInquiryAutoTaskFor } from "@/lib/os/tasks.functions";
import { refreshInquirySummarySafe } from "@/lib/os/inquiry-summary.server";

const lineItemInput = z.object({
  arrangement_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["arrangement", "labor", "delivery", "install", "breakdown", "custom"]),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(800).nullable().optional(),
  quantity: z.number().positive().max(10000),
  unit_price_cents: z.number().int().min(0),
});

const proposalInput = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  inquiry_id: z.string().uuid(),
  event_date: z.string().nullable().optional(),
  venue_id: z.string().uuid().nullable().optional(),
  venue_text: z.string().trim().max(240).nullable().optional(),
  tax_cents: z.number().int().min(0).default(0),
  deposit_percent: z.number().min(0).max(100).nullable().optional().default(50),
  vision_board_url: z.string().url().nullable().optional().or(z.literal("")),
  vision_image_paths: z.array(z.string().max(500)).max(12).default([]),
  notes: z.string().trim().max(4000).nullable().optional(),
  valid_until: z.string().nullable().optional(),
  line_items: z.array(lineItemInput).min(1).max(100),
});

export const listProposals = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("proposals")
      .select("*, clients(name, email), inquiries(event_type)")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const proposalBuilderData = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const [clients, inquiries, arrangements, venues] = await Promise.all([
      context.supabase.from("clients").select("*").eq("archived", false).order("name"),
      context.supabase
        .from("inquiries")
        .select("*, clients(name, email)")
        .eq("archived", false)
        .in("status", ["new", "contacted", "in_conversation"])
        .in("detection_status", BOOK_DETECTION_STATUSES)
        .order("received_at"),
      context.supabase.from("arrangements").select("*").eq("active", true).order("name"),
      context.supabase.from("venues").select("*").eq("archived", false).order("name"),
    ]);
    for (const result of [clients, inquiries, arrangements, venues]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      clients: clients.data ?? [],
      inquiries: inquiries.data ?? [],
      arrangements: arrangements.data ?? [],
      venues: venues.data ?? [],
    };
  });

export const getProposal = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: proposal, error } = await context.supabase
      .from("proposals")
      .select(
        "*, clients(*), inquiries(*), venues(*), proposal_line_items(*), agreements(*), invoices(*)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proposal) throw new Error("Proposal not found");
    return proposal;
  });

export const saveProposal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => proposalInput.parse(input))
  .handler(async ({ data, context }) => {
    const subtotal = data.line_items.reduce(
      (sum, item) => sum + Math.round(item.quantity * item.unit_price_cents),
      0,
    );
    const total = subtotal + data.tax_cents;
    const deposit = Math.round(total * ((data.deposit_percent ?? 50) / 100));
    let proposalId = data.id;

    if (proposalId) {
      const { error } = await context.supabase
        .from("proposals")
        .update({
          client_id: data.client_id,
          inquiry_id: data.inquiry_id,
          event_date: data.event_date || null,
          venue_id: data.venue_id || null,
          venue_text: data.venue_text || null,
          subtotal_cents: subtotal,
          tax_cents: data.tax_cents,
          total_cents: total,
          deposit_percent: data.deposit_percent,
          deposit_amount_cents: deposit,
          vision_board_url: data.vision_board_url || null,
          vision_image_paths: data.vision_image_paths,
          notes: data.notes || null,
          valid_until: data.valid_until || null,
        })
        .eq("id", proposalId)
        .eq("status", "draft");
      if (error) throw new Error(error.message);
      const { error: deleteError } = await context.supabase
        .from("proposal_line_items")
        .delete()
        .eq("proposal_id", proposalId);
      if (deleteError) throw new Error(deleteError.message);
    } else {
      const { data: number, error: numberError } = await supabaseAdmin.rpc("next_proposal_number");
      if (numberError) throw new Error(numberError.message);
      const { data: proposal, error } = await context.supabase
        .from("proposals")
        .insert({
          number,
          client_id: data.client_id,
          inquiry_id: data.inquiry_id,
          event_date: data.event_date || null,
          venue_id: data.venue_id || null,
          venue_text: data.venue_text || null,
          subtotal_cents: subtotal,
          tax_cents: data.tax_cents,
          total_cents: total,
          deposit_percent: data.deposit_percent,
          deposit_amount_cents: deposit,
          vision_board_url: data.vision_board_url || null,
          vision_image_paths: data.vision_image_paths,
          notes: data.notes || null,
          valid_until: data.valid_until || null,
          created_by: context.profile.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      proposalId = proposal.id;
    }

    const rows = data.line_items.map((item, index) => ({
      proposal_id: proposalId,
      arrangement_id: item.arrangement_id ?? null,
      kind: item.kind,
      label: item.label,
      description: item.description || null,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: Math.round(item.quantity * item.unit_price_cents),
      snapshot: {
        label: item.label,
        description: item.description ?? null,
        unit_price_cents: item.unit_price_cents,
      },
      sort_order: index,
    }));
    const { error: itemsError } = await context.supabase.from("proposal_line_items").insert(rows);
    if (itemsError) throw new Error(itemsError.message);
    await refreshInquirySummarySafe(context.supabase, data.inquiry_id);
    return { id: proposalId };
  });

export const sendProposal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleById(data.id);
    if (bundle.proposal.status !== "draft") throw new Error("Only drafts can be sent");
    if (!bundle.proposal.event_date) throw new Error("Add an event date before sending");

    const token = createPublicToken();
    const pdf = await renderProposal(bundle);
    const pdfPath = `${bundle.proposal.id}/proposal-${bundle.proposal.number}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const sentAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("proposals")
      .update({
        status: "sent",
        access_token_hash: token.hash,
        access_token_prefix: token.prefix,
        pdf_path: pdfPath,
        sent_at: sentAt,
      })
      .eq("id", bundle.proposal.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("inquiries")
      .update({ status: "proposal_sent", proposal_sent_at: sentAt })
      .eq("id", bundle.proposal.inquiry_id);
    await syncInquiryAutoTaskFor(supabaseAdmin, bundle.proposal.inquiry_id);
    await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);

    const url = `${appUrl()}/proposal/${token.token}`;
    await sendStudioEmail({
      to: bundle.client.email,
      subject: `Your Say Sukii proposal · ${bundle.proposal.number}`,
      eventType: "proposal_sent",
      referenceType: "proposal",
      referenceId: bundle.proposal.id,
      html: emailFrame(
        "Your proposal is ready.",
        `<p>Hi ${escapeHtml(bundle.client.name)},</p><p>Your Say Sukii floral proposal is ready to view.</p>`,
        { label: "View your proposal", url },
      ),
    });
    return { url };
  });

export const getPublicProposal = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(32) }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (!bundle.proposal.viewed_at) {
      await supabaseAdmin
        .from("proposals")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", bundle.proposal.id)
        .is("viewed_at", null);
      void refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);
    }
    const pdfUrl = bundle.proposal.pdf_path
      ? (
          await supabaseAdmin.storage
            .from("documents")
            .createSignedUrl(bundle.proposal.pdf_path, 60 * 15)
        ).data?.signedUrl
      : null;
    return {
      proposal: publicProposal(bundle.proposal),
      client: { name: bundle.client.name },
      venue: bundle.venue ? { name: bundle.venue.name, address: bundle.venue.address } : null,
      items: bundle.items.map(
        ({ label, description, quantity, unit_price_cents, line_total_cents }) => ({
          label,
          description,
          quantity,
          unit_price_cents,
          line_total_cents,
        }),
      ),
      pdfUrl,
    };
  });

export const acceptPublicProposal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(32) }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (!["sent", "viewed"].includes(bundle.proposal.status)) {
      if (bundle.proposal.status === "accepted") return existingAcceptance(bundle.proposal.id);
      throw new Error("This proposal can no longer be accepted");
    }
    if (!bundle.proposal.event_date) throw new Error("The proposal needs an event date");

    const acceptedAt = new Date().toISOString();
    await supabaseAdmin
      .from("proposals")
      .update({ status: "accepted", accepted_at: acceptedAt })
      .eq("id", bundle.proposal.id);
    await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);

    const agreementContent = buildAgreementContent("standard", {
      clientName: bundle.client.name,
      contactName: null,
      projectTitle: eventLabel(bundle.inquiry.event_type),
      eventDate: bundle.proposal.event_date,
      venue: bundle.venue?.name ?? bundle.proposal.venue_text,
      totalCents: bundle.proposal.total_cents,
      depositCents: bundle.proposal.deposit_amount_cents,
      proposalNumber: bundle.proposal.number,
    });
    const { data: invoiceNumber, error: numberError } =
      await supabaseAdmin.rpc("next_invoice_number");
    if (numberError) throw new Error(numberError.message);

    const [agreementPdf, invoicePdf] = await Promise.all([
      renderAgreementPdf({
        meta: documentMeta(bundle, "Agreement", bundle.proposal.number),
        typeLabel: "Standard Service Agreement",
        version: 1,
        content: agreementContent,
      }),
      renderInvoicePdf({
        meta: documentMeta(bundle, "Invoice", invoiceNumber),
        items: pdfItems(bundle.items),
        amountCents: bundle.proposal.total_cents,
        depositCents: bundle.proposal.deposit_amount_cents,
        balanceCents: bundle.proposal.total_cents - bundle.proposal.deposit_amount_cents,
        dueDate: null,
        paymentLink: null,
      }),
    ]);
    const agreementPath = `${bundle.proposal.id}/agreement-${bundle.proposal.number}.pdf`;
    const invoicePath = `${bundle.proposal.id}/invoice-${invoiceNumber}.pdf`;
    await uploadDocument(agreementPath, agreementPdf);
    await uploadDocument(invoicePath, invoicePdf);

    await supabaseAdmin.from("agreements").upsert(
      {
        proposal_id: bundle.proposal.id,
        content: agreementContent,
        version: 1,
        pdf_path: agreementPath,
      },
      { onConflict: "proposal_id" },
    );
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .upsert(
        {
          proposal_id: bundle.proposal.id,
          number: invoiceNumber,
          amount_cents: bundle.proposal.deposit_amount_cents,
          status: "unpaid",
          pdf_path: invoicePath,
        },
        { onConflict: "proposal_id" },
      )
      .select("*")
      .single();
    if (invoiceError) throw new Error(invoiceError.message);

    let paymentLink: string | null = null;
    try {
      const square = await createSquarePaymentLink({
        idempotencyKey: `proposal-${bundle.proposal.id}`,
        label: `Say Sukii deposit · ${bundle.proposal.number}`,
        amountCents: bundle.proposal.deposit_amount_cents,
      });
      paymentLink = square.url;
      await supabaseAdmin
        .from("invoices")
        .update({ square_payment_link: square.url, square_order_id: square.orderId })
        .eq("id", invoice.id);
    } catch (error) {
      await supabaseAdmin.from("integration_events").insert({
        provider: "square",
        event_type: "payment_link_create",
        status: "failed",
        reference_type: "proposal",
        reference_id: bundle.proposal.id,
        error_message: error instanceof Error ? error.message : String(error),
        attempts: 1,
      });
    }

    await sendStudioEmail({
      to: bundle.client.email,
      subject: `Your Say Sukii agreement and deposit · ${bundle.proposal.number}`,
      eventType: "proposal_accepted",
      referenceType: "proposal",
      referenceId: bundle.proposal.id,
      html: emailFrame(
        "Your date is almost reserved.",
        "<p>Thank you for accepting your proposal. Complete the deposit to move your event into production.</p>",
        paymentLink ? { label: "Pay the deposit", url: paymentLink } : undefined,
      ),
    });
    return { accepted: true, paymentLink };
  });

export const declinePublicProposal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(32), reason: z.string().max(1000).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (!["sent", "viewed"].includes(bundle.proposal.status)) {
      throw new Error("This proposal can no longer be declined");
    }
    const { error } = await supabaseAdmin
      .from("proposals")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        declined_reason: data.reason ?? null,
      })
      .eq("id", bundle.proposal.id);
    if (error) throw new Error(error.message);
    await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);
    return { declined: true };
  });

type ProposalBundle = {
  proposal: ProposalRow;
  client: ClientRow;
  inquiry: InquiryRow;
  venue: VenueRow | null;
  items: ProposalLineItemRow[];
};

async function loadProposalBundleById(id: string): Promise<ProposalBundle> {
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("*, clients(*), inquiries(*), venues(*), proposal_line_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Proposal not found");
  return normalizeBundle(data);
}

async function loadProposalBundleByToken(token: string): Promise<ProposalBundle> {
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("*, clients(*), inquiries(*), venues(*), proposal_line_items(*)")
    .eq("access_token_hash", hashToken(token))
    .eq("archived", false)
    .maybeSingle();
  if (error || !data) throw new Error("Proposal not found");
  return normalizeBundle(data);
}

function normalizeBundle(value: unknown): ProposalBundle {
  const data = value as ProposalRow & {
    clients: ClientRow;
    inquiries: InquiryRow;
    venues: VenueRow | null;
    proposal_line_items: ProposalLineItemRow[];
  };
  return {
    proposal: data,
    client: data.clients,
    inquiry: data.inquiries,
    venue: data.venues,
    items: [...data.proposal_line_items].sort((a, b) => a.sort_order - b.sort_order),
  };
}

function publicProposal(proposal: ProposalRow) {
  return {
    number: proposal.number,
    event_date: proposal.event_date,
    venue_text: proposal.venue_text,
    subtotal_cents: proposal.subtotal_cents,
    tax_cents: proposal.tax_cents,
    total_cents: proposal.total_cents,
    deposit_amount_cents: proposal.deposit_amount_cents,
    vision_board_url: proposal.vision_board_url,
    notes: proposal.notes,
    valid_until: proposal.valid_until,
    status: proposal.status,
  };
}

function eventLabel(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function documentMeta(
  bundle: ProposalBundle,
  kind: "Proposal" | "Agreement" | "Invoice",
  number: string,
) {
  return {
    kind,
    number,
    clientName: bundle.client.name,
    contactName: null,
    projectTitle: eventLabel(bundle.inquiry.event_type),
    serviceLine: "Floral + experiential design",
    eventDate: bundle.proposal.event_date,
    venue: bundle.venue?.name ?? bundle.proposal.venue_text,
  };
}

function pdfItems(items: ProposalLineItemRow[]) {
  return items.map((item) => ({
    name: item.label,
    qty: item.quantity,
    unitPriceCents: item.unit_price_cents,
    lineTotalCents: item.line_total_cents,
  }));
}

function renderProposal(bundle: ProposalBundle) {
  return renderProposalPdf({
    meta: documentMeta(bundle, "Proposal", bundle.proposal.number),
    items: pdfItems(bundle.items),
    subtotalCents: bundle.proposal.subtotal_cents,
    totalCents: bundle.proposal.total_cents,
    depositCents: bundle.proposal.deposit_amount_cents,
    essenceCount: bundle.proposal.vision_image_paths.length,
  });
}

async function uploadDocument(path: string, bytes: Uint8Array) {
  const { error } = await supabaseAdmin.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);
}

async function existingAcceptance(proposalId: string) {
  const { data } = await supabaseAdmin
    .from("invoices")
    .select("square_payment_link")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  return { accepted: true, paymentLink: data?.square_payment_link ?? null };
}

function appUrl() {
  return (process.env["APP_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
}
