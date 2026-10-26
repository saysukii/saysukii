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
import { invoiceTitle } from "@/lib/invoice-title";
import { proposalLink } from "@/lib/proposal-link";
import {
  courtesyFromNotes,
  floralPackageName,
  invoiceBookingLine,
  invoiceDateLabel,
  invoiceSharedDate,
  statementFromNotes,
  statementNotes,
  statementOfWork,
} from "@/lib/floral-agreement";
import { renderAgreementPdf, renderInvoicePdf } from "@/lib/pdf.server";
import { createPublicToken, hashToken } from "./crypto.server";
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
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => proposalInput.parse(input))
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

const statementInput = z.object({
  flowers: z.string().max(500),
  delivery: z.string().max(500),
  taxes: z.string().max(500),
  rentals: z.string().max(500),
  rentalDeposit: z.string().max(500),
  eventWhen: z.string().max(500),
  occasion: z.string().max(500),
  venue: z.string().max(500),
});

const importInput = z
  .object({
    inquiry_id: z.string().uuid(),
    total_cents: z.number().int().min(0).max(100_000_000),
    deposit_percent: z.number().min(1).max(100).default(50),
    file_name: z.string().trim().min(1).max(200),
    pdf_base64: z.string().min(20).max(12_000_000).optional(),
    pdf_path: z.string().trim().min(1).max(500).optional(),
    statement: statementInput.optional(),
    courtesy_cents: z.number().int().min(0).max(100_000_000).default(0),
  })
  .refine((value) => Boolean(value.pdf_base64 || value.pdf_path), { message: "Choose the proposal PDF." });

export const importProposalPdf = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => importInput.parse(input))
  .handler(async ({ data, context }) => {
    const inquiryResult = await context.supabase
      .from("inquiries")
      .select("id, client_id, event_date, venue_id, venue_text")
      .eq("id", data.inquiry_id)
      .eq("archived", false)
      .single();
    if (inquiryResult.error) throw new Error(inquiryResult.error.message);
    const inquiry = inquiryResult.data;

    const existing = await context.supabase
      .from("proposals")
      .select("id, number, status, access_token, pdf_path")
      .eq("inquiry_id", inquiry.id)
      .eq("archived", false)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.status === "accepted") throw new Error("This proposal is already accepted.");

    let pdfBytes: Buffer | null = null;
    let copyFrom: string | null = null;
    if (data.pdf_path) {
      const incoming = data.pdf_path.startsWith(`${inquiry.id}/`) && !data.pdf_path.includes("..");
      const current = Boolean(existing.data?.pdf_path) && data.pdf_path === existing.data?.pdf_path;
      if (!incoming && !current) throw new Error("Choose the proposal PDF.");
      if (!current) copyFrom = data.pdf_path;
    } else if (data.pdf_base64) {
      pdfBytes = Buffer.from(data.pdf_base64, "base64");
    }
    if (pdfBytes) {
      if (pdfBytes.length < 5 || pdfBytes.subarray(0, 4).toString() !== "%PDF") {
        throw new Error("Choose the proposal PDF.");
      }
      if (pdfBytes.length > 50 * 1024 * 1024) throw new Error("That PDF is larger than 50MB.");
    } else if (!copyFrom && !existing.data?.pdf_path) {
      throw new Error("Choose the proposal PDF.");
    }

    const deposit = Math.round(data.total_cents * (data.deposit_percent / 100));
    const courtesy = Math.min(data.courtesy_cents, data.total_cents);
    const listCents = data.total_cents + courtesy;
    const notes = statementNotes(statementOfWork(data.statement), courtesy, data.file_name);
    const venueText = data.statement?.venue.trim() || inquiry.venue_text;
    let proposalId = existing.data?.id ?? "";
    let number = existing.data?.number ?? "";
    let tokenValue = existing.data?.access_token ?? "";

    if (!proposalId) {
      const { data: nextNumber, error: numberError } = await supabaseAdmin.rpc("next_proposal_number");
      if (numberError) throw new Error(numberError.message);
      number = nextNumber;
      const created = createPublicToken();
      tokenValue = created.token;
      const { data: proposal, error } = await context.supabase
        .from("proposals")
        .insert({
          number,
          client_id: inquiry.client_id,
          inquiry_id: inquiry.id,
          event_date: inquiry.event_date,
          venue_id: inquiry.venue_id,
          venue_text: venueText,
          subtotal_cents: listCents,
          tax_cents: 0,
          total_cents: data.total_cents,
          deposit_percent: data.deposit_percent,
          deposit_amount_cents: deposit,
          notes,
          access_token: tokenValue,
          access_token_hash: created.hash,
          access_token_prefix: created.prefix,
          created_by: context.profile.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      proposalId = proposal.id;
    } else if (!tokenValue) {
      const created = createPublicToken();
      tokenValue = created.token;
      const { error } = await context.supabase
        .from("proposals")
        .update({
          access_token: tokenValue,
          access_token_hash: created.hash,
          access_token_prefix: created.prefix,
        })
        .eq("id", proposalId);
      if (error) throw new Error(error.message);
    }

    const pdfPath = pdfBytes || copyFrom ? `${proposalId}/proposal-${number}.pdf` : (existing.data?.pdf_path ?? "");
    if (pdfBytes) await uploadDocument(pdfPath, pdfBytes);
    if (copyFrom && copyFrom !== pdfPath) {
      let copied = await supabaseAdmin.storage.from("documents").copy(copyFrom, pdfPath);
      if (copied.error && /exist|duplicate|already/i.test(copied.error.message)) {
        await supabaseAdmin.storage.from("documents").remove([pdfPath]);
        copied = await supabaseAdmin.storage.from("documents").copy(copyFrom, pdfPath);
      }
      if (copied.error) throw new Error(copied.error.message);
      await supabaseAdmin.storage.from("documents").remove([copyFrom]);
    }
    const patch: {
      event_date: string | null;
      venue_id: string | null;
      venue_text: string | null;
      subtotal_cents: number;
      tax_cents: number;
      total_cents: number;
      deposit_percent: number;
      deposit_amount_cents: number;
      pdf_path: string;
      notes?: string | null;
      status?: "draft";
      declined_at?: null;
      declined_reason?: null;
    } = {
      event_date: inquiry.event_date,
      venue_id: inquiry.venue_id,
      venue_text: venueText,
      subtotal_cents: listCents,
      tax_cents: 0,
      total_cents: data.total_cents,
      deposit_percent: data.deposit_percent,
      deposit_amount_cents: deposit,
      pdf_path: pdfPath,
      notes,
    };
    if (existing.data?.status === "declined") {
      patch.status = "draft";
      patch.declined_at = null;
      patch.declined_reason = null;
    }
    const { error: updateError } = await context.supabase.from("proposals").update(patch).eq("id", proposalId);
    if (updateError) throw new Error(updateError.message);
    const invoiceNumber = data.total_cents > 0 ? await ensureInvoiceNumber(proposalId, deposit) : null;
    await refreshInquirySummarySafe(context.supabase, inquiry.id);
    return {
      id: proposalId,
      number,
      token: tokenValue,
      total_cents: data.total_cents,
      deposit_amount_cents: deposit,
      invoice_number: invoiceNumber,
      pdf_path: pdfPath,
    };
  });

export const sendProposal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleById(data.id);
    if (!bundle.proposal.pdf_path) throw new Error("Import the proposal PDF before sending.");
    if (!["draft", "sent", "viewed"].includes(bundle.proposal.status)) {
      throw new Error("This proposal can no longer be sent.");
    }

    let tokenValue = bundle.proposal.access_token;
    if (!tokenValue) {
      const created = createPublicToken();
      tokenValue = created.token;
      const { error } = await supabaseAdmin
        .from("proposals")
        .update({
          access_token: tokenValue,
          access_token_hash: created.hash,
          access_token_prefix: created.prefix,
        })
        .eq("id", bundle.proposal.id);
      if (error) throw new Error(error.message);
    }

    if (bundle.proposal.status === "draft") {
      const sentAt = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("proposals")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", bundle.proposal.id);
      if (error) throw new Error(error.message);
      await supabaseAdmin
        .from("inquiries")
        .update({ status: "proposal_sent", proposal_sent_at: sentAt })
        .eq("id", bundle.proposal.inquiry_id);
      await syncInquiryAutoTaskFor(supabaseAdmin, bundle.proposal.inquiry_id);
      await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);
    }

    return { url: proposalLink(appUrl(), tokenValue, bundle.client.name) };
  });

export const getPublicProposal = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(32) }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (bundle.proposal.status !== "draft") {
      const viewedAt = new Date().toISOString();
      const wasSent = bundle.proposal.status === "sent";
      const nextStatus = wasSent ? "viewed" : bundle.proposal.status;
      await supabaseAdmin
        .from("proposals")
        .update({ status: nextStatus, viewed_at: viewedAt })
        .eq("id", bundle.proposal.id);
      if (wasSent) void refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);
      bundle.proposal.status = nextStatus;
      bundle.proposal.viewed_at = viewedAt;
    }
    const pdfUrl = bundle.proposal.pdf_path
      ? (
          await supabaseAdmin.storage
            .from("documents")
            .createSignedUrl(bundle.proposal.pdf_path, 60 * 15)
        ).data?.signedUrl
      : null;
    if (bundle.proposal.total_cents > 0) {
      const existingInvoice = await supabaseAdmin
        .from("invoices")
        .select("id")
        .eq("proposal_id", bundle.proposal.id)
        .maybeSingle();
      if (existingInvoice.error) throw new Error(existingInvoice.error.message);
      if (!existingInvoice.data) {
        try {
          await ensureInvoiceNumber(bundle.proposal.id, bundle.proposal.deposit_amount_cents);
        } catch {
          // Another open can claim this proposal's invoice number first.
        }
      }
    }
    const [{ data: agreement }, { data: invoice }] = await Promise.all([
      supabaseAdmin
        .from("agreements")
        .select("content, signed_name, signed_at")
        .eq("proposal_id", bundle.proposal.id)
        .maybeSingle(),
      supabaseAdmin
        .from("invoices")
        .select("number, amount_cents, status, square_payment_link")
        .eq("proposal_id", bundle.proposal.id)
        .maybeSingle(),
    ]);
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
      agreement: agreement
        ? { content: agreement.content, signedName: agreement.signed_name, signedAt: agreement.signed_at }
        : null,
      invoice: invoice
        ? {
            number: invoiceTitle(invoice.number),
            amountCents: invoice.amount_cents,
            status: invoice.status,
            paymentLink: invoice.square_payment_link,
          }
        : null,
    };
  });

export const acceptPublicProposal = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: z.string().min(32) }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (!["sent", "viewed"].includes(bundle.proposal.status)) {
      if (bundle.proposal.status === "accepted") {
        const { data: agreement } = await supabaseAdmin
          .from("agreements")
          .select("content, signed_name")
          .eq("proposal_id", bundle.proposal.id)
          .maybeSingle();
        return { accepted: true, agreement: agreement?.content ?? "", signedName: agreement?.signed_name ?? null };
      }
      throw new Error("This proposal can no longer be accepted");
    }

    const acceptedAt = new Date().toISOString();
    const { error: acceptError } = await supabaseAdmin
      .from("proposals")
      .update({ status: "accepted", accepted_at: acceptedAt })
      .eq("id", bundle.proposal.id);
    if (acceptError) throw new Error(acceptError.message);
    await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);

    const agreementContent = agreementFor(bundle);
    const { error } = await supabaseAdmin.from("agreements").upsert(
      {
        proposal_id: bundle.proposal.id,
        content: agreementContent,
        version: 1,
      },
      { onConflict: "proposal_id" },
    );
    if (error) throw new Error(error.message);
    return { accepted: true, agreement: agreementContent, signedName: null };
  });

export const signPublicAgreement = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(32),
        signature: z.string().startsWith("data:image/png;base64,").max(600_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (bundle.proposal.status !== "accepted") throw new Error("Accept the proposal before signing.");
    const { data: agreement, error: agreementError } = await supabaseAdmin
      .from("agreements")
      .select("id, content, signed_name")
      .eq("proposal_id", bundle.proposal.id)
      .maybeSingle();
    if (agreementError) throw new Error(agreementError.message);
    if (!agreement) throw new Error("The agreement is not ready yet.");

    const signedAt = new Date().toISOString();
    const content = agreement.signed_name
      ? agreement.content
      : `${agreement.content}\n\nSigned on ${signedAt.slice(0, 10)}`;
    const agreementPdf = await renderAgreementPdf({
      meta: documentMeta(bundle, "Agreement", bundle.proposal.number),
      typeLabel: "Standard Service Agreement",
      version: 1,
      content,
    });
    const agreementPath = `${bundle.proposal.id}/agreement-${bundle.proposal.number}.pdf`;
    await uploadDocument(agreementPath, agreementPdf);
    const { error: signError } = await supabaseAdmin
      .from("agreements")
      .update({
        content,
        pdf_path: agreementPath,
        signed_name: agreement.signed_name ?? data.signature,
        signed_at: signedAt,
      })
      .eq("id", agreement.id);
    if (signError) throw new Error(signError.message);

    const paymentLink = await ensureDepositInvoice(bundle);
    return { signed: true, paymentLink, amountCents: bundle.proposal.deposit_amount_cents };
  });

export const requestProposalChanges = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(32), note: z.string().trim().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (!["sent", "viewed"].includes(bundle.proposal.status)) {
      throw new Error("This proposal can no longer take a change request.");
    }
    const { sendChangeRequestEmail } = await import("@/lib/os/change-request-email.server");
    const inquiry = bundle.inquiry;
    await sendChangeRequestEmail({
      clientName: bundle.client.name,
      clientEmail: bundle.client.email,
      eventDate: bundle.proposal.event_date,
      place: bundle.proposal.venue_text || inquiry.venue_text,
      investment: inquiry.budget_range,
      note: data.note,
    });
    return { sent: true };
  });

export const sendChangeRequestNotice = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        clientName: z.string().trim().min(1).max(160),
        clientEmail: z.string().trim().email().nullable().optional(),
        eventDate: z.string().trim().max(80).nullable().optional(),
        place: z.string().trim().max(240).nullable().optional(),
        investment: z.string().trim().max(80).nullable().optional(),
        note: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { sendChangeRequestEmail } = await import("@/lib/os/change-request-email.server");
    return sendChangeRequestEmail({
      clientName: data.clientName,
      clientEmail: data.clientEmail ?? null,
      eventDate: data.eventDate ?? null,
      place: data.place ?? null,
      investment: data.investment ?? null,
      note: data.note,
    });
  });

export const declinePublicProposal = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
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
    sent_at: proposal.sent_at,
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

function agreementFor(bundle: ProposalBundle) {
  const statement = statementFromNotes(bundle.proposal.notes);
  return buildAgreementContent("standard", {
    clientName: bundle.client.name,
    contactName: null,
    projectTitle: statement?.occasion || eventLabel(bundle.inquiry.event_type),
    eventDate: statement?.eventWhen || bundle.proposal.event_date,
    venue: statement?.venue || bundle.venue?.name || bundle.proposal.venue_text,
    totalCents: bundle.proposal.total_cents,
    depositCents: bundle.proposal.deposit_amount_cents,
    proposalNumber: bundle.proposal.number,
    statement,
  });
}

async function ensureDepositInvoice(bundle: ProposalBundle) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("invoices")
    .select("id, number, square_payment_link")
    .eq("proposal_id", bundle.proposal.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.square_payment_link) return existing.square_payment_link;

  const invoiceNumber = await ensureInvoiceNumber(bundle.proposal.id, bundle.proposal.deposit_amount_cents);
  const { data: invoiceRow, error: invoiceRowError } = await supabaseAdmin
    .from("invoices")
    .select("id")
    .eq("proposal_id", bundle.proposal.id)
    .maybeSingle();
  if (invoiceRowError) throw new Error(invoiceRowError.message);
  const invoiceId = invoiceRow?.id ?? "";
  if (!invoiceId) throw new Error("The invoice could not be opened.");

  let paymentLink: string | null = null;
  try {
    const square = await createSquarePaymentLink({
      idempotencyKey: `proposal-${bundle.proposal.id}`,
      label: invoiceNumber,
      amountCents: bundle.proposal.deposit_amount_cents,
    });
    paymentLink = square.url;
    await supabaseAdmin
      .from("invoices")
      .update({ square_payment_link: square.url, square_order_id: square.orderId })
      .eq("id", invoiceId);
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

  const statement = statementFromNotes(bundle.proposal.notes);
  const courtesy = courtesyFromNotes(bundle.proposal.notes);
  const occasion = statement?.occasion || eventLabel(bundle.inquiry.event_type);
  const packageName = floralPackageName(occasion);
  const booking = invoiceBookingLine(occasion, invoiceDateLabel(statement?.eventWhen || bundle.proposal.event_date || ""));
  const listCents = bundle.proposal.subtotal_cents || bundle.proposal.total_cents + courtesy;
  const items = bundle.items.length
    ? pdfItems(bundle.items)
    : [
        {
          name: booking ? `${packageName} — ${booking}` : packageName,
          qty: 1,
          unitPriceCents: listCents,
          lineTotalCents: listCents,
        },
        ...(courtesy > 0
          ? [
              {
                name: "Courtesy discount",
                qty: 1,
                unitPriceCents: -courtesy,
                lineTotalCents: -courtesy,
              },
            ]
          : []),
      ];
  const invoicePdf = await renderInvoicePdf({
    meta: documentMeta(bundle, "Invoice", invoiceNumber),
    items,
    amountCents: bundle.proposal.total_cents,
    depositCents: bundle.proposal.deposit_amount_cents,
    balanceCents: Math.max(0, bundle.proposal.total_cents - bundle.proposal.deposit_amount_cents),
    dueDate: null,
    sharedOn: invoiceSharedDate(bundle.proposal.sent_at),
    paymentLink,
  });
  const invoicePath = `${bundle.proposal.id}/invoice-${invoiceNumber}.pdf`;
  await uploadDocument(invoicePath, invoicePdf);
  await supabaseAdmin.from("invoices").update({ pdf_path: invoicePath }).eq("id", invoiceId);
  return paymentLink;
}

async function ensureInvoiceNumber(proposalId: string, amountCents: number) {
  const existing = await supabaseAdmin.from("invoices").select("id, number").eq("proposal_id", proposalId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const number = invoiceTitle(existing.data.number);
    const patch: { amount_cents: number; number?: string } = { amount_cents: amountCents };
    if (number !== existing.data.number) patch.number = number;
    const { error } = await supabaseAdmin.from("invoices").update(patch).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return number;
  }
  const { data: nextNumber, error: numberError } = await supabaseAdmin.rpc("next_invoice_number");
  if (numberError || typeof nextNumber !== "string" || !nextNumber) throw new Error(numberError?.message ?? "The invoice number could not be opened.");
  const number = invoiceTitle(nextNumber);
  const { error } = await supabaseAdmin.from("invoices").insert({
    proposal_id: proposalId,
    number,
    amount_cents: amountCents,
    status: "unpaid",
  });
  if (error) throw new Error(error.message);
  return number;
}

async function uploadDocument(path: string, bytes: Uint8Array) {
  const { error } = await supabaseAdmin.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);
}

function appUrl() {
  return (process.env["APP_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
}
