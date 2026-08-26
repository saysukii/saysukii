import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAgreementContent, AGREEMENT_TYPE_LABEL } from "@/lib/agreement-templates";

const serviceLine = z.enum(["floral", "wedding", "experiential"]);
const unit = z.enum(["each", "hour", "arrangement", "flat"]);
const stage = z.enum(["conversation", "proposal_out", "agreement", "booked", "complete"]);

/* ------------------------------------------------------------------ reads */

export const listRateCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("rate_card_items")
      .select("*")
      .eq("archived", false)
      .order("service_line")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select("*, projects(id, title, stage, service_line, event_date)")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*, accounts(id, name, tier, email, contact_name)")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("proposals")
      .select(
        "*, projects(id, title, service_line, event_date, stage, accounts(id, name, email)), invoices(*), agreements(*)",
      )
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProposal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: proposal, error } = await context.supabase
      .from("proposals")
      .select(
        "*, projects(*, accounts(*)), proposal_line_items(*), agreements(*), invoices(*)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proposal) throw new Error("Proposal not found");
    return proposal;
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [proposals, projects, invoices, accounts] = await Promise.all([
      context.supabase
        .from("proposals")
        .select("id, number, status, total_cents, sent_at, created_at, projects(title, accounts(name))")
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("projects")
        .select("id, title, stage, event_date, venue, service_line, accounts(name)")
        .eq("archived", false),
      context.supabase
        .from("invoices")
        .select("id, number, status, amount_cents, deposit_cents, balance_cents, due_date, proposal_id"),
      context.supabase.from("accounts").select("id, tier").eq("archived", false),
    ]);
    if (proposals.error) throw new Error(proposals.error.message);
    if (projects.error) throw new Error(projects.error.message);
    if (invoices.error) throw new Error(invoices.error.message);
    if (accounts.error) throw new Error(accounts.error.message);
    return {
      proposals: proposals.data ?? [],
      projects: projects.data ?? [],
      invoices: invoices.data ?? [],
      accounts: accounts.data ?? [],
    };
  });

/* ----------------------------------------------------------------- writes */

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(160),
        type: z.enum(["prospect", "client"]),
        tier: z.enum(["standard", "high_value"]),
        contact_name: z.string().max(160).nullable().optional(),
        email: z.string().email().nullable().optional().or(z.literal("")),
        phone: z.string().max(40).nullable().optional(),
        notes: z.string().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      type: data.type,
      tier: data.tier,
      contact_name: data.contact_name || null,
      email: data.email ? data.email : null,
      phone: data.phone || null,
      notes: data.notes || null,
    };
    const query = data.id
      ? context.supabase.from("accounts").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("accounts").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("accounts")
      .update({ archived: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        account_id: z.string().uuid(),
        title: z.string().min(1).max(160),
        service_line: serviceLine,
        event_date: z.string().nullable().optional().or(z.literal("")),
        venue: z.string().max(200).nullable().optional(),
        budget_estimate_cents: z.number().int().min(0).nullable().optional(),
        stage: stage.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      account_id: data.account_id,
      title: data.title,
      service_line: data.service_line,
      event_date: data.event_date ? data.event_date : null,
      venue: data.venue || null,
      budget_estimate_cents: data.budget_estimate_cents ?? null,
      ...(data.stage ? { stage: data.stage } : {}),
    };
    const query = data.id
      ? context.supabase.from("projects").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("projects").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const setProjectStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), stage }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ stage: data.stage })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveRateCardItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        service_line: serviceLine,
        name: z.string().min(1).max(160),
        description: z.string().max(600).nullable().optional(),
        unit,
        unit_price_cents: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      service_line: data.service_line,
      name: data.name,
      description: data.description || null,
      unit: data.unit,
      unit_price_cents: data.unit_price_cents,
    };
    const query = data.id
      ? context.supabase
          .from("rate_card_items")
          .update(payload)
          .eq("id", data.id)
          .select("*")
          .single()
      : context.supabase.from("rate_card_items").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveRateCardItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rate_card_items")
      .update({ archived: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------- proposal set generation */

const generateInput = z.object({
  project_id: z.string().uuid(),
  agreement_type: z.enum(["standard", "in_kind_barter"]),
  payment_option: z.enum(["deposit", "full"]),
  due_date: z.string().nullable().optional().or(z.literal("")),
  essence_image_paths: z.array(z.string().max(400)).max(12).default([]),
  line_items: z
    .array(
      z.object({
        rate_card_item_id: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(200),
        qty: z.number().min(0.01).max(10000),
      }),
    )
    .min(1)
    .max(100),
});

export const generateProposalSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*, accounts(*)")
      .eq("id", data.project_id)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found");

    // Pricing is resolved server-side from the rate card; browser prices are ignored.
    const rateCardIds = data.line_items
      .map((item) => item.rate_card_item_id)
      .filter((id): id is string => Boolean(id));
    const priceById = new Map<string, { price: number; name: string }>();
    if (rateCardIds.length > 0) {
      const { data: rateRows, error: rateError } = await supabase
        .from("rate_card_items")
        .select("id, name, unit_price_cents")
        .in("id", rateCardIds);
      if (rateError) throw new Error(rateError.message);
      for (const row of rateRows ?? []) {
        priceById.set(row.id, { price: row.unit_price_cents, name: row.name });
      }
    }


    const priced = data.line_items.map((item, index) => {
      const fromCard = item.rate_card_item_id ? priceById.get(item.rate_card_item_id) : undefined;
      if (item.rate_card_item_id && !fromCard) {
        throw new Error("A selected rate card item no longer exists");
      }
      const unitPrice = fromCard?.price ?? 0;
      const qty = Math.round(item.qty * 100) / 100;
      return {
        position: index,
        rate_card_item_id: item.rate_card_item_id ?? null,
        name: fromCard?.name ?? item.name,
        qty,
        unit_price_cents: unitPrice,
        line_total_cents: Math.round(qty * unitPrice),
      };
    });

    const subtotalCents = priced.reduce((sum, item) => sum + item.line_total_cents, 0);
    const totalCents = subtotalCents;
    const depositCents =
      data.payment_option === "deposit" ? Math.round(totalCents / 2) : totalCents;
    const balanceCents = totalCents - depositCents;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: proposalNumber, error: pnError }, { data: invoiceNumber, error: inError }] =
      await Promise.all([
        supabaseAdmin.rpc("next_proposal_number"),
        supabaseAdmin.rpc("next_invoice_number"),
      ]);
    if (pnError) throw new Error(pnError.message);
    if (inError) throw new Error(inError.message);

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        project_id: project.id,
        number: proposalNumber as unknown as string,
        status: "draft",
        subtotal_cents: subtotalCents,
        total_cents: totalCents,
        essence_image_urls: data.essence_image_paths,
      })
      .select("*")
      .single();
    if (proposalError) throw new Error(proposalError.message);

    const { error: linesError } = await supabase.from("proposal_line_items").insert(
      priced.map((item) => ({ ...item, proposal_id: proposal.id })),
    );
    if (linesError) throw new Error(linesError.message);

    const account = project.accounts as { name: string; contact_name: string | null } | null;
    const agreementContent = buildAgreementContent(data.agreement_type, {
      clientName: account?.name ?? "Client",
      contactName: account?.contact_name ?? null,
      projectTitle: project.title,
      eventDate: project.event_date,
      venue: project.venue,
      totalCents,
      depositCents,
      proposalNumber: proposal.number,
    });

    const { data: agreement, error: agreementError } = await supabase
      .from("agreements")
      .insert({
        proposal_id: proposal.id,
        type: data.agreement_type,
        content: agreementContent,
        version: 1,
      })
      .select("*")
      .single();
    if (agreementError) throw new Error(agreementError.message);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        proposal_id: proposal.id,
        number: invoiceNumber as unknown as string,
        amount_cents: totalCents,
        deposit_cents: depositCents,
        balance_cents: balanceCents,
        status: "unpaid",
        due_date: data.due_date ? data.due_date : null,
      })
      .select("*")
      .single();
    if (invoiceError) throw new Error(invoiceError.message);

    // Render and store the branded document set.
    const { renderProposalPdf, renderAgreementPdf, renderInvoicePdf } = await import(
      "@/lib/pdf.server"
    );
    const meta = {
      kind: "Proposal" as const,
      number: proposal.number,
      clientName: account?.name ?? "Client",
      contactName: account?.contact_name ?? null,
      projectTitle: project.title,
      serviceLine: project.service_line,
      eventDate: project.event_date,
      venue: project.venue,
    };
    const items = priced.map((item) => ({
      name: item.name,
      qty: item.qty,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.line_total_cents,
    }));

    const [proposalPdf, agreementPdf, invoicePdf] = await Promise.all([
      renderProposalPdf({
        meta,
        items,
        subtotalCents,
        totalCents,
        depositCents: data.payment_option === "deposit" ? depositCents : totalCents,
        essenceCount: data.essence_image_paths.length,
      }),
      renderAgreementPdf({
        meta: { ...meta, kind: "Agreement" },
        typeLabel: AGREEMENT_TYPE_LABEL[data.agreement_type],
        version: 1,
        content: agreementContent,
      }),
      renderInvoicePdf({
        meta: { ...meta, kind: "Invoice", number: invoice.number },
        items,
        amountCents: totalCents,
        depositCents,
        balanceCents,
        dueDate: invoice.due_date,
        paymentLink: null,
      }),
    ]);

    const folder = `${proposal.id}`;
    const uploads: Array<[string, Uint8Array]> = [
      [`${folder}/proposal-${proposal.number}.pdf`, proposalPdf],
      [`${folder}/agreement-${proposal.number}.pdf`, agreementPdf],
      [`${folder}/invoice-${invoice.number}.pdf`, invoicePdf],
    ];
    for (const [path, bytes] of uploads) {
      const { error: uploadError } = await supabaseAdmin.storage
        .from("documents")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error(uploadError.message);
    }

    await Promise.all([
      supabase.from("proposals").update({ pdf_url: uploads[0]![0] }).eq("id", proposal.id),
      supabase.from("agreements").update({ pdf_url: uploads[1]![0] }).eq("id", agreement.id),
      supabase.from("invoices").update({ pdf_url: uploads[2]![0] }).eq("id", invoice.id),
    ]);

    return { proposal_id: proposal.id, number: proposal.number, invoice_number: invoice.number };
  });

export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().min(1).max(400) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("documents")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getEssenceUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ paths: z.array(z.string().max(400)).max(12) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return { urls: [] as string[] };
    const { data: signed, error } = await context.supabase.storage
      .from("essence-images")
      .createSignedUrls(data.paths, 60 * 60);
    if (error) throw new Error(error.message);
    return { urls: (signed ?? []).map((entry) => entry.signedUrl) };
  });

export const markProposalSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: proposal, error } = await context.supabase
      .from("proposals")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("project_id")
      .single();
    if (error) throw new Error(error.message);

    const { error: stageError } = await context.supabase
      .from("projects")
      .update({ stage: "proposal_out" })
      .eq("id", proposal.project_id)
      .eq("stage", "conversation");
    if (stageError) throw new Error(stageError.message);
    return { ok: true };
  });

export const setProposalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "sent", "accepted", "declined"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: proposal, error } = await context.supabase
      .from("proposals")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("project_id")
      .single();
    if (error) throw new Error(error.message);
    if (data.status === "accepted") {
      await context.supabase
        .from("projects")
        .update({ stage: "agreement" })
        .eq("id", proposal.project_id)
        .in("stage", ["conversation", "proposal_out"]);
    }
    return { ok: true };
  });

export const savePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), link: z.string().url().max(600).or(z.literal("")) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoices")
      .update({ stripe_payment_link: data.link || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
