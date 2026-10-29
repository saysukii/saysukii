import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { clientSlugs, inquirySlugs, isRecordUuid } from "@/lib/os/inquiry-desk";

const clientType = z.enum(["individual", "brand", "corporate", "venue_partner"]);
const vendorType = z.enum(["warehouse", "wholesaler", "rental", "other"]);
const nullableText = (max: number) => z.string().max(max).nullable().optional();

const clientInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  phone: nullableText(50),
  organization: nullableText(160),
  type: clientType,
  source: nullableText(160),
  notes: nullableText(5000),
});

const venueInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  contact_name: nullableText(160),
  contact_email: z.string().trim().email().max(320).nullable().optional().or(z.literal("")),
  contact_phone: nullableText(50),
  load_in_notes: nullableText(5000),
});

const vendorInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  type: vendorType,
  contact_name: nullableText(160),
  contact_email: z.string().trim().email().max(320).nullable().optional().or(z.literal("")),
  contact_phone: nullableText(50),
  ordering_method: nullableText(5000),
});

const archiveInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) });

function optional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({ include_archived: z.boolean().optional().default(false) })
      .optional()
      .default({ include_archived: false })
      .parse(input),
  )
  .handler(async ({ data: options, context }) => {
    const query = context.supabase.from("clients").select("*").order("name");
    const { data, error } = options.include_archived
      ? await query
      : await query.eq("archived", false);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function resolveClientId(client: SupabaseClient<Database>, key: string) {
  if (isRecordUuid(key)) return key;
  const { data, error } = await client.from("clients").select("id, name, created_at");
  if (error) throw new Error(error.message);
  const slugs = clientSlugs(data ?? []);
  const match = (data ?? []).find((row) => slugs.get(row.id) === key);
  if (!match) throw new Error("Client not found");
  return match.id;
}

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().trim().min(1).max(160) }).parse(input))
  .handler(async ({ data, context }) => {
    const clientId = await resolveClientId(context.supabase, data.id);
    const clientResult = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    if (clientResult.error) throw new Error(clientResult.error.message);
    if (!clientResult.data) throw new Error("Client not found");

    const [inquiries, proposals, projects, files] = await Promise.all([
      context.supabase
        .from("inquiries")
        .select("*")
        .eq("client_id", clientId)
        .eq("archived", false)
        .order("received_at", { ascending: false }),
      context.supabase
        .from("proposals")
        .select(
          "id, number, inquiry_id, event_date, venue_id, venue_text, total_cents, deposit_amount_cents, status, pdf_path, sent_at, accepted_at, created_at",
        )
        .eq("client_id", clientId)
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("projects")
        .select("*")
        .eq("client_id", clientId)
        .order("event_date", { ascending: false }),
      context.supabase
        .from("files")
        .select("*")
        .eq("owner_type", "client")
        .eq("owner_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

    for (const result of [inquiries, proposals, projects, files]) {
      if (result.error) throw new Error(result.error.message);
    }

    const clientFiles = await Promise.all(
      (files.data ?? []).map(async (file) => {
        const signed = await context.supabase.storage
          .from("project-files")
          .createSignedUrl(file.file_path, 60 * 30);
        return { ...file, signed_url: signed.data?.signedUrl ?? null };
      }),
    );

    const [allInquiries, allClients] = await Promise.all([
      context.supabase.from("inquiries").select("id, client_id, received_at").eq("archived", false),
      context.supabase.from("clients").select("id, name"),
    ]);
    const names = new Map((allClients.data ?? []).map((row) => [row.id, row.name]));
    const slugs = inquirySlugs(
      (allInquiries.data ?? []).map((row) => ({
        id: row.id,
        received_at: row.received_at,
        client: { name: names.get(row.client_id) ?? "client" },
      })),
    );

    return {
      client: clientResult.data,
      slug: clientSlugs(allClients.data ?? []).get(clientResult.data.id) ?? clientResult.data.id,
      inquiries: (inquiries.data ?? []).map((inquiry) => ({
        ...inquiry,
        slug: slugs.get(inquiry.id) ?? inquiry.id,
      })),
      proposals: proposals.data ?? [],
      projects: projects.data ?? [],
      files: clientFiles,
    };
  });

export const saveClient = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => clientInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      email: data.email,
      phone: optional(data.phone),
      organization: optional(data.organization),
      type: data.type,
      source: optional(data.source),
      notes: optional(data.notes),
    };
    const query = data.id
      ? context.supabase.from("clients").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("clients").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

const importClientInput = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(160),
      email: z.string().trim().email().max(320),
      phone: nullableText(50),
      organization: nullableText(160),
      type: clientType,
      source: nullableText(160),
      notes: nullableText(5000),
    }),
  )
  .max(500);

const importVenueInput = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(200),
      address: z.string().trim().min(1).max(500),
      contact_name: nullableText(160),
      contact_email: z.string().trim().email().max(320).nullable().optional().or(z.literal("")),
      contact_phone: nullableText(50),
      load_in_notes: nullableText(5000),
    }),
  )
  .max(500);

const importVendorInput = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(200),
      type: vendorType,
      contact_name: nullableText(160),
      contact_email: z.string().trim().email().max(320).nullable().optional().or(z.literal("")),
      contact_phone: nullableText(50),
      ordering_method: nullableText(5000),
    }),
  )
  .max(500);

export const importClients = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => importClientInput.parse(input))
  .handler(async ({ data, context }) => {
    const emails = data.map((row) => row.email.toLowerCase());
    const { data: existing, error: lookupError } = await context.supabase
      .from("clients")
      .select("email")
      .in("email", emails);
    if (lookupError) throw new Error(lookupError.message);
    const seen = new Set((existing ?? []).map((row) => row.email.toLowerCase()));
    const fresh = data.filter((row) => {
      const email = row.email.toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
    if (fresh.length === 0) return { added: 0, skipped: data.length };
    const { error } = await context.supabase.from("clients").insert(
      fresh.map((row) => ({
        name: row.name,
        email: row.email,
        phone: optional(row.phone),
        organization: optional(row.organization),
        type: row.type,
        source: optional(row.source) ?? "csv",
        notes: optional(row.notes),
      })),
    );
    if (error) throw new Error(error.message);
    return { added: fresh.length, skipped: data.length - fresh.length };
  });

export const archiveClient = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => archiveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({ archived: true })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDirectories = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const [venues, vendors] = await Promise.all([
      context.supabase.from("venues").select("*").eq("archived", false).order("name"),
      context.supabase.from("vendors").select("*").eq("archived", false).order("name"),
    ]);
    if (venues.error) throw new Error(venues.error.message);
    if (vendors.error) throw new Error(vendors.error.message);
    return { venues: venues.data ?? [], vendors: vendors.data ?? [] };
  });

export const saveVenue = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => venueInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      address: data.address,
      contact_name: optional(data.contact_name),
      contact_email: optional(data.contact_email),
      contact_phone: optional(data.contact_phone),
      load_in_notes: optional(data.load_in_notes),
    };
    const query = data.id
      ? context.supabase.from("venues").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("venues").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveVenue = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => archiveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("venues")
      .update({ archived: true })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveVendor = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => vendorInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      type: data.type,
      contact_name: optional(data.contact_name),
      contact_email: optional(data.contact_email),
      contact_phone: optional(data.contact_phone),
      ordering_method: optional(data.ordering_method),
    };
    const query = data.id
      ? context.supabase.from("vendors").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("vendors").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveVendor = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => archiveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vendors")
      .update({ archived: true })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importVenues = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => importVenueInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: lookupError } = await context.supabase
      .from("venues")
      .select("name")
      .eq("archived", false);
    if (lookupError) throw new Error(lookupError.message);
    const seen = new Set((existing ?? []).map((row) => row.name.trim().toLowerCase()));
    const fresh = data.filter((row) => {
      const name = row.name.trim().toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    if (fresh.length === 0) return { added: 0, skipped: data.length };
    const { error } = await context.supabase.from("venues").insert(
      fresh.map((row) => ({
        name: row.name,
        address: row.address,
        contact_name: optional(row.contact_name),
        contact_email: optional(row.contact_email),
        contact_phone: optional(row.contact_phone),
        load_in_notes: optional(row.load_in_notes),
      })),
    );
    if (error) throw new Error(error.message);
    return { added: fresh.length, skipped: data.length - fresh.length };
  });

export const importVendors = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => importVendorInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: lookupError } = await context.supabase
      .from("vendors")
      .select("name")
      .eq("archived", false);
    if (lookupError) throw new Error(lookupError.message);
    const seen = new Set((existing ?? []).map((row) => row.name.trim().toLowerCase()));
    const fresh = data.filter((row) => {
      const name = row.name.trim().toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    if (fresh.length === 0) return { added: 0, skipped: data.length };
    const { error } = await context.supabase.from("vendors").insert(
      fresh.map((row) => ({
        name: row.name,
        type: row.type,
        contact_name: optional(row.contact_name),
        contact_email: optional(row.contact_email),
        contact_phone: optional(row.contact_phone),
        ordering_method: optional(row.ordering_method),
      })),
    );
    if (error) throw new Error(error.message);
    return { added: fresh.length, skipped: data.length - fresh.length };
  });
