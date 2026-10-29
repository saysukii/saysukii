import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, InquiryMessageRow, InquiryStatus } from "@/integrations/supabase/types";
import {
  buildInquirySummaryFacts,
  fallbackInquirySummary,
  formatInquirySummaryUserMessage,
  inquirySummaryFingerprint,
  inquirySummarySystemPrompt,
  sanitizeInquirySummary,
  summaryTextIsStale,
  type InquirySummaryDetails,
  type InquirySummaryFacts,
  type InquirySummaryInvoice,
  type InquirySummaryMeeting,
  type InquirySummaryProposal,
} from "@/lib/os/inquiry-summary";

type StudioClient = SupabaseClient<Database>;

type SummaryState = {
  inquiryId: string;
  status: InquiryStatus;
  contacted_at: string | null;
  summary_text: string | null;
  summary_generated_at?: string | null;
  messages: InquiryMessageRow[];
  proposals: InquirySummaryProposal[];
  meetings: InquirySummaryMeeting[];
  details?: InquirySummaryDetails;
  calls?: Array<{ starts_at: string }>;
  invoices?: InquirySummaryInvoice[];
};

type SummaryDeps = {
  now?: Date;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
  force?: boolean;
};

const memory = new Map<string, { fingerprint: string; text: string }>();

export async function ensureInquirySummary(
  client: StudioClient,
  inquiryId: string,
  deps?: SummaryDeps,
) {
  const state = await loadSummaryState(client, inquiryId);
  if (!state) return null;
  return summarizeInquiryRecord(client, state, { ...deps, force: false });
}

export async function refreshInquirySummary(
  client: StudioClient,
  inquiryId: string,
  deps?: SummaryDeps,
) {
  const state = await loadSummaryState(client, inquiryId);
  if (!state) return null;
  return summarizeInquiryRecord(client, state, { ...deps, force: true });
}

export async function refreshInquirySummarySafe(client: StudioClient, inquiryId: string) {
  try {
    await refreshInquirySummary(client, inquiryId);
  } catch (error) {
    console.error(
      "[inquiry-summary] refresh failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function summarizeInquiryRecord(
  client: StudioClient,
  state: SummaryState,
  deps?: SummaryDeps,
) {
  const facts = buildInquirySummaryFacts({
    status: state.status,
    contacted_at: state.contacted_at,
    messages: state.messages,
    proposals: state.proposals,
    meetings: state.meetings,
    ...(state.details ? { details: state.details } : {}),
    ...(state.calls ? { calls: state.calls } : {}),
    ...(state.invoices ? { invoices: state.invoices } : {}),
    ...(deps?.now ? { now: deps.now } : {}),
  });
  const fingerprint = inquirySummaryFingerprint(facts);
  const cached = memory.get(state.inquiryId);
  if (!deps?.force) {
    if (cached?.fingerprint === fingerprint) return cached.text;
    if (
      !cached &&
      state.summary_text &&
      !summaryTextIsStale(state.summary_text, facts, state.summary_generated_at, deps?.now)
    ) {
      memory.set(state.inquiryId, { fingerprint, text: state.summary_text });
      return state.summary_text;
    }
  }

  const text = await generateInquirySummaryText(facts, deps);
  memory.set(state.inquiryId, { fingerprint, text });
  await persistSummary(client, state.inquiryId, text, deps?.now ?? new Date());
  return text;
}

export async function generateInquirySummaryText(facts: InquirySummaryFacts, deps?: SummaryDeps) {
  // an archived lead has nothing left to read into
  if (facts.situation === "archived") return fallbackInquirySummary(facts);
  const apiKey = deps?.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return fallbackInquirySummary(facts);

  const model = deps?.model ?? process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-5";
  const fetchImpl = deps?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0,
        system: inquirySummarySystemPrompt(),
        messages: [{ role: "user", content: formatInquirySummaryUserMessage(facts) }],
      }),
    });
    const payload = (await response.json()) as {
      error?: { message?: string };
      content?: Array<{ type?: string; text?: string }>;
    };
    if (!response.ok)
      throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`);
    const text = sanitizeInquirySummary(
      (payload.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n"),
    );
    return text || fallbackInquirySummary(facts);
  } catch {
    return fallbackInquirySummary(facts);
  }
}

async function loadSummaryState(
  client: StudioClient,
  inquiryId: string,
): Promise<SummaryState | null> {
  const inquiryResult = await client
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiryResult.error || !inquiryResult.data) return null;
  const inquiry = inquiryResult.data;

  const [clientResult, messagesResult, proposalsResult, meetingsResult] = await Promise.all([
    client.from("clients").select("name, email").eq("id", inquiry.client_id).maybeSingle(),
    client
      .from("inquiry_messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("sent_at", { ascending: true }),
    client
      .from("proposals")
      .select(
        "id, status, created_at, sent_at, viewed_at, accepted_at, declined_at, declined_reason, valid_until, total_cents",
      )
      .eq("inquiry_id", inquiryId)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    client
      .from("meetings")
      .select("title, occurred_at, match_status, summary")
      .eq("inquiry_id", inquiryId)
      .order("occurred_at", { ascending: true }),
  ]);

  const email = clientResult.data?.email?.trim() ?? "";
  const proposalIds = (proposalsResult.data ?? []).map((proposal) => proposal.id);
  const [callsResult, invoicesResult] = await Promise.all([
    email
      ? client.from("appointments").select("starts_at").ilike("guest_email", email)
      : Promise.resolve({ data: [] as Array<{ starts_at: string }>, error: null }),
    proposalIds.length
      ? client.from("invoices").select("status, amount_cents").in("proposal_id", proposalIds)
      : Promise.resolve({ data: [] as InquirySummaryInvoice[], error: null }),
  ]);

  return {
    inquiryId,
    status: inquiry.status,
    contacted_at: inquiry.contacted_at,
    summary_text: inquiry.summary_text ?? null,
    summary_generated_at: inquiry.summary_generated_at ?? null,
    messages: (messagesResult.data ?? []) as InquiryMessageRow[],
    proposals: (proposalsResult.data ?? []) as InquirySummaryProposal[],
    meetings: meetingsResult.error ? [] : ((meetingsResult.data ?? []) as InquirySummaryMeeting[]),
    details: {
      clientName: clientResult.data?.name ?? null,
      clientEmail: email || null,
      eventType: inquiry.event_type,
      eventDate: inquiry.event_date,
      eventDateTbd: inquiry.event_date_tbd,
      venue: inquiry.venue_text,
      guestCount: inquiry.guest_count,
      budget: inquiry.budget_range,
      receivedAt: inquiry.received_at,
      closedAt: inquiry.closed_at,
      closedReason: inquiry.closed_reason,
      detectionStatus: inquiry.detection_status,
    },
    calls: callsResult.error ? [] : (callsResult.data ?? []),
    invoices: invoicesResult.error ? [] : ((invoicesResult.data ?? []) as InquirySummaryInvoice[]),
  };
}

async function persistSummary(client: StudioClient, inquiryId: string, text: string, now: Date) {
  const { error } = await client
    .from("inquiries")
    .update({
      summary_text: text,
      summary_generated_at: now.toISOString(),
    })
    .eq("id", inquiryId);
  if (error) {
    console.error("[inquiry-summary] cache write skipped:", error.message);
  }
}

export type { InquirySummaryFacts, SummaryState };
