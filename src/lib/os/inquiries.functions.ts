import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin, requireStudioAuth } from "@/integrations/supabase/studio-auth-middleware";
import type { Database, EventType, InquiryStatus } from "@/integrations/supabase/types";
import { inquirySlugs, isRecordUuid, shareNote } from "@/lib/os/inquiry-desk";
import { assembleStudioToday } from "@/lib/os/studio-today";
import {
  BOOK_DETECTION_STATUSES,
  DESK_DETECTION_STATUSES,
  approvedCandidatePatch,
  inquiryOriginFromCreator,
  isReviewCandidate,
} from "@/lib/os/inquiry-detection";
import { listStudioTasks, syncInquiryAutoTaskFor, syncInquiryAutoTasks } from "@/lib/os/tasks.functions";
import { refreshInquirySummarySafe, summarizeInquiryRecord } from "@/lib/os/inquiry-summary.server";
import { buildInquirySummaryFacts, resolveInquirySummaryText } from "@/lib/os/inquiry-summary";
import { noteWriter, signatureName, signatureText, wroteNote } from "@/lib/os/mail-signature";
import { proposalCards } from "@/lib/proposal-link";

const eventType = z.enum([
  "wedding",
  "brand_activation",
  "corporate",
  "private",
  "photoshoot",
  "subscription",
  "other",
]);
const clientType = z.enum(["individual", "brand", "corporate", "venue_partner"]);
const inquiryStatus = z.enum([
  "new",
  "contacted",
  "in_conversation",
  "proposal_sent",
  "booked",
  "closed",
]);

const inquiryDetails = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(320),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .default("")
      .refine((value) => !value || /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(value.replace(/^\+1\s*/, "")), {
        message: "Enter a 10-digit phone number",
      }),
    organization: z.string().trim().max(160).optional().default(""),
    client_type: clientType.default("individual"),
    event_date: z.string().date().nullable().optional(),
    event_date_tbd: z.boolean().default(false),
    event_type: eventType,
    venue_text: z.string().trim().max(240).optional().default(""),
    guest_count: z.number().int().min(0).max(100000).nullable().optional(),
    budget_range: z.string().trim().max(120).optional().default(""),
    source: z.string().trim().max(160).optional().default(""),
    message: z.string().trim().max(6000).optional().default(""),
  })
  .superRefine((value, context) => {
    if (!value.event_date && !value.event_date_tbd) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["event_date"],
        message: "Choose an event date or mark it as TBD",
      });
    }
  });

const publicInquiryInput = inquiryDetails.and(
  z.object({ website: z.string().max(240).optional().default("") }),
);
const adminInquiryInput = inquiryDetails;

type InquiryDetails = z.infer<typeof inquiryDetails>;
type StudioClient = SupabaseClient<Database>;

export const INQUIRY_STATUSES: InquiryStatus[] = [
  "new",
  "contacted",
  "in_conversation",
  "proposal_sent",
  "booked",
  "closed",
];

async function findOrCreateClient(client: StudioClient, input: InquiryDetails) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const { data: existing, error: findError } = await client
    .from("clients")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing.id;

  const { data: created, error: createError } = await client
    .from("clients")
    .insert({
      name: input.name.trim(),
      email: normalizedEmail,
      phone: input.phone || null,
      organization: input.organization || null,
      type: input.client_type,
      source: input.source || null,
    })
    .select("id")
    .single();

  if (!createError && created) return created.id;
  if (createError?.code !== "23505") {
    throw new Error(createError?.message ?? "Unable to create client");
  }

  const { data: racedClient, error: racedError } = await client
    .from("clients")
    .select("id")
    .eq("email", normalizedEmail)
    .single();
  if (racedError) throw new Error(racedError.message);
  return racedClient.id;
}

async function createInquiryWithClient(
  client: StudioClient,
  input: InquiryDetails,
  createdBy: string | null,
) {
  const clientId = await findOrCreateClient(client, input);
  const { data: inquiry, error } = await client
    .from("inquiries")
    .insert({
      client_id: clientId,
      event_date: input.event_date_tbd ? null : (input.event_date ?? null),
      event_date_tbd: input.event_date_tbd,
      event_type: input.event_type,
      venue_text: input.venue_text || null,
      guest_count: input.guest_count ?? null,
      budget_range: input.budget_range || null,
      source: input.source || null,
      message: input.message || null,
      origin: inquiryOriginFromCreator(createdBy),
      detection_status: "na",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const note = shareNote(input.message);
  if (note) {
    const { error: threadError } = await client.from("inquiry_messages").insert({
      inquiry_id: inquiry.id,
      direction: "inbound",
      channel: "form",
      subject: null,
      body: note,
      from_address: input.email.trim().toLowerCase(),
      to_address: process.env["GMAIL_INBOX"] ?? "info@saysukii.com",
      author: input.name.trim(),
      sent_at: inquiry.received_at,
      status: "received",
    });
    if (threadError) throw new Error(threadError.message);
  }

  await syncInquiryAutoTaskFor(client, inquiry.id);
  await refreshInquirySummarySafe(client, inquiry.id);
  return inquiry;
}

export type InquirySourcePeek = {
  subject: string | null;
  body: string | null;
  from_addr: string | null;
};

async function listInquiriesWithClients(
  client: StudioClient,
  detectionStatuses = BOOK_DETECTION_STATUSES,
) {
  const [inquiryResult, clientResult] = await Promise.all([
    client
      .from("inquiries")
      .select("*")
      .eq("archived", false)
      .in("detection_status", detectionStatuses)
      .order("received_at", { ascending: true }),
    client.from("clients").select("*"),
  ]);
  if (inquiryResult.error) throw new Error(inquiryResult.error.message);
  if (clientResult.error) throw new Error(clientResult.error.message);

  const clientsById = new Map((clientResult.data ?? []).map((row) => [row.id, row]));
  const rows = (inquiryResult.data ?? []).map((inquiry) => ({
    ...inquiry,
    client: clientsById.get(inquiry.client_id) ?? null,
    source_peek: null as InquirySourcePeek | null,
  }));
  const slugs = inquirySlugs(rows);
  return attachSourcePeeks(
    client,
    rows.map((row) => ({ ...row, slug: slugs.get(row.id) ?? row.id })),
  );
}

async function attachSourcePeeks<T extends { source_message_id: string | null; source_peek: InquirySourcePeek | null }>(
  client: StudioClient,
  rows: T[],
) {
  const ids = [...new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return rows;
  const { data, error } = await client
    .from("inbound_messages")
    .select("id, subject, body, from_addr")
    .in("id", ids);
  if (error) return rows;
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return rows.map((row) => {
    const source = row.source_message_id ? byId.get(row.source_message_id) : null;
    return {
      ...row,
      source_peek: source
        ? { subject: source.subject, body: source.body, from_addr: source.from_addr }
        : row.source_peek,
    };
  });
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}


export const submitPublicInquiry = createServerFn({ method: "POST" })
  .validator((input: unknown) => publicInquiryInput.parse(input))
  .handler(async ({ data }) => {
    // Honeypot submissions get a normal success response without touching the database.
    if (data.website.trim()) return { ok: true as const, preview: false as const };

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      if (import.meta.env.DEV) {
        console.warn("[inquiry] kept in this browser. SUPABASE_SERVICE_ROLE_KEY is not set.");
        return { ok: true as const, preview: true as const };
      }
      throw new Error(
        "Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inquiry = await createInquiryWithClient(supabaseAdmin, data, null);
    const { sendInquiryReceivedEmail } = await import("@/lib/os/inquiry-email.server");
    await sendInquiryReceivedEmail({
      clientName: data.name,
      email: data.email.toLowerCase(),
      eventDate: inquiry.event_date,
      eventType: inquiry.event_type,
      venue: inquiry.venue_text,
    });
    return { ok: true as const, preview: false as const };
  });

export const listFreshArrivals = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const inquiryResult = await context.supabase
      .from("inquiries")
      .select("id, client_id")
      .eq("archived", false)
      .eq("origin", "form")
      .eq("status", "new")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(8);
    if (inquiryResult.error) throw new Error(inquiryResult.error.message);
    const rows = inquiryResult.data ?? [];
    if (rows.length === 0) return [];
    const clientResult = await context.supabase
      .from("clients")
      .select("id, name")
      .in(
        "id",
        rows.map((row) => row.client_id),
      );
    if (clientResult.error) throw new Error(clientResult.error.message);
    const names = new Map((clientResult.data ?? []).map((row) => [row.id, row.name]));
    return rows.map((row) => ({ id: row.id, name: names.get(row.client_id) ?? "someone" }));
  });

export const createAdminInquiry = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => adminInquiryInput.parse(input))
  .handler(async ({ data, context }) => {
    const inquiry = await createInquiryWithClient(context.supabase, data, context.profile.id);
    return { id: inquiry.id };
  });

export const listInquiryPipeline = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => listInquiriesWithClients(context.supabase, DESK_DETECTION_STATUSES));

export const getInquiryDashboard = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const [inquiries, projectsResult, clientsResult, tasks, appointmentsResult] = await Promise.all([
      listInquiriesWithClients(context.supabase),
      context.supabase
        .from("projects")
        .select("*")
        .eq("archived", false)
        .order("event_date", { ascending: true }),
      context.supabase.from("clients").select("*"),
      listStudioTasks(context.supabase),
      context.supabase
        .from("appointments")
        .select("id, starts_at, guest_name, guest_email, note")
        .gte("starts_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("starts_at"),
    ]);
    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (clientsResult.error) throw new Error(clientsResult.error.message);

    const wrote = new Set<string>();
    if (inquiries.length > 0) {
      const heard = await context.supabase
        .from("inquiry_messages")
        .select("inquiry_id")
        .eq("direction", "outbound")
        .eq("channel", "email")
        .eq("status", "sent")
        .in(
          "inquiry_id",
          inquiries.map((inquiry) => inquiry.id),
        );
      if (heard.error) throw new Error(heard.error.message);
      for (const row of heard.data ?? []) wrote.add(row.inquiry_id);
    }
    const leads = inquiries.map((inquiry) => ({
      ...inquiry,
      studio_wrote: wrote.has(inquiry.id),
    }));

    const names = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
    await syncInquiryAutoTasks(context.supabase, leads, names, tasks);
    const latestTasks = await listStudioTasks(context.supabase);

    const projectClients = new Map((clientsResult.data ?? []).map((client) => [client.id, client]));
    const storedTalks = appointmentsResult.error
      ? []
      : (appointmentsResult.data ?? []).map((row) => ({
          id: row.id,
          startsAt: row.starts_at,
          name: row.guest_name,
          email: row.guest_email,
          note: row.note ?? "",
        }));
    const googleTalks = await import("@/lib/os/google.server")
      .then(({ listStudioGoogleEvents }) =>
        listStudioGoogleEvents({
          skipIds: (projectsResult.data ?? [])
            .map((project) => project.google_event_id)
            .filter((id): id is string => Boolean(id)),
          skipStarts: storedTalks.map((talk) => talk.startsAt),
        }),
      )
      .then((events) =>
        events.map((event) => ({
          id: event.id,
          startsAt: event.startsAt,
          name: event.name,
          email: "",
          note: "",
          allDay: event.allDay,
        })),
      )
      .catch(() => []);
    return assembleStudioToday({
      inquiries: leads,
      projects: (projectsResult.data ?? []).map((project) => ({
        ...project,
        client: projectClients.get(project.client_id) ?? null,
      })),
      tasks: latestTasks,
      appointments: [...storedTalks, ...googleTalks],
    });
  });

export const setInquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: inquiryStatus,
        closed_reason: z.string().trim().max(1000).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: current, error: findError } = await context.supabase
      .from("inquiries")
      .select("contacted_at, proposal_sent_at, booked_at, detection_status")
      .eq("id", data.id)
      .eq("archived", false)
      .single();
    if (findError) throw new Error(findError.message);
    if (isReviewCandidate(current)) {
      throw new Error("Approve this inquiry before moving it through the book.");
    }

    const now = new Date().toISOString();
    const timestamps: {
      contacted_at?: string;
      proposal_sent_at?: string;
      booked_at?: string;
      closed_at?: string | null;
      closed_reason?: string | null;
    } = {};
    if (data.status === "contacted" && !current.contacted_at) {
      timestamps.contacted_at = now;
    }
    if (data.status === "proposal_sent" && !current.proposal_sent_at) {
      timestamps.proposal_sent_at = now;
    }
    if (data.status === "booked" && !current.booked_at) {
      timestamps.booked_at = now;
    }
    if (data.status === "closed") {
      timestamps.closed_at = now;
      timestamps.closed_reason = data.closed_reason || null;
    } else {
      timestamps.closed_at = null;
      timestamps.closed_reason = null;
    }

    // Closing is the archive. The flag takes it off the book; status retires its task.
    const { error } = await context.supabase
      .from("inquiries")
      .update({
        status: data.status,
        archived: data.status === "closed",
        ...timestamps,
      })
      .eq("id", data.id)
      .eq("archived", false);
    if (error) throw new Error(error.message);
    await syncInquiryAutoTaskFor(context.supabase, data.id);
    await refreshInquirySummarySafe(context.supabase, data.id);
    return { ok: true as const };
  });

export const updateInquiryMoment = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        venue_text: z.string().trim().max(300).optional(),
        budget_range: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { venue_text?: string | null; budget_range?: string | null } = {};
    if (data.venue_text !== undefined) patch.venue_text = data.venue_text || null;
    if (data.budget_range !== undefined) patch.budget_range = data.budget_range || null;
    if (!Object.keys(patch).length) return { ok: true as const };
    const { error } = await context.supabase
      .from("inquiries")
      .update(patch)
      .eq("id", data.id)
      .eq("archived", false);
    if (error) throw new Error(error.message);
    await refreshInquirySummarySafe(context.supabase, data.id);
    return { ok: true as const };
  });

export const syncStudioInbox = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    try {
      const { runGmailInboundSync } = await import("@/lib/os/gmail-inbound.server");
      const { runGmailInboundRouting } = await import("@/lib/os/inquiry-routing.server");
      const captured = await runGmailInboundSync();
      const routed = await runGmailInboundRouting();
      return {
        scanned: captured.scanned,
        inserted: captured.inserted,
        candidates: routed.candidates,
        attached: routed.attached,
        skipped: Boolean(captured.skipped && routed.skipped),
        reason: routed.skipped ? routed.reason : captured.reason,
      };
    } catch (error) {
      console.error("[inbox] sync failed:", error instanceof Error ? error.message : error);
      return {
        scanned: 0,
        inserted: 0,
        candidates: 0,
        attached: 0,
        skipped: true,
        reason: "sync_failed",
      };
    }
  });

export type InquiryPipelineItem = Awaited<ReturnType<typeof listInquiriesWithClients>>[number];
export type InquiryEventType = EventType;

const floridaAddressSearch = z.object({
  q: z.string().trim().min(2).max(120),
});

type PhotonFeature = {
  properties?: {
    osm_id?: number | string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

function formatFloridaAddress(properties: NonNullable<PhotonFeature["properties"]>) {
  const streetLine = [properties.housenumber, properties.street].filter(Boolean).join(" ").trim();
  const name = properties.name?.trim();
  const city = properties.city?.trim();

  let headline = streetLine || name || "";
  if (streetLine && name && name !== streetLine && !streetLine.includes(name)) {
    headline = `${name}, ${streetLine}`;
  }

  return [headline, city, "FL"].filter(Boolean).join(", ");
}

async function searchPhotonPlaces(query: string) {
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "12");
    url.searchParams.set("lang", "en");
    url.searchParams.set("bbox", "-87.6348,24.3963,-79.9743,31.000");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const suggestions: Array<{ id: string; label: string; value: string; provider: "fallback" }> = [];

    for (const feature of payload.features ?? []) {
      const properties = feature.properties;
      if (!properties) continue;

      const state = properties.state?.trim();
      if (state && state !== "Florida" && state !== "FL") continue;
      if (properties.country && properties.country !== "United States") continue;

      const label = formatFloridaAddress(properties);
      if (!label || seen.has(label)) continue;

      seen.add(label);
      suggestions.push({
        id: String(properties.osm_id ?? label),
        label,
        value: label,
        provider: "fallback",
      });

      if (suggestions.length >= 6) break;
    }

    return suggestions;
  } catch {
    return [];
  }
}

export const searchFloridaAddresses = createServerFn({ method: "GET" })
  .validator((input: unknown) => floridaAddressSearch.parse(input))
  .handler(async ({ data }) => {
    const { searchGooglePlaces } = await import("@/lib/os/maps.server");
    const google = searchGooglePlaces(data.q).catch(() => null);
    const photon = searchPhotonPlaces(data.q);

    return new Promise<
      Array<{ id: string; label: string; value: string; provider?: string }>
    >((resolve) => {
      let pending = 2;
      const finish = (places: Array<{ id: string; label: string; value: string }> | null) => {
        if (places?.length) {
          resolve(places);
          return;
        }
        pending -= 1;
        if (pending === 0) resolve([]);
      };
      void google.then(finish);
      void photon.then(finish);
    });
  });

async function resolveInquiryId(client: StudioClient, key: string) {
  if (isRecordUuid(key)) return key;
  const rows = await listInquiriesWithClients(client);
  const match = rows.find((row) => row.slug === key);
  if (!match) throw new Error("Inquiry not found");
  return match.id;
}

export const getInquiryWorkspace = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().trim().min(1).max(160) }).parse(input))
  .handler(async ({ data, context }) => {
    const inquiryId = await resolveInquiryId(context.supabase, data.id);
    const inquiryResult = await context.supabase
      .from("inquiries")
      .select("*")
      .eq("id", inquiryId)
      .eq("archived", false)
      .maybeSingle();
    if (inquiryResult.error) throw new Error(inquiryResult.error.message);
    if (!inquiryResult.data) throw new Error("Inquiry not found");

    const [clientResult, messagesResult, proposalsResult, filesResult, gmailResult, googleResult, inboxResult, meetingsResult] =
      await Promise.all([
        context.supabase.from("clients").select("*").eq("id", inquiryResult.data.client_id).maybeSingle(),
        context.supabase
          .from("inquiry_messages")
          .select("*")
          .eq("inquiry_id", inquiryId)
          .order("sent_at", { ascending: true }),
        context.supabase
          .from("proposals")
          .select("id, number, status, total_cents, event_date, created_at, access_token, deposit_amount_cents, pdf_path, notes, viewed_at")
          .eq("inquiry_id", inquiryId)
          .eq("archived", false)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("files")
          .select("*")
          .eq("owner_type", "inquiry")
          .eq("owner_id", inquiryId)
          .order("created_at", { ascending: false }),
        context.supabase.from("integration_connections").select("status").eq("provider", "gmail").maybeSingle(),
        context.supabase.from("integration_connections").select("status").eq("provider", "google").maybeSingle(),
        context.supabase.from("email_integration").select("status").eq("provider", "gmail").maybeSingle(),
        context.supabase
          .from("meetings")
          .select("title, occurred_at, match_status")
          .eq("inquiry_id", inquiryId)
          .order("occurred_at", { ascending: true }),
      ]);

    if (clientResult.error) throw new Error(clientResult.error.message);
    if (messagesResult.error) throw new Error(messagesResult.error.message);
    if (proposalsResult.error) throw new Error(proposalsResult.error.message);
    if (filesResult.error) throw new Error(filesResult.error.message);

    const files = await Promise.all(
      (filesResult.data ?? []).map(async (file) => {
        const signed = await context.supabase.storage
          .from("project-files")
          .createSignedUrl(file.file_path, 60 * 30);
        return {
          ...file,
          name: file.file_path.split("/").pop() ?? "file",
          signed_url: signed.data?.signedUrl ?? null,
        };
      }),
    );

    const sourceId = inquiryResult.data.source_message_id;
    let source_message: (InquirySourcePeek & { received_at?: string }) | null = null;
    if (sourceId) {
      const sourceResult = await context.supabase
        .from("inbound_messages")
        .select("subject, body, from_addr, received_at")
        .eq("id", sourceId)
        .maybeSingle();
      if (!sourceResult.error && sourceResult.data) {
        source_message = sourceResult.data;
      }
    }

    const messages = messagesResult.data ?? [];
    const proposals = proposalsResult.data ?? [];
    const meetings = meetingsResult.error ? [] : (meetingsResult.data ?? []);
    let summary = inquiryResult.data.summary_text ?? null;
    try {
      summary =
        (await summarizeInquiryRecord(context.supabase, {
          inquiryId,
          status: inquiryResult.data.status,
          contacted_at: inquiryResult.data.contacted_at,
          summary_text: inquiryResult.data.summary_text ?? null,
          messages,
          proposals,
          meetings,
        })) ?? summary;
    } catch {
      summary = resolveInquirySummaryText(
        buildInquirySummaryFacts({
          status: inquiryResult.data.status,
          contacted_at: inquiryResult.data.contacted_at,
          messages,
          proposals,
          meetings,
        }),
      );
    }

    const listed = await listInquiriesWithClients(context.supabase);
    return {
      inquiry: { ...inquiryResult.data, summary_text: summary ?? inquiryResult.data.summary_text ?? null },
      slug: listed.find((row) => row.id === inquiryId)?.slug ?? inquiryId,
      client: clientResult.data,
      messages,
      proposals,
      files,
      source_message,
      gmailConnected:
        inboxResult.data?.status === "connected" ||
        gmailResult.data?.status === "connected" ||
        googleResult.data?.status === "connected",
    };
  });

export const reviewDetectedInquiry = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approve", "dismiss"]),
        reason: z.string().trim().max(1000).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: current, error: findError } = await context.supabase
      .from("inquiries")
      .select("*")
      .eq("id", data.id)
      .eq("archived", false)
      .single();
    if (findError) throw new Error(findError.message);
    if (current.origin !== "detected" || current.detection_status !== "candidate") {
      throw new Error("Only detected candidates can be approved or dismissed.");
    }

    if (data.decision === "approve") {
      const { error } = await context.supabase
        .from("inquiries")
        .update(approvedCandidatePatch())
        .eq("id", data.id)
        .eq("detection_status", "candidate");
      if (error) throw new Error(error.message);
      await syncInquiryAutoTaskFor(context.supabase, data.id);
      await refreshInquirySummarySafe(context.supabase, data.id);
      return { ok: true as const, decision: "approve" as const };
    }

    const reason = data.reason.trim() || "dismissed in review";
    const { error } = await context.supabase
      .from("inquiries")
      .update({ detection_status: "dismissed" })
      .eq("id", data.id)
      .eq("detection_status", "candidate");
    if (error) throw new Error(error.message);

    let gmailMessageId: string | null = null;
    if (current.source_message_id) {
      const inbound = await context.supabase
        .from("inbound_messages")
        .select("gmail_message_id")
        .eq("id", current.source_message_id)
        .maybeSingle();
      gmailMessageId = inbound.data?.gmail_message_id ?? null;
    }

    const { error: labelError } = await context.supabase.from("inquiry_routing_labels").insert({
      inbound_message_id: current.source_message_id,
      inquiry_id: current.id,
      gmail_message_id: gmailMessageId,
      label: "dismissed",
      source: "human",
      reason,
      payload: { inquiry_id: current.id },
    });
    if (labelError) {
      console.error("[inquiry-review] could not log dismissed negative:", labelError.message);
    }

    return { ok: true as const, decision: "dismiss" as const };
  });

export const addInquiryMessage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: z.string().uuid(),
        channel: z.enum(["email", "note"]),
        body: z.string().trim().min(1).max(8000),
        subject: z.string().trim().max(200).optional().default(""),
        fresh: z.boolean().optional(),
        thread_id: z.string().trim().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const inquiryResult = await context.supabase
      .from("inquiries")
      .select("id, status, client_id, detection_status")
      .eq("id", data.inquiry_id)
      .eq("archived", false)
      .single();
    if (inquiryResult.error) throw new Error(inquiryResult.error.message);

    const clientResult = await context.supabase
      .from("clients")
      .select("email, name")
      .eq("id", inquiryResult.data.client_id)
      .single();
    if (clientResult.error) throw new Error(clientResult.error.message);

    const outbound = data.channel === "email";
    const sentAt = new Date().toISOString();
    const fromAddress = process.env["GMAIL_INBOX"] ?? "info@saysukii.com";

    if (!outbound) {
      const { error } = await context.supabase.from("inquiry_messages").insert({
        inquiry_id: data.inquiry_id,
        direction: "note",
        channel: "note",
        subject: null,
        body: data.body,
        from_address: null,
        to_address: null,
        gmail_message_id: null,
        gmail_thread_id: null,
        author: noteWriter(context.profile),
        sent_at: sentAt,
        status: "sent",
        created_by: context.profile.id,
      });
      if (error) throw new Error(error.message);
      await syncInquiryAutoTaskFor(context.supabase, data.inquiry_id);
      await refreshInquirySummarySafe(context.supabase, data.inquiry_id);
      return { ok: true as const, channel: "note" as const };
    }

    const to = clientResult.data.email?.trim();
    if (!to) throw new Error("This client needs an email address before you can send.");

    const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
    const gmail = await getGmailPublicStatus();
    if (gmail.status !== "connected") {
      throw new Error("Connect Gmail in settings to send.");
    }

    const prior = await context.supabase
      .from("inquiry_messages")
      .select("gmail_thread_id, gmail_message_id, subject, sent_at, channel")
      .eq("inquiry_id", data.inquiry_id)
      .order("sent_at", { ascending: true });
    if (prior.error) throw new Error(prior.error.message);

    const { fetchGmailReplyHeaders, replySubject, resolveReplyContext, sendInquiryEmail } = await import(
      "@/lib/os/gmail-outbound.server"
    );
    const fresh = Boolean(data.fresh);
    if (fresh && !data.subject.trim()) throw new Error("Add a subject for the new conversation.");
    const rows = prior.data ?? [];
    const scoped = fresh
      ? []
      : data.thread_id
        ? rows.filter((row) => row.gmail_thread_id === data.thread_id)
        : rows;
    const reply = resolveReplyContext(scoped);
    const accessToken = await validGmailAccessToken();
    let inReplyTo: string | null = null;
    let references: string | null = null;
    if (!fresh && reply.replyToMessageId) {
      try {
        const headers = await fetchGmailReplyHeaders(reply.replyToMessageId, accessToken);
        inReplyTo = headers.messageId;
        references = headers.references || headers.messageId;
      } catch {
        inReplyTo = null;
      }
    }

    const from = gmail.account_email || fromAddress;
    const subject = fresh ? data.subject.trim() : data.subject.trim() || replySubject(reply.subject);
    const sender = signatureName(context.profile.full_name);
    const sent = await sendInquiryEmail({
      from,
      fromName: "Say Sukii",
      to,
      toName: clientResult.data.name,
      subject,
      body: `${data.body.trim()}\n\n${signatureText(sender)}`,
      threadId: fresh ? null : reply.threadId,
      inReplyTo,
      references,
      accessToken,
    });

    const { error } = await context.supabase.from("inquiry_messages").insert({
      inquiry_id: data.inquiry_id,
      direction: "outbound",
      channel: "email",
      subject,
      body: data.body,
      from_address: from,
      to_address: to,
      gmail_message_id: sent.gmail_message_id,
      gmail_thread_id: sent.gmail_thread_id,
      author: sender,
      sent_at: sentAt,
      status: "sent",
      created_by: context.profile.id,
    });
    if (error) throw new Error(error.message);
    const { markProposalsSentInLetter } = await import("@/lib/os/proposal-send.server");
    await markProposalsSentInLetter(data.inquiry_id, data.body);

    if (
      inquiryResult.data.status === "new" &&
      !isReviewCandidate(inquiryResult.data) &&
      proposalCards(data.body).cards.length === 0
    ) {
      await context.supabase
        .from("inquiries")
        .update({
          status: "contacted",
          contacted_at: new Date().toISOString(),
        })
        .eq("id", data.inquiry_id);
    }

    await syncInquiryAutoTaskFor(context.supabase, data.inquiry_id);
    await refreshInquirySummarySafe(context.supabase, data.inquiry_id);
    return { ok: true as const, channel: "email" as const };
  });

async function studioNote(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("inquiry_messages")
    .select("id, inquiry_id, channel, direction, created_by, author")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.channel !== "note" && data.direction !== "note")) {
    throw new Error("only a note can be changed.");
  }
  return data;
}

export const updateInquiryNote = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        body: z.string().trim().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const note = await studioNote(data.id);
    if (!wroteNote(note, context.profile)) {
      throw new Error("you can edit a note you wrote.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const writer = context.profile.role === "admin" ? context.supabase : supabaseAdmin;
    const { error } = await writer.from("inquiry_messages").update({ body: data.body }).eq("id", note.id);
    if (error) throw new Error(error.message);
    await refreshInquirySummarySafe(writer, note.inquiry_id);
    return { ok: true as const };
  });

export const deleteInquiryNote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const note = await studioNote(data.id);
    const { error } = await context.supabase.from("inquiry_messages").delete().eq("id", note.id);
    if (error) throw new Error(error.message);
    await refreshInquirySummarySafe(context.supabase, note.inquiry_id);
    return { ok: true as const };
  });

export const attachInquiryFile = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: z.string().uuid(),
        file_path: z.string().trim().min(1).max(500),
        file_type: z.string().trim().max(120).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const inquiryResult = await context.supabase
      .from("inquiries")
      .select("id")
      .eq("id", data.inquiry_id)
      .eq("archived", false)
      .single();
    if (inquiryResult.error) throw new Error(inquiryResult.error.message);

    const { error } = await context.supabase.from("files").insert({
      owner_type: "inquiry",
      owner_id: data.inquiry_id,
      file_path: data.file_path,
      file_type: data.file_type || null,
      uploaded_by: context.profile.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
