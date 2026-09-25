import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import type { Database, EventType, InquiryStatus } from "@/integrations/supabase/types";
import { inquirySlugs, isRecordUuid } from "@/lib/os/inquiry-desk";
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

function formThreadBody(input: {
  message?: string | null;
  venue_text?: string | null;
  event_date?: string | null;
  event_date_tbd?: boolean;
  budget_range?: string | null;
}) {
  const time = input.message?.match(/^Time:\s*(.+)$/m)?.[1]?.trim();
  const vision = (input.message ?? "")
    .split("\n")
    .filter((line) => !/^(Size|Time|Recipient):/i.test(line.trim()))
    .join("\n")
    .trim();

  return [
    vision || "a new inquiry arrived through the form.",
    input.venue_text ? `place: ${input.venue_text}` : "",
    input.event_date_tbd ? "date: tbd" : input.event_date ? `date: ${input.event_date}` : "",
    time ? `time: ${time}` : "",
    input.budget_range ? `figure: ${input.budget_range}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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

  const { error: threadError } = await client.from("inquiry_messages").insert({
    inquiry_id: inquiry.id,
    direction: "inbound",
    channel: "form",
    subject: "new inquiry",
    body: formThreadBody(inquiry),
    from_address: input.email.trim().toLowerCase(),
    to_address: process.env["GMAIL_INBOX"] ?? "info@saysukii.com",
    author: input.name.trim(),
    sent_at: inquiry.received_at,
    status: "received",
  });
  if (threadError) throw new Error(threadError.message);

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
  .inputValidator((input: unknown) => publicInquiryInput.parse(input))
  .handler(async ({ data }) => {
    // Honeypot submissions get a normal success response without touching the database.
    if (data.website.trim()) return { ok: true as const };

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
    return { ok: true as const };
  });

export const createAdminInquiry = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => adminInquiryInput.parse(input))
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
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 45);
    const [inquiries, projectsResult, clientsResult, tasks] = await Promise.all([
      listInquiriesWithClients(context.supabase),
      context.supabase
        .from("projects")
        .select("*")
        .eq("archived", false)
        .gte("event_date", dateOnly(new Date()))
        .lte("event_date", dateOnly(horizon))
        .order("event_date", { ascending: true }),
      context.supabase.from("clients").select("*"),
      listStudioTasks(context.supabase),
    ]);
    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (clientsResult.error) throw new Error(clientsResult.error.message);

    const names = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
    await syncInquiryAutoTasks(context.supabase, inquiries, names, tasks);
    const latestTasks = await listStudioTasks(context.supabase);

    const projectClients = new Map((clientsResult.data ?? []).map((client) => [client.id, client]));
    return assembleStudioToday({
      inquiries,
      projects: (projectsResult.data ?? []).map((project) => ({
        ...project,
        client: projectClients.get(project.client_id) ?? null,
      })),
      tasks: latestTasks,
    });
  });

export const setInquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: inquiryStatus,
        closed_reason: z.string().trim().max(1000).optional().default(""),
      })
      .superRefine((value, context) => {
        if (value.status === "closed" && !value.closed_reason) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["closed_reason"],
            message: "Add a reason before closing this inquiry",
          });
        }
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
      timestamps.closed_reason = data.closed_reason;
    } else {
      timestamps.closed_at = null;
      timestamps.closed_reason = null;
    }

    // received_at is deliberately absent: intake time is immutable through this API.
    const { error } = await context.supabase
      .from("inquiries")
      .update({ status: data.status, ...timestamps })
      .eq("id", data.id)
      .eq("archived", false);
    if (error) throw new Error(error.message);
    await syncInquiryAutoTaskFor(context.supabase, data.id);
    await refreshInquirySummarySafe(context.supabase, data.id);
    return { ok: true as const };
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

export const searchFloridaAddresses = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => floridaAddressSearch.parse(input))
  .handler(async ({ data }) => {
    const { searchGooglePlaces } = await import("@/lib/os/maps.server");
    try {
      const googlePlaces = await searchGooglePlaces(data.q);
      if (googlePlaces?.length) return googlePlaces;
    } catch {
      // Places timed out or failed — use the public fallback.
    }

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", data.q);
    url.searchParams.set("limit", "12");
    url.searchParams.set("lang", "en");
    url.searchParams.set("bbox", "-87.6348,24.3963,-79.9743,31.000");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error("Address search unavailable");

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
  .inputValidator((input: unknown) => z.object({ id: z.string().trim().min(1).max(160) }).parse(input))
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

    const [clientResult, messagesResult, proposalsResult, filesResult, gmailResult, inboxResult, meetingsResult] =
      await Promise.all([
        context.supabase.from("clients").select("*").eq("id", inquiryResult.data.client_id).maybeSingle(),
        context.supabase
          .from("inquiry_messages")
          .select("*")
          .eq("inquiry_id", inquiryId)
          .order("sent_at", { ascending: true }),
        context.supabase
          .from("proposals")
          .select("id, number, status, total_cents, event_date, created_at")
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
        inboxResult.data?.status === "connected" || gmailResult.data?.status === "connected",
    };
  });

export const reviewDetectedInquiry = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
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
  .inputValidator((input: unknown) =>
    z
      .object({
        inquiry_id: z.string().uuid(),
        channel: z.enum(["email", "note"]),
        body: z.string().trim().min(1).max(8000),
        subject: z.string().trim().max(200).optional().default(""),
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
        author: context.profile.full_name?.trim() || "studio",
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
    const reply = resolveReplyContext(prior.data ?? []);
    const accessToken = await validGmailAccessToken();
    let inReplyTo: string | null = null;
    let references: string | null = null;
    if (reply.replyToMessageId) {
      try {
        const headers = await fetchGmailReplyHeaders(reply.replyToMessageId, accessToken);
        inReplyTo = headers.messageId;
        references = headers.references || headers.messageId;
      } catch {
        inReplyTo = null;
      }
    }

    const from = gmail.account_email || fromAddress;
    const subject = data.subject.trim() || replySubject(reply.subject);
    const sent = await sendInquiryEmail({
      from,
      fromName: "Say Sukii",
      to,
      toName: clientResult.data.name,
      subject,
      body: data.body,
      threadId: reply.threadId,
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
      author: "say sukii",
      sent_at: sentAt,
      status: "sent",
      created_by: context.profile.id,
    });
    if (error) throw new Error(error.message);

    if (inquiryResult.data.status === "new" && !isReviewCandidate(inquiryResult.data)) {
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

export const attachInquiryFile = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
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
