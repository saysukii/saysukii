import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, InquiryMessageRow, InquiryStatus } from "@/integrations/supabase/types";
import {
  NEW_LEAD_SUMMARY,
  buildInquirySummaryFacts,
  fallbackInquirySummary,
  formatInquirySummaryUserMessage,
  inquirySummaryFingerprint,
  inquirySummarySystemPrompt,
  isNewUncontactedLead,
  sanitizeInquirySummary,
  summaryTextIsStale,
  type InquirySummaryFacts,
  type InquirySummaryMeeting,
  type InquirySummaryProposal,
} from "@/lib/os/inquiry-summary";

type StudioClient = SupabaseClient<Database>;

type SummaryState = {
  inquiryId: string;
  status: InquiryStatus;
  contacted_at: string | null;
  summary_text: string | null;
  messages: InquiryMessageRow[];
  proposals: InquirySummaryProposal[];
  meetings: InquirySummaryMeeting[];
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
    console.error("[inquiry-summary] refresh failed:", error instanceof Error ? error.message : error);
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
    now: deps?.now,
  });
  const fingerprint = inquirySummaryFingerprint(facts);
  const cached = memory.get(state.inquiryId);
  if (!deps?.force) {
    if (cached?.fingerprint === fingerprint) return cached.text;
    if (!cached && state.summary_text && !summaryTextIsStale(state.summary_text, facts)) {
      memory.set(state.inquiryId, { fingerprint, text: state.summary_text });
      return state.summary_text;
    }
  }

  const text = await generateInquirySummaryText(facts, {
    ...deps,
    empty: isNewUncontactedLead({
      status: state.status,
      contacted_at: state.contacted_at,
      messages: state.messages,
      proposalStatus: facts.proposalStatus,
    }),
  });
  memory.set(state.inquiryId, { fingerprint, text });
  await persistSummary(client, state.inquiryId, text, deps?.now ?? new Date());
  return text;
}

export async function generateInquirySummaryText(
  facts: InquirySummaryFacts,
  deps?: SummaryDeps & { empty?: boolean },
) {
  if (deps?.empty || (facts.status === "new" && !facts.contacted && !facts.proposalStatus)) {
    return NEW_LEAD_SUMMARY;
  }
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
        max_tokens: 160,
        temperature: 0,
        system: inquirySummarySystemPrompt(),
        messages: [{ role: "user", content: formatInquirySummaryUserMessage(facts) }],
      }),
    });
    const payload = (await response.json()) as {
      error?: { message?: string };
      content?: Array<{ type?: string; text?: string }>;
    };
    if (!response.ok) throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`);
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

async function loadSummaryState(client: StudioClient, inquiryId: string): Promise<SummaryState | null> {
  const inquiryResult = await client.from("inquiries").select("*").eq("id", inquiryId).maybeSingle();
  if (inquiryResult.error || !inquiryResult.data) return null;

  const [messagesResult, proposalsResult, meetingsResult] = await Promise.all([
    client
      .from("inquiry_messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("sent_at", { ascending: true }),
    client
      .from("proposals")
      .select("status, created_at")
      .eq("inquiry_id", inquiryId)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    client
      .from("meetings")
      .select("title, occurred_at, match_status")
      .eq("inquiry_id", inquiryId)
      .order("occurred_at", { ascending: true }),
  ]);

  return {
    inquiryId,
    status: inquiryResult.data.status,
    contacted_at: inquiryResult.data.contacted_at,
    summary_text: inquiryResult.data.summary_text ?? null,
    messages: (messagesResult.data ?? []) as InquiryMessageRow[],
    proposals: (proposalsResult.data ?? []) as InquirySummaryProposal[],
    meetings: meetingsResult.error ? [] : ((meetingsResult.data ?? []) as InquirySummaryMeeting[]),
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
