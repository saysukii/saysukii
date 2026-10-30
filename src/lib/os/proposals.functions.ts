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
import { invoiceTitle, squareInvoiceNumber } from "@/lib/invoice-title";
import {
  freeProposalSlug,
  isProposalSlug,
  PROPOSAL_MAX_BYTES,
  PROPOSAL_ORIGIN,
  PROPOSAL_TOO_BIG,
  proposalLink,
  proposalSlug,
} from "@/lib/proposal-link";
import {
  AGREEMENT_CONSENT,
  courtesyFromNotes,
  floralAgreementBlocks,
  floralPackageName,
  formatEventWhen,
  invoiceBookingLine,
  invoiceDateLabel,
  invoiceSharedDate,
  statementFromNotes,
  statementNotes,
  statementOfWork,
  signedByLine,
  signerFromAgreement,
  type FloralAgreementFields,
} from "@/lib/floral-agreement";
import { formatMoneyExact } from "@/lib/money";
import { renderAgreementPdf, renderInvoicePdf, renderReceiptPdf } from "@/lib/pdf.server";
import { createPublicToken, hashToken } from "./crypto.server";
import { createSquarePaymentLink } from "./square.server";
import { syncInquiryAutoTaskFor } from "@/lib/os/tasks.functions";
import { renderSaySukiiEmail } from "@/lib/os/email-layout";
import { sendStudioNotice, studioNotificationEmail } from "@/lib/os/email.server";
import { refreshInquirySummarySafe } from "@/lib/os/inquiry-summary.server";

const lineItemInput = z.object({
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
  .refine((value) => Boolean(value.pdf_base64 || value.pdf_path), {
    message: "Choose the proposal PDF.",
  });

/** an uploaded file's size, from storage's listing of its folder */
async function storedSize(path: string) {
  const slash = path.lastIndexOf("/");
  const { data } = await supabaseAdmin.storage
    .from("documents")
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  const size = (data?.[0]?.metadata as { size?: number } | undefined)?.size;
  return typeof size === "number" ? size : 0;
}

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

    // an inquiry holds one proposal; a cleared one is archived and reopened here
    const existing = await context.supabase
      .from("proposals")
      .select("id, number, status, access_token, slug, pdf_path, notes, archived")
      .eq("inquiry_id", inquiry.id)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.status === "accepted" && !existing.data.archived)
      throw new Error("This proposal is already accepted.");
    if (existing.data?.archived) {
      // reopened fresh: a new private link (the cleared one stays dead), nothing sent or viewed
      const fresh = createPublicToken();
      const { error: reopenError } = await supabaseAdmin
        .from("proposals")
        .update({
          archived: false,
          status: "draft",
          sent_at: null,
          viewed_at: null,
          accepted_at: null,
          declined_at: null,
          declined_reason: null,
          slug: null,
          access_token: fresh.token,
          access_token_hash: fresh.hash,
          access_token_prefix: fresh.prefix,
        })
        .eq("id", existing.data.id);
      if (reopenError) throw new Error(reopenError.message);
      // an unpaid deposit link was for the old amount; a new one is made when the client signs
      await supabaseAdmin
        .from("invoices")
        .update({ square_payment_link: null, square_order_id: null })
        .eq("proposal_id", existing.data.id)
        .neq("status", "paid");
      existing.data = {
        ...existing.data,
        archived: false,
        status: "draft",
        slug: null,
        access_token: fresh.token,
      };
    }

    let pdfBytes: Buffer | null = null;
    let copyFrom: string | null = null;
    if (data.pdf_path) {
      const incoming = data.pdf_path.startsWith(`${inquiry.id}/`) && !data.pdf_path.includes("..");
      const current = Boolean(existing.data?.pdf_path) && data.pdf_path === existing.data?.pdf_path;
      if (!incoming && !current) throw new Error("Choose the proposal PDF.");
      if (!current) copyFrom = data.pdf_path;
      // the page checks the size before uploading; this holds the line if it's skipped
      if (copyFrom && (await storedSize(copyFrom)) > PROPOSAL_MAX_BYTES) {
        await supabaseAdmin.storage.from("documents").remove([copyFrom]);
        throw new Error(PROPOSAL_TOO_BIG);
      }
    } else if (data.pdf_base64) {
      pdfBytes = Buffer.from(data.pdf_base64, "base64");
    }
    if (pdfBytes) {
      if (pdfBytes.length < 5 || pdfBytes.subarray(0, 4).toString() !== "%PDF") {
        throw new Error("Choose the proposal PDF.");
      }
      if (pdfBytes.length > PROPOSAL_MAX_BYTES) throw new Error(PROPOSAL_TOO_BIG);
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
      const { data: nextNumber, error: numberError } =
        await supabaseAdmin.rpc("next_proposal_number");
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

    const { data: owner } = await supabaseAdmin
      .from("clients")
      .select("name")
      .eq("id", inquiry.client_id)
      .maybeSingle();
    const slug = await ensureProposalSlug(proposalId, owner?.name ?? "", existing.data?.slug);

    const pdfPath =
      pdfBytes || copyFrom
        ? `${proposalId}/proposal-${number}.pdf`
        : (existing.data?.pdf_path ?? "");
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
    const { error: updateError } = await context.supabase
      .from("proposals")
      .update(patch)
      .eq("id", proposalId);
    if (updateError) throw new Error(updateError.message);
    const invoiceNumber =
      data.total_cents > 0 ? await ensureInvoiceNumber(proposalId, deposit) : null;
    await refreshInquirySummarySafe(context.supabase, inquiry.id);
    return {
      id: proposalId,
      number,
      token: tokenValue,
      slug,
      url: proposalLink(publicOrigin(), slug),
      total_cents: data.total_cents,
      deposit_amount_cents: deposit,
      invoice_number: invoiceNumber,
      pdf_path: pdfPath,
    };
  });

export const sendProposal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => shareBundle(await loadProposalBundleById(data.id)));

/** Copying the link counts as sending it, so the client can approve or ask for changes. */
export const shareProposal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ inquiry_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("proposals")
      .select("id")
      .eq("inquiry_id", data.inquiry_id)
      .eq("archived", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Import the proposal PDF before sharing.");
    return shareBundle(await loadProposalBundleById(row.id));
  });

async function shareBundle(bundle: ProposalBundle) {
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

  const slug = await ensureProposalSlug(
    bundle.proposal.id,
    bundle.client.name,
    bundle.proposal.slug,
  );
  return { url: proposalLink(publicOrigin(), slug) };
}

/**
 * Takes the proposal off an inquiry so the studio can start again: its link stops working and
 * the client's name is free for the next one. An approved proposal stays.
 */
export const clearProposal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ inquiry_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("proposals")
      .select("id, status")
      .eq("inquiry_id", data.inquiry_id)
      .eq("archived", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { cleared: false };
    if (row.status === "accepted") {
      throw new Error("this proposal was approved, so it stays.");
    }
    const { error: clearError } = await supabaseAdmin
      .from("proposals")
      .update({ archived: true, slug: null })
      .eq("id", row.id);
    if (clearError) throw new Error(clearError.message);
    // with no proposal out, the inquiry goes back to the conversation
    await supabaseAdmin
      .from("inquiries")
      .update({ status: "in_conversation", proposal_sent_at: null })
      .eq("id", data.inquiry_id)
      .eq("status", "proposal_sent");
    await syncInquiryAutoTaskFor(supabaseAdmin, data.inquiry_id);
    await refreshInquirySummarySafe(supabaseAdmin, data.inquiry_id);
    return { cleared: true };
  });

/** inside.saysukii.com/maya-chen → the proposal it opens. */
export const findProposalBySlug = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    if (!isProposalSlug(data.slug)) return { token: null };
    const { data: row, error } = await supabaseAdmin
      .from("proposals")
      .select("access_token")
      .eq("slug", data.slug)
      .eq("archived", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { token: row?.access_token ?? null };
  });

/** An older /proposal/<token> link → the client's name, so it can move to the new address. */
export const findProposalSlug = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(32) }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token).catch(() => null);
    if (!bundle) return { slug: null };
    const slug = await ensureProposalSlug(
      bundle.proposal.id,
      bundle.client.name,
      bundle.proposal.slug,
    );
    return { slug };
  });

/** Payments in the last day, for the studio's bell: who paid and whether it booked the project. */
export const listFreshPayments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("payments")
      .select(
        "id, proposal_id, amount_cents, paid_at, proposals(inquiry_id, total_cents, event_date, clients(name))",
      )
      .eq("status", "completed")
      .gte("paid_at", since)
      .order("paid_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    // every payment on these proposals, so each notice knows if it was the deposit or the last of it
    const { data: all } = rows.length
      ? await context.supabase
          .from("payments")
          .select("id, proposal_id, amount_cents, paid_at")
          .eq("status", "completed")
          .in(
            "proposal_id",
            rows.map((row) => row.proposal_id),
          )
      : { data: [] };
    return rows.map((row) => {
      const proposal = row.proposals as unknown as {
        inquiry_id: string;
        total_cents: number;
        event_date: string | null;
        clients: { name: string } | null;
      } | null;
      const upTo = (all ?? []).filter(
        (other) =>
          other.proposal_id === row.proposal_id && (other.paid_at ?? "") <= (row.paid_at ?? ""),
      );
      const paidSoFarCents = upTo.reduce((total, other) => total + other.amount_cents, 0);
      return {
        id: row.id,
        name: proposal?.clients?.name ?? "a client",
        inquiryId: proposal?.inquiry_id ?? null,
        first: upTo.length <= 1,
        inFull: proposal ? paidSoFarCents >= proposal.total_cents : false,
        amountCents: row.amount_cents,
        eventDate: proposal?.event_date ?? null,
      };
    });
  });

/** Square's public settings, so the client's page can show its secure card fields and apple pay. */
export const getSquarePayConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { squareCheckoutConfig } = await import("./square.server");
  return squareCheckoutConfig();
});

/**
 * Pays the deposit (or the whole amount) from the client's own invoice page: an itemized square
 * order, the card or apple pay charge, then the same paid step square's webhook runs.
 */
export const payProposalDeposit = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(32),
        source_id: z.string().trim().min(1).max(500),
        verification_token: z.string().trim().max(4000).optional(),
        receipt_email: z.string().trim().email().max(320).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    const { data: agreement } = await supabaseAdmin
      .from("agreements")
      .select("signed_name")
      .eq("proposal_id", bundle.proposal.id)
      .maybeSingle();
    if (!agreement?.signed_name) throw new Error("Sign the agreement before paying.");
    // the deposit first; once it's in, the rest of the balance
    const paid = await paidSoFar(bundle.proposal.id);
    const due =
      paid > 0 ? bundle.proposal.total_cents - paid : bundle.proposal.deposit_amount_cents;
    if (!(due > 0)) return { paid: true as const };

    const invoiceNumber = await ensureInvoiceNumber(bundle.proposal.id, due);
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, status")
      .eq("proposal_id", bundle.proposal.id)
      .maybeSingle();
    if (invoiceError || !invoice) throw new Error("The invoice could not be opened.");
    const { createSquareOrder, createSquareCardPayment } = await import("./square.server");
    const order = await createSquareOrder({
      idempotencyKey: `${paid > 0 ? "balance" : "deposit"}-${bundle.proposal.id}-${due}`.slice(
        0,
        45,
      ),
      // square writes its invoice numbers with a dash: SS-751
      referenceId: squareInvoiceNumber(invoiceNumber),
      ...(paid > 0 ? balanceOrder(bundle, due) : depositOrder(bundle, due)),
    });
    if (order.totalCents !== due) throw new Error("The amount due changed. Reload and try again.");
    await supabaseAdmin
      .from("invoices")
      .update({ square_order_id: order.orderId })
      .eq("id", invoice.id);

    let payment;
    try {
      payment = await createSquareCardPayment({
        sourceId: data.source_id,
        verificationToken: data.verification_token,
        idempotencyKey: crypto.randomUUID(),
        amountCents: due,
        orderId: order.orderId,
        referenceId: invoiceNumber,
        buyerEmail: data.receipt_email ?? bundle.client.email,
        note: `${invoiceNumber} · ${bundle.client.name}`,
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
    const { settleSquarePayment } = await import("./square-paid.server");
    await settleSquarePayment(payment, { receiptEmail: data.receipt_email ?? null });
    return { paid: true as const };
  });

/**
 * What square shows for the payment. Paying in full lists the service (and any courtesy discount);
 * a deposit is one clear line toward the total, since square's order total has to equal the charge.
 */
/** The rest after a deposit: one line for the balance. */
function balanceOrder(bundle: ProposalBundle, dueCents: number) {
  const statement = statementFromNotes(bundle.proposal.notes);
  const occasion = statement?.occasion || eventLabel(bundle.inquiry.event_type);
  return {
    lines: [
      {
        name: `Balance · ${floralPackageName(occasion)}`,
        note: `The rest of the total of ${moneyLabel(bundle.proposal.total_cents)}.`,
        amountCents: dueCents,
      },
    ],
  };
}

function depositOrder(bundle: ProposalBundle, dueCents: number) {
  const statement = statementFromNotes(bundle.proposal.notes);
  const courtesy = courtesyFromNotes(bundle.proposal.notes);
  const occasion = statement?.occasion || eventLabel(bundle.inquiry.event_type);
  const packageName = floralPackageName(occasion);
  const booking = invoiceBookingLine(
    occasion,
    invoiceDateLabel(statement?.eventWhen || bundle.proposal.event_date || ""),
  );
  const total = bundle.proposal.total_cents;
  if (dueCents < total) {
    return {
      lines: [
        {
          name: `Deposit · ${packageName}`,
          note: `${booking ? `${booking} ` : ""}Toward the total of ${moneyLabel(total)}.`,
          amountCents: dueCents,
        },
      ],
    };
  }
  const lines = bundle.items.length
    ? bundle.items.map((item) => ({
        name: item.label,
        amountCents: item.line_total_cents,
        ...(item.description ? { note: item.description } : {}),
      }))
    : [
        {
          name: packageName,
          amountCents: total + courtesy,
          ...(booking ? { note: booking } : {}),
        },
      ];
  const discountCents = bundle.items.length ? 0 : courtesy;
  const sum = lines.reduce((total, line) => total + line.amountCents, 0) - discountCents;
  // square's order has to add up to the charge exactly; if the lines don't, say it in one
  if (sum !== dueCents) {
    return {
      lines: [{ name: packageName, amountCents: dueCents, ...(booking ? { note: booking } : {}) }],
    };
  }
  return { lines, discountCents };
}

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
    const signPdf = async (path: string | null | undefined) => {
      if (!path) return null;
      const signed = await supabaseAdmin.storage.from("documents").createSignedUrl(path, 60 * 15);
      return signed.data?.signedUrl ?? null;
    };
    const pdfUrl = await signPdf(bundle.proposal.pdf_path);
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
    // signed before square was connected (or square was down): make the deposit link now
    let paymentLink = invoice?.square_payment_link ?? null;
    if (
      !paymentLink &&
      process.env["SQUARE_LOCATION_ID"] &&
      agreement?.signed_name &&
      invoice?.status !== "paid" &&
      bundle.proposal.deposit_amount_cents > 0
    ) {
      paymentLink = await ensureDepositInvoice(bundle).catch(() => null);
    }
    // after the deposit, what's left and when it's due (30 days before the event)
    const paidCents = await paidSoFar(bundle.proposal.id);
    const { balanceDueDate } = await import("./paid-email.server");
    return {
      paidCents,
      balanceDue: balanceDueDate(proposalEventDate(bundle)),
      proposal: publicProposal(bundle.proposal),
      client: { name: bundle.client.name, email: bundle.client.email, phone: bundle.client.phone },
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
        ? {
            content: agreement.content,
            signedName: agreement.signed_name,
            signedAt: agreement.signed_at,
            signer: signerFromAgreement(agreement.content),
          }
        : null,
      invoice: invoice
        ? {
            number: invoiceTitle(invoice.number),
            amountCents: invoice.amount_cents,
            status: invoice.status,
            paymentLink,
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
        return {
          accepted: true,
          agreement: agreement?.content ?? "",
          signedName: agreement?.signed_name ?? null,
        };
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
    await recordClientDecision(bundle, {
      subject: "proposal approved",
      body: `${bundle.client.name} approved the proposal.`,
    });
    const amount = moneyLabel(bundle.proposal.total_cents);
    await sendStudioNotice({
      subject: `proposal approved · ${bundle.client.name}`,
      text: [
        "proposal approved",
        `${bundle.client.name} approved the proposal.`,
        `total: ${amount}`,
        `proposal: ${bundle.proposal.number}`,
      ]
        .filter(Boolean)
        .join("\n"),
      html: renderSaySukiiEmail({
        eyebrow: "proposal",
        headline: "proposal approved",
        body: `${bundle.client.name} approved the proposal. the agreement is ready for their signature.`,
        facts: [
          { label: "client", value: bundle.client.name },
          { label: "total", value: amount },
          { label: "proposal", value: bundle.proposal.number },
        ],
      }),
    });
    return { accepted: true, agreement: agreementContent, signedName: null };
  });

export const signPublicAgreement = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(32),
        signature: z.string().startsWith("data:image/png;base64,").max(600_000),
        first_name: z.string().trim().min(1).max(80),
        last_name: z.string().trim().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const bundle = await loadProposalBundleByToken(data.token);
    if (bundle.proposal.status !== "accepted")
      throw new Error("Accept the proposal before signing.");
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
      : `${agreement.content}\n\n${signedByLine(data.first_name, data.last_name, signedAt)}`;
    const agreementPdf = await renderAgreementPdf({
      number: bundle.proposal.number,
      blocks: floralAgreementBlocks(agreementFieldsFor(bundle)),
      consent: AGREEMENT_CONSENT,
      client: {
        first: data.first_name.trim(),
        last: data.last_name.trim(),
        image: data.signature,
        signedAt,
      },
      // say sukii countersigns the copy the client keeps, dated the moment they signed
      studio: await studioSignature(signedAt),
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
    await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);

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
    await recordClientDecision(bundle, {
      subject: "changes requested",
      body: data.note,
    });
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

async function recordClientDecision(
  bundle: ProposalBundle,
  input: { subject: string; body: string },
) {
  const { error } = await supabaseAdmin.from("inquiry_messages").insert({
    inquiry_id: bundle.proposal.inquiry_id,
    direction: "inbound",
    channel: "note",
    subject: input.subject,
    body: input.body,
    from_address: bundle.client.email,
    to_address: studioNotificationEmail(),
    author: bundle.client.name,
    sent_at: new Date().toISOString(),
    status: "received",
  });
  if (error) console.error("[proposal] client decision was not filed", error.message);
  else await refreshInquirySummarySafe(supabaseAdmin, bundle.proposal.inquiry_id);
}

/** The owner's saved signature, if she has drawn one in settings. */
async function studioSignature(signedAt: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("full_name, signature")
    .eq("role", "admin")
    .eq("active", true)
    .not("signature", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // before the signature migration runs, the agreement simply goes out with the client's alone
  if (error || !data?.signature) return null;
  const [first = "Say", ...last] = (data.full_name?.trim() || "Say Sukii").split(/\s+/);
  return { first, last: last.join(" "), image: data.signature, signedAt };
}

/** The agreement's details exactly as the client's page fills them in. */
function agreementFieldsFor(bundle: ProposalBundle): FloralAgreementFields {
  const saved = statementFromNotes(bundle.proposal.notes);
  const total = bundle.proposal.total_cents;
  const deposit = bundle.proposal.deposit_amount_cents;
  return {
    ...statementOfWork({
      ...saved,
      flowers: saved?.flowers || "Floral design",
      eventWhen: saved?.eventWhen || formatEventWhen(bundle.proposal.event_date),
      occasion: saved?.occasion || "",
      venue: saved?.venue || bundle.proposal.venue_text || "",
    }),
    clientName: bundle.client.name,
    clientPhone: bundle.client.phone || null,
    clientEmail: bundle.client.email || null,
    total: formatMoneyExact(total),
    deposit: formatMoneyExact(deposit),
    balance: formatMoneyExact(Math.max(0, total - deposit)),
  };
}

function moneyLabel(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

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

/** What the invoice and receipt list: the proposal's own lines, or the service and any courtesy. */
/** "Booking for floral subscription service on 10/30/26 per approved proposal." */
function bookingLineFor(bundle: ProposalBundle) {
  const statement = statementFromNotes(bundle.proposal.notes);
  return invoiceBookingLine(
    statement?.occasion || eventLabel(bundle.inquiry.event_type),
    invoiceDateLabel(statement?.eventWhen || bundle.proposal.event_date || ""),
  );
}

function invoiceItems(bundle: ProposalBundle) {
  const statement = statementFromNotes(bundle.proposal.notes);
  const courtesy = courtesyFromNotes(bundle.proposal.notes);
  const occasion = statement?.occasion || eventLabel(bundle.inquiry.event_type);
  const packageName = floralPackageName(occasion);
  const listCents = bundle.proposal.subtotal_cents || bundle.proposal.total_cents + courtesy;
  return bundle.items.length
    ? pdfItems(bundle.items)
    : [
        {
          name: packageName,
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
}

/** Keeps a document in the client's file, once, under a clear name. */
/** Stores a document once and lists it in the client's file and the inquiry's files tab. */
async function fileForClient(
  owners: { clientId: string; inquiryId: string },
  name: string,
  data: Uint8Array,
) {
  const path = `clients/${owners.clientId}/${name}`;
  const { error } = await supabaseAdmin.storage
    .from("project-files")
    .upload(path, data, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);
  const listings = [
    { owner_type: "client" as const, owner_id: owners.clientId },
    { owner_type: "inquiry" as const, owner_id: owners.inquiryId },
  ];
  for (const owner of listings) {
    const { data: existing } = await supabaseAdmin
      .from("files")
      .select("id")
      .eq("owner_type", owner.owner_type)
      .eq("owner_id", owner.owner_id)
      .eq("file_path", path)
      .maybeSingle();
    if (existing) continue;
    const { error: rowError } = await supabaseAdmin.from("files").insert({
      ...owner,
      file_path: path,
      file_type: "application/pdf",
    });
    if (rowError) throw new Error(rowError.message);
  }
}

/** What's been paid on a proposal so far, across the deposit and the balance. */
async function paidSoFar(proposalId: string) {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("amount_cents")
    .eq("proposal_id", proposalId)
    .eq("status", "completed");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total, row) => total + (row.amount_cents ?? 0), 0);
}

function proposalEventDate(bundle: ProposalBundle) {
  return bundle.proposal.event_date || bundle.inquiry.event_date || null;
}

function proposalOccasion(bundle: ProposalBundle) {
  const statement = statementFromNotes(bundle.proposal.notes);
  return (statement?.occasion || eventLabel(bundle.inquiry.event_type)).toLowerCase();
}

/**
 * After a payment: the client's receipt and their signed agreement, attached to a branded letter,
 * and a note to the studio that the project is booked.
 */
export async function sendPaidLetters(
  proposalId: string,
  payment: { amountCents: number; paidAt: string; booking: boolean; receiptEmail?: string | null },
) {
  const { paidAt } = payment;
  const bundle = await loadProposalBundleById(proposalId);
  // every payment so far, this one included, for the receipt's paid rows
  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from("payments")
    .select("amount_cents, paid_at, raw_payload")
    .eq("proposal_id", proposalId)
    .eq("status", "completed")
    .order("paid_at", { ascending: true });
  if (paymentsError) throw new Error(paymentsError.message);
  const paid = (payments ?? []).reduce((total, row) => total + (row.amount_cents ?? 0), 0);
  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("number")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  const invoiceNumber = invoiceTitle(invoice?.number ?? bundle.proposal.number);
  const eventDate = proposalEventDate(bundle);
  const {
    balanceDueDate,
    clientPaidHtml,
    clientPaidSubject,
    letterDate,
    paidText,
    sendClientLetter,
    studioPaidHtml,
    studioPaidSubject,
  } = await import("./paid-email.server");
  const { loadEmailTemplate } = await import("./email-templates.server");
  const letter = {
    template: await loadEmailTemplate(payment.booking ? "booked" : "paid-in-full"),
    clientName: bundle.client.name,
    invoiceNumber,
    amountCents: payment.amountCents,
    booking: payment.booking,
    paidCents: paid,
    totalCents: bundle.proposal.total_cents,
    occasion: proposalOccasion(bundle),
    eventDate,
    paidAt,
    inquiryId: bundle.proposal.inquiry_id,
    eventType: bundle.inquiry.event_type,
  };

  const files = [];
  const left = Math.max(0, bundle.proposal.total_cents - paid);
  const receipt = await renderReceiptPdf({
    booking: bookingLineFor(bundle),
    number: invoiceNumber,
    title: [floralPackageName(letter.occasion), eventDate ? letterDate(eventDate) : ""]
      .filter(Boolean)
      .join(" "),
    client: { name: bundle.client.name, email: bundle.client.email, phone: bundle.client.phone },
    eventDate: eventDate ? letterDate(eventDate) : null,
    venue: documentMeta(bundle, "Invoice", invoiceNumber).venue,
    items: invoiceItems(bundle),
    totalCents: bundle.proposal.total_cents,
    payments: (payments ?? []).map((row) => ({
      amountCents: row.amount_cents ?? 0,
      paidOn: letterDate(row.paid_at ?? paidAt),
      method: paidWith(row.raw_payload),
    })),
    balance:
      left > 0 ? { amountCents: left, due: letterDate(balanceDueDate(eventDate)) || null } : null,
    createdOn: letterDate(new Date().toISOString()),
  });
  files.push({
    name: `Say Sukii receipt ${invoiceNumber}.pdf`,
    type: "application/pdf",
    data: receipt,
  });
  const { data: agreement } = await supabaseAdmin
    .from("agreements")
    .select("pdf_path")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  // the signed agreement and the proposal go with the payment that books the project;
  // later it's the receipt alone
  if (payment.booking && agreement?.pdf_path) {
    const download = await supabaseAdmin.storage.from("documents").download(agreement.pdf_path);
    if (download.data) {
      files.push({
        name: "Floral Service Agreement.pdf",
        type: "application/pdf",
        data: new Uint8Array(await download.data.arrayBuffer()),
      });
    }
  }
  let proposalCopy: Uint8Array | null = null;
  if (payment.booking && bundle.proposal.pdf_path) {
    const download = await supabaseAdmin.storage
      .from("documents")
      .download(bundle.proposal.pdf_path);
    if (download.data) proposalCopy = new Uint8Array(await download.data.arrayBuffer());
    // uploads are capped, but an older, larger proposal stays in their file rather than
    // tipping the email over gmail's limit
    if (proposalCopy && proposalCopy.byteLength <= PROPOSAL_MAX_BYTES) {
      files.unshift({
        name: `Say Sukii proposal ${bundle.proposal.number}.pdf`,
        type: "application/pdf",
        data: proposalCopy,
      });
    }
  }

  // into the client's file: the proposal, the signed agreement, and every receipt
  const keep = [
    {
      name: `say-sukii-receipt-${invoiceNumber}${payment.booking ? "" : "-balance"}.pdf`,
      data: receipt,
    },
  ];
  if (payment.booking) {
    const agreementCopy = files.find((file) => file.name === "Floral Service Agreement.pdf");
    if (agreementCopy) {
      keep.push({
        name: `floral-service-agreement-${bundle.proposal.number}.pdf`,
        data: agreementCopy.data,
      });
    }
    if (proposalCopy) {
      keep.push({ name: `say-sukii-proposal-${bundle.proposal.number}.pdf`, data: proposalCopy });
    }
  }
  for (const file of keep) {
    await fileForClient(
      { clientId: bundle.client.id, inquiryId: bundle.proposal.inquiry_id },
      file.name,
      file.data,
    ).catch((error: unknown) => console.error("[paid letters] client file:", error));
  }

  const receiptTo = payment.receiptEmail || bundle.client.email;
  if (receiptTo) {
    const result = await sendClientLetter({
      to: receiptTo,
      subject: clientPaidSubject(letter),
      html: clientPaidHtml(letter),
      text: paidText(letter),
      attachments: files,
    }).catch((error: unknown) => {
      console.error("[paid letters] client letter:", error);
      return { sent: false as const };
    });
    // kept out of the conversation, so the proposal tab lists it instead
    await supabaseAdmin.from("integration_events").insert({
      provider: "studio",
      event_type: "paid_letter",
      status: result.sent ? "succeeded" : "failed",
      reference_type: "proposal",
      reference_id: proposalId,
      attempts: 1,
      // the letter as it went out, so the proposal tab can open it in its own tab
      payload: {
        to: receiptTo,
        booking: payment.booking,
        amount_cents: payment.amountCents,
        subject: clientPaidSubject(letter),
        html: clientPaidHtml(letter),
      },
    });
  }
  const { deliverStudioNotice } = await import("./inquiry-email.server");
  // the studio's note carries the receipt too
  const receiptFile = files.find((file) => file.data === receipt);
  await deliverStudioNotice(
    studioPaidSubject(letter),
    studioPaidHtml(letter),
    paidText(letter),
    receiptFile ? [receiptFile] : [],
  ).catch((error: unknown) => console.error("[paid letters] studio note:", error));
}

/**
 * The balance reminders, run once a day: five days before the balance is due (35 days before the
 * event) and on the day it's due (30 days before). Each goes once per proposal.
 */
/** The balance letter for a proposal: who it goes to, how it reads, and a way to send it. */
async function balanceLetter(
  proposalId: string,
  when: "soon" | "today" | "now",
  balance: number,
  /** the studio's own words, when they edited the letter */
  body?: string,
) {
  const bundle = await loadProposalBundleById(proposalId);
  const eventDate = proposalEventDate(bundle);
  if (!bundle.client.email || !eventDate) return null;
  const slug = await ensureProposalSlug(proposalId, bundle.client.name, bundle.proposal.slug);
  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("number")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  const {
    LETTER_WORDS,
    balanceReminderHtml,
    balanceReminderSubject,
    balanceReminderWords,
    sendClientLetter,
  } = await import("./paid-email.server");
  const { loadEmailTemplate } = await import("./email-templates.server");
  const reminder = {
    template: await loadEmailTemplate(
      ({ today: "balance-today", soon: "balance-soon", now: "balance-invoice" } as const)[when],
    ),
    clientName: bundle.client.name,
    invoiceNumber: invoiceTitle(invoice?.number ?? bundle.proposal.number),
    balanceCents: balance,
    occasion: proposalOccasion(bundle),
    eventDate,
    when,
    payUrl: proposalLink(publicOrigin(), slug),
    eventType: bundle.inquiry.event_type,
    ...(body?.trim() ? { body: body.trim() } : {}),
  };
  const subject = balanceReminderSubject(reminder);
  const html = balanceReminderHtml(reminder);
  const to = bundle.client.email;
  const words = reminder.body ?? balanceReminderWords(reminder);
  return {
    to,
    subject,
    html,
    // for the preview: the letter's own words, and the html with a place to type them into
    words,
    previewHtml: balanceReminderHtml({ ...reminder, body: LETTER_WORDS }),
    send: () => sendClientLetter({ to, subject, html, text: `${words}\n\n${reminder.payUrl}` }),
  };
}

/** The studio sends the balance invoice by hand: first a look at the letter, then the send. */
export const sendBalanceInvoice = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        proposal_id: z.string().uuid(),
        send: z.boolean().default(false),
        body: z.string().trim().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: proposal, error } = await supabaseAdmin
      .from("proposals")
      .select("total_cents")
      .eq("id", data.proposal_id)
      .single();
    if (error) throw new Error(error.message);
    const paid = await paidSoFar(data.proposal_id);
    const balance = proposal.total_cents - paid;
    if (paid <= 0) throw new Error("the deposit isn't paid yet.");
    if (balance <= 0) throw new Error("this one is paid in full.");
    const letter = await balanceLetter(data.proposal_id, "now", balance, data.body);
    if (!letter) throw new Error("add the client's email and event date first.");
    const preview = {
      to: letter.to,
      subject: letter.subject,
      html: letter.previewHtml,
      words: letter.words,
    };
    if (!data.send) return { ...preview, sent: false };
    const result = await letter.send();
    if (!result.sent) throw new Error("the invoice didn't send. check the gmail connection.");
    await supabaseAdmin.from("integration_events").insert({
      provider: "studio",
      event_type: "balance_invoice_sent",
      status: "succeeded",
      reference_type: "proposal",
      reference_id: data.proposal_id,
      attempts: 1,
      payload: {
        balance_cents: balance,
        to: letter.to,
        subject: letter.subject,
        html: letter.html,
      },
    });
    return { ...preview, sent: true };
  });

export async function sendBalanceReminders(now = new Date()) {
  const { data: rows, error } = await supabaseAdmin
    .from("proposals")
    .select("id, event_date, total_cents")
    .eq("status", "accepted")
    .eq("archived", false)
    .not("event_date", "is", null);
  if (error) throw new Error(error.message);
  const today = now.toISOString().slice(0, 10);
  const { balanceDueDate } = await import("./paid-email.server");
  let sent = 0;
  for (const row of rows ?? []) {
    const due = balanceDueDate(row.event_date);
    if (!due) continue;
    const soon = new Date(`${due}T12:00:00Z`);
    soon.setUTCDate(soon.getUTCDate() - 5);
    const when =
      today === due ? "today" : today === soon.toISOString().slice(0, 10) ? "soon" : null;
    if (!when) continue;
    const paid = await paidSoFar(row.id);
    const balance = row.total_cents - paid;
    // nothing paid yet means no deposit, and nothing left means paid in full
    if (paid <= 0 || balance <= 0) continue;
    const key = `balance_reminder_${when}`;
    const { data: already } = await supabaseAdmin
      .from("integration_events")
      .select("id")
      .eq("event_type", key)
      .eq("reference_id", row.id)
      .limit(1);
    if (already?.length) continue;
    const letter = await balanceLetter(row.id, when, balance);
    if (!letter) continue;
    const result = await letter.send();
    await supabaseAdmin.from("integration_events").insert({
      provider: "studio",
      event_type: key,
      status: result.sent ? "succeeded" : "failed",
      reference_type: "proposal",
      reference_id: row.id,
      attempts: 1,
      payload: {
        balance_cents: balance,
        due,
        to: letter.to,
        subject: letter.subject,
        html: letter.html,
      },
    });
    if (result.sent) sent += 1;
  }
  return { sent };
}

function pdfItems(items: ProposalLineItemRow[]) {
  return items.map((item) => ({
    name: item.label,
    qty: item.quantity,
    unitPriceCents: item.unit_price_cents,
    lineTotalCents: item.line_total_cents,
    details: (item.description ?? "").split("\n").filter((line) => line.trim()),
  }));
}

/** "Visa 0523", from the card square charged */
function paidWith(payload: unknown) {
  const card = (payload as { card_details?: { card?: { card_brand?: string; last_4?: string } } })
    ?.card_details?.card;
  if (!card?.last_4) return null;
  const brand = (card.card_brand ?? "card")
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
  return `${brand} ${card.last_4}`;
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

  const invoiceNumber = await ensureInvoiceNumber(
    bundle.proposal.id,
    bundle.proposal.deposit_amount_cents,
  );
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

  const items = invoiceItems(bundle);
  const invoicePdf = await renderInvoicePdf({
    meta: documentMeta(bundle, "Invoice", invoiceNumber),
    items,
    amountCents: bundle.proposal.total_cents,
    depositCents: bundle.proposal.deposit_amount_cents,
    balanceCents: Math.max(0, bundle.proposal.total_cents - bundle.proposal.deposit_amount_cents),
    dueDate: null,
    sharedOn: invoiceSharedDate(bundle.proposal.sent_at),
    paymentLink,
    booking: bookingLineFor(bundle),
  });
  const invoicePath = `${bundle.proposal.id}/invoice-${invoiceNumber}.pdf`;
  await uploadDocument(invoicePath, invoicePdf);
  await supabaseAdmin.from("invoices").update({ pdf_path: invoicePath }).eq("id", invoiceId);
  return paymentLink;
}

async function ensureInvoiceNumber(proposalId: string, amountCents: number) {
  const existing = await supabaseAdmin
    .from("invoices")
    .select("id, number")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const number = invoiceTitle(existing.data.number);
    const patch: { amount_cents: number; number?: string } = { amount_cents: amountCents };
    if (number !== existing.data.number) patch.number = number;
    const { error } = await supabaseAdmin.from("invoices").update(patch).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return number;
  }
  const { claimInvoiceNumber } = await import("./invoice-number.server");
  const number = await claimInvoiceNumber();
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

/** Proposal links always go out on inside.saysukii.com, except while developing locally. */
function publicOrigin() {
  return import.meta.env.DEV ? appUrl() : PROPOSAL_ORIGIN;
}

/** Gives a proposal its name address the first time it's shared, and keeps it after that. */
async function ensureProposalSlug(
  proposalId: string,
  clientName: string,
  current?: string | null,
): Promise<string> {
  if (current) return current;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: rows, error } = await supabaseAdmin
      .from("proposals")
      .select("slug")
      .like("slug", `${proposalSlug(clientName)}%`);
    if (error) throw new Error(error.message);
    const taken = new Set((rows ?? []).map((row) => row.slug));
    const slug = freeProposalSlug(clientName, (candidate) => taken.has(candidate));
    const { error: saveError } = await supabaseAdmin
      .from("proposals")
      .update({ slug })
      .eq("id", proposalId);
    if (!saveError) return slug;
    // someone took the same name a moment ago; look again
    if (!/duplicate|unique/i.test(saveError.message)) throw new Error(saveError.message);
  }
  throw new Error("Could not give this proposal its link.");
}
