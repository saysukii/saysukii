import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin, requireStudioAuth } from "@/integrations/supabase/studio-auth-middleware";

const projectStatus = z.enum(["pre_production", "production", "post_production", "archived"]);
const orderStatus = z.enum(["draft", "ordered", "received"]);

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .handler(async ({ context }) => {
    const [projects, venues] = await Promise.all([
      context.supabase.from("projects").select("*").eq("archived", false).order("event_date"),
      context.supabase.from("venues").select("id, name, address, load_in_notes"),
    ]);
    if (projects.error) throw new Error(projects.error.message);
    if (venues.error && context.profile.role === "admin") throw new Error(venues.error.message);

    const venueById = new Map((venues.data ?? []).map((venue) => [venue.id, venue]));
    let clientById = new Map<
      string,
      { id: string; name: string; email: string; organization: string | null; phone: string | null }
    >();
    let proposalById = new Map<
      string,
      {
        id: string;
        number: string;
        status: string;
        total_cents: number;
        deposit_amount_cents: number;
      }
    >();

    if (context.profile.role === "admin") {
      const [clients, proposals] = await Promise.all([
        context.supabase.from("clients").select("id, name, email, organization, phone"),
        context.supabase
          .from("proposals")
          .select("id, number, status, total_cents, deposit_amount_cents"),
      ]);
      if (clients.error) throw new Error(clients.error.message);
      if (proposals.error) throw new Error(proposals.error.message);
      clientById = new Map((clients.data ?? []).map((client) => [client.id, client]));
      proposalById = new Map((proposals.data ?? []).map((proposal) => [proposal.id, proposal]));
    }

    return {
      role: context.profile.role,
      projects: (projects.data ?? []).map((project) => {
        const safeProject = {
          id: project.id,
          event_name: project.event_name,
          event_date: project.event_date,
          venue_id: project.venue_id,
          venue_text: project.venue_text,
          status: project.status,
          notes: project.notes,
          archived: project.archived,
          created_at: project.created_at,
          updated_at: project.updated_at,
        };
        return {
          ...safeProject,
          venue: project.venue_id ? (venueById.get(project.venue_id) ?? null) : null,
          client:
            context.profile.role === "admin" ? (clientById.get(project.client_id) ?? null) : null,
          proposal:
            context.profile.role === "admin"
              ? (proposalById.get(project.proposal_id) ?? null)
              : null,
        };
      }),
    };
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const projectResult = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (!projectResult.data) throw new Error("Project not found");
    const project = projectResult.data;

    const [arrangements, order, files, venue] = await Promise.all([
      context.supabase
        .from("project_arrangements")
        .select("*")
        .eq("project_id", data.id)
        .order("created_at"),
      context.supabase.from("orders").select("*").eq("project_id", data.id).maybeSingle(),
      context.supabase
        .from("files")
        .select("*")
        .eq("owner_type", "project")
        .eq("owner_id", data.id)
        .order("created_at", { ascending: false }),
      project.venue_id
        ? context.supabase
            .from("venues")
            .select("id, name, address, contact_name, contact_phone, load_in_notes")
            .eq("id", project.venue_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    for (const result of [arrangements, order, files, venue]) {
      if (result.error) throw new Error(result.error.message);
    }

    const orderItems = order.data
      ? await context.supabase
          .from("order_items")
          .select("*")
          .eq("order_id", order.data.id)
          .order("created_at")
      : { data: [], error: null };
    if (orderItems.error) throw new Error(orderItems.error.message);

    const stemIds = [
      ...new Set((orderItems.data ?? []).flatMap((item) => (item.stem_id ? [item.stem_id] : []))),
    ];
    const stemResult =
      stemIds.length > 0
        ? await context.supabase
            .from("stems")
            .select("id, common_name, variety, color, unit, vendor_id")
            .in("id", stemIds)
        : { data: [], error: null };
    if (stemResult.error) throw new Error(stemResult.error.message);
    const stemById = new Map((stemResult.data ?? []).map((stem) => [stem.id, stem]));

    let vendorById = new Map<
      string,
      { id: string; name: string; type: string; ordering_method: string | null }
    >();
    if (context.profile.role === "admin") {
      const vendorIds = [
        ...new Set(
          (orderItems.data ?? []).flatMap((item) => (item.vendor_id ? [item.vendor_id] : [])),
        ),
      ];
      if (vendorIds.length > 0) {
        const vendors = await context.supabase
          .from("vendors")
          .select("id, name, type, ordering_method")
          .in("id", vendorIds);
        if (vendors.error) throw new Error(vendors.error.message);
        vendorById = new Map((vendors.data ?? []).map((vendor) => [vendor.id, vendor]));
      }
    }

    const projectFiles = await Promise.all(
      (files.data ?? []).map(async (file) => {
        const signed = await context.supabase.storage
          .from("project-files")
          .createSignedUrl(file.file_path, 60 * 30);
        return { ...file, signed_url: signed.data?.signedUrl ?? null };
      }),
    );

    const safeProject = {
      id: project.id,
      event_name: project.event_name,
      event_date: project.event_date,
      venue_id: project.venue_id,
      venue_text: project.venue_text,
      status: project.status,
      notes: project.notes,
      google_event_id: project.google_event_id,
      archived: project.archived,
      created_at: project.created_at,
      updated_at: project.updated_at,
    };

    let adminContext: {
      client: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        organization: string | null;
        notes: string | null;
      } | null;
      proposal: {
        id: string;
        number: string;
        status: string;
        subtotal_cents: number;
        tax_cents: number;
        total_cents: number;
        deposit_amount_cents: number;
        accepted_at: string | null;
        pdf_path: string | null;
      } | null;
      invoices: Array<{
        id: string;
        number: string;
        amount_cents: number;
        status: string;
        due_date: string | null;
        pdf_path: string | null;
      }>;
      payments: Array<{
        id: string;
        amount_cents: number;
        status: string;
        paid_at: string | null;
      }>;
    } | null = null;

    if (context.profile.role === "admin") {
      const [client, proposal, invoices, payments] = await Promise.all([
        context.supabase
          .from("clients")
          .select("id, name, email, phone, organization, notes")
          .eq("id", project.client_id)
          .maybeSingle(),
        context.supabase
          .from("proposals")
          .select(
            "id, number, status, subtotal_cents, tax_cents, total_cents, deposit_amount_cents, accepted_at, pdf_path",
          )
          .eq("id", project.proposal_id)
          .maybeSingle(),
        context.supabase
          .from("invoices")
          .select("id, number, amount_cents, status, due_date, pdf_path")
          .eq("proposal_id", project.proposal_id),
        context.supabase
          .from("payments")
          .select("id, amount_cents, status, paid_at")
          .eq("proposal_id", project.proposal_id)
          .order("created_at", { ascending: false }),
      ]);
      for (const result of [client, proposal, invoices, payments]) {
        if (result.error) throw new Error(result.error.message);
      }
      adminContext = {
        client: client.data,
        proposal: proposal.data,
        invoices: invoices.data ?? [],
        payments: payments.data ?? [],
      };
    }

    return {
      role: context.profile.role,
      project: safeProject,
      venue: venue.data,
      arrangements: arrangements.data ?? [],
      files: projectFiles,
      order: order.data,
      order_items: (orderItems.data ?? []).map((item) => {
        const stem = item.stem_id ? (stemById.get(item.stem_id) ?? null) : null;
        return {
          ...item,
          stem,
          vendor:
            context.profile.role === "admin" && item.vendor_id
              ? (vendorById.get(item.vendor_id) ?? null)
              : null,
        };
      }),
      admin: adminContext,
    };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        event_name: z.string().trim().min(1).max(200),
        event_date: z.string().date(),
        venue_id: z.string().uuid().nullable().optional().or(z.literal("")),
        venue_text: z.string().max(300).nullable().optional(),
        status: projectStatus,
        notes: z.string().max(10000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("projects")
      .update({
        event_name: data.event_name,
        event_date: data.event_date,
        venue_id: data.venue_id || null,
        venue_text: data.venue_text?.trim() || null,
        status: data.status,
        notes: data.notes?.trim() || null,
        archived: data.status === "archived",
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: orderStatus }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setOrderItemReceived = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), received: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_order_item_received", {
      p_order_item_id: data.id,
      p_received: data.received,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
