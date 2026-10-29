import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClientRow,
  ClientType,
  Database,
  DetectionStatus,
  EventType,
  InboundMessageRow,
  InboundRoutingResult,
  InquiryMessageRow,
  InquiryOrigin,
  InquiryRoutingLabelRow,
  InquiryRow,
  InquiryStatus,
  Json,
  RoutingLabelKind,
  RoutingLabelSource,
} from "../../integrations/supabase/types";
import { BOOK_DETECTION_STATUSES } from "./inquiry-detection";
import { belongsInReview, inboundAsk, isAutomatedSender } from "./inquiry-mail";
import { lessonVerdict, makeLesson, type InquiryLesson } from "./inquiry-lessons";
import {
  ROUTING_EVENT_TYPES,
  formatRoutingUserMessage,
  inquiryRoutingSystemPrompt,
  type RoutingPromptMatch,
} from "./inquiry-routing.prompt";

const MAX_PER_RUN = 25;
const MAX_MATCHES = 8;
const EXCERPT_LIMIT = 400;
const INBOUND_PATH = join(process.cwd(), ".data", "inbound-messages.json");
const BOOK_PATH = join(process.cwd(), ".data", "routing-book.json");
const LABELS_PATH = join(process.cwd(), ".data", "routing-labels.json");

export type { InquiryRoutingLabelRow, RoutingLabelKind, RoutingLabelSource };

export type ExtractedInquiryFields = {
  name: string | null;
  email: string | null;
  event_type: EventType | null;
  event_date: string | null;
  event_date_tbd: boolean;
  place: string | null;
  budget: string | null;
  vision: string | null;
};

export type RoutingDecision = {
  action: InboundRoutingResult;
  matched_inquiry_id: string | null;
  is_true_inquiry: boolean;
  confidence: number;
  reason: string;
  extraction: ExtractedInquiryFields;
};

export type InquiryMatch = RoutingPromptMatch & {
  client_id: string;
  received_at: string;
};

export type RoutingRunResult = {
  skipped: boolean;
  reason: string | null;
  processed: number;
  attached: number;
  candidates: number;
  ignored: number;
  errors: number;
};

export type ClassifyInbound = (input: {
  message: InboundMessageRow;
  matches: InquiryMatch[];
  lessons?: InquiryLesson[];
}) => Promise<unknown>;

export type RoutingStore = {
  listUnprocessed(limit: number): Promise<InboundMessageRow[]>;
  findMatches(message: InboundMessageRow): Promise<InquiryMatch[]>;
  findInquiryBySource(inboundId: string): Promise<InquiryRow | null>;
  hasConversationMessage(gmailMessageId: string): Promise<boolean>;
  attachMessage(input: {
    message: InboundMessageRow;
    inquiryId: string;
    author: string | null;
  }): Promise<void>;
  createCandidate(input: {
    message: InboundMessageRow;
    decision: RoutingDecision;
  }): Promise<{ inquiryId: string }>;
  markRouted(input: {
    inboundId: string;
    result: InboundRoutingResult;
    matchedInquiryId: string | null;
    processedAt: string;
  }): Promise<void>;
  logNegative(row: InquiryRoutingLabelRow): Promise<void>;
  listLessons(): Promise<InquiryLesson[]>;
};

export type MemoryRoutingState = {
  inbound: InboundMessageRow[];
  clients: ClientRow[];
  inquiries: InquiryRow[];
  messages: InquiryMessageRow[];
  labels: InquiryRoutingLabelRow[];
};

type LocalBook = {
  clients: ClientRow[];
  inquiries: InquiryRow[];
  messages: InquiryMessageRow[];
};

const EMPTY_EXTRACTION: ExtractedInquiryFields = {
  name: null,
  email: null,
  event_type: null,
  event_date: null,
  event_date_tbd: true,
  place: null,
  budget: null,
  vision: null,
};

export function isBookDetectionStatus(status: DetectionStatus) {
  return BOOK_DETECTION_STATUSES.includes(status);
}

export function normalizeSenderEmail(value: string | null | undefined) {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  const email = (angled?.[1] ?? value).trim().toLowerCase();
  if (!email.includes("@")) return null;
  return email.slice(0, 320);
}

export function isInquiryActive(inquiry: {
  archived: boolean;
  status: InquiryStatus;
  detection_status: DetectionStatus;
}) {
  return (
    !inquiry.archived && inquiry.status !== "closed" && inquiry.detection_status !== "dismissed"
  );
}

export function assembleMatches(
  message: Pick<InboundMessageRow, "from_addr" | "gmail_thread_id">,
  book: {
    inquiries: InquiryRow[];
    clients: ClientRow[];
    messages: InquiryMessageRow[];
  },
): InquiryMatch[] {
  const email = normalizeSenderEmail(message.from_addr);
  const thread = message.gmail_thread_id?.trim() || null;
  const clientsById = new Map(book.clients.map((row) => [row.id, row]));
  const scored: InquiryMatch[] = [];

  for (const inquiry of book.inquiries) {
    const client = clientsById.get(inquiry.client_id);
    if (!client) continue;
    const threadIds = [
      ...new Set(
        book.messages
          .filter((row) => row.inquiry_id === inquiry.id && row.gmail_thread_id)
          .map((row) => row.gmail_thread_id as string),
      ),
    ];
    const match_via: Array<"thread" | "sender"> = [];
    if (thread && threadIds.includes(thread)) match_via.push("thread");
    if (email && client.email.toLowerCase() === email) match_via.push("sender");
    if (!match_via.length) continue;

    const latest = [...book.messages]
      .filter((row) => row.inquiry_id === inquiry.id)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
      .at(-1);

    scored.push({
      id: inquiry.id,
      client_id: client.id,
      client_name: client.name,
      client_email: client.email,
      event_type: inquiry.event_type,
      event_date: inquiry.event_date,
      event_date_tbd: inquiry.event_date_tbd,
      venue_text: inquiry.venue_text,
      status: inquiry.status,
      archived: inquiry.archived,
      origin: inquiry.origin,
      detection_status: inquiry.detection_status,
      active: isInquiryActive(inquiry),
      match_via,
      latest_message_excerpt: latest?.body ? latest.body.slice(0, EXCERPT_LIMIT) : null,
      received_at: inquiry.received_at,
    });
  }

  scored.sort((a, b) => {
    const threadDelta =
      Number(b.match_via.includes("thread")) - Number(a.match_via.includes("thread"));
    if (threadDelta) return threadDelta;
    const activeDelta = Number(b.active) - Number(a.active);
    if (activeDelta) return activeDelta;
    return b.received_at.localeCompare(a.received_at);
  });
  return scored.slice(0, MAX_MATCHES);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function clampConfidence(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

function asEventType(value: unknown): EventType | null {
  const raw = asString(value);
  if (!raw) return null;
  return (ROUTING_EVENT_TYPES as readonly string[]).includes(raw) ? (raw as EventType) : null;
}

function asDate(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function asAction(value: unknown): InboundRoutingResult | null {
  const raw = asString(value);
  if (raw === "attach" || raw === "attached") return "attached";
  if (raw === "candidate") return "candidate";
  if (raw === "ignore" || raw === "ignored") return "ignored";
  return null;
}

export function parseModelJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("classifier returned no JSON");
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

export function normalizeRoutingDecision(
  raw: unknown,
  matches: InquiryMatch[],
  message: Pick<InboundMessageRow, "from_addr">,
): RoutingDecision {
  const record = asRecord(raw) ?? {};
  const extractionRaw = asRecord(record["extraction"]) ?? {};
  const extraction: ExtractedInquiryFields = {
    name: asString(extractionRaw["name"]),
    email: normalizeSenderEmail(asString(extractionRaw["email"]) ?? message.from_addr),
    event_type: asEventType(extractionRaw["event_type"]),
    event_date: asDate(extractionRaw["event_date"]),
    event_date_tbd:
      extractionRaw["event_date_tbd"] == null
        ? !asDate(extractionRaw["event_date"])
        : asBoolean(extractionRaw["event_date_tbd"]),
    place: asString(extractionRaw["place"]),
    budget: asString(extractionRaw["budget"]),
    vision: asString(extractionRaw["vision"]),
  };
  if (extraction.event_date) extraction.event_date_tbd = false;
  else extraction.event_date_tbd = true;

  const isTrue = record["is_true_inquiry"] === true;
  const reason = asString(record["reason"]) ?? "unspecified";
  const confidence = clampConfidence(record["confidence"]);
  const matchIds = new Set(matches.map((row) => row.id));
  let action = asAction(record["action"]);
  let matchedId = asString(record["matched_inquiry_id"]);
  if (matchedId && !matchIds.has(matchedId)) matchedId = null;

  if (action === "attached") {
    const match = matchedId ? matches.find((row) => row.id === matchedId) : null;
    if (!match?.active) {
      action = isTrue ? "candidate" : "ignored";
      matchedId = null;
    }
  } else if (action === "candidate") {
    matchedId = null;
  } else if (action === "ignored") {
    matchedId = null;
    if (isTrue) action = "candidate";
  } else {
    action = isTrue ? "candidate" : "ignored";
    matchedId = null;
  }

  return {
    action,
    matched_inquiry_id: matchedId,
    is_true_inquiry: isTrue,
    confidence,
    reason,
    extraction,
  };
}

function clientTypeFromEvent(eventType: EventType): ClientType {
  if (eventType === "corporate") return "corporate";
  if (eventType === "brand_activation" || eventType === "photoshoot") return "brand";
  return "individual";
}

function fallbackName(email: string, extracted: string | null) {
  if (extracted && extracted.length >= 2) return extracted.slice(0, 160);
  const local =
    email
      .split("@")[0]
      ?.replace(/[._+]+/g, " ")
      .trim() ?? "";
  return (local.length >= 2 ? local : "new inquiry").slice(0, 160);
}

function authorFor(message: InboundMessageRow, extraction: ExtractedInquiryFields) {
  return extraction.name || message.from_name || message.from_addr || "inbound";
}

/** A teammate writing on the thread from their own studio address. */
export function isStudioSender(from: string | null | undefined) {
  return Boolean(normalizeSenderEmail(from)?.endsWith("@saysukii.com"));
}

export function publicRoutingResult(result: RoutingRunResult): RoutingRunResult {
  return {
    skipped: result.skipped,
    reason: result.reason,
    processed: result.processed,
    attached: result.attached,
    candidates: result.candidates,
    ignored: result.ignored,
    errors: result.errors,
  };
}

export function createMemoryRoutingStore(seed: Partial<MemoryRoutingState> = {}): {
  state: MemoryRoutingState;
  store: RoutingStore;
} {
  const state: MemoryRoutingState = {
    inbound: [...(seed.inbound ?? [])],
    clients: [...(seed.clients ?? [])],
    inquiries: [...(seed.inquiries ?? [])],
    messages: [...(seed.messages ?? [])],
    labels: [...(seed.labels ?? [])],
  };

  const store: RoutingStore = {
    async listUnprocessed(limit) {
      const threads = new Set(
        state.messages.map((row) => row.gmail_thread_id).filter((id): id is string => Boolean(id)),
      );
      return orderUnprocessedInbound(
        state.inbound.filter((row) => !row.processed_at && !row.routing_result),
        threads,
      ).slice(0, limit);
    },
    async findMatches(message) {
      return assembleMatches(message, state);
    },
    async findInquiryBySource(inboundId) {
      return state.inquiries.find((row) => row.source_message_id === inboundId) ?? null;
    },
    async hasConversationMessage(gmailMessageId) {
      return state.messages.some((row) => row.gmail_message_id === gmailMessageId);
    },
    async attachMessage({ message, inquiryId, author }) {
      if (
        message.gmail_message_id &&
        state.messages.some((row) => row.gmail_message_id === message.gmail_message_id)
      ) {
        return;
      }
      state.messages.push(conversationFromInbound(message, inquiryId, author));
    },
    async createCandidate({ message, decision }) {
      const existing = state.inquiries.find((row) => row.source_message_id === message.id);
      if (existing) {
        await store.attachMessage({
          message,
          inquiryId: existing.id,
          author: authorFor(message, decision.extraction),
        });
        return { inquiryId: existing.id };
      }
      const email = normalizeSenderEmail(decision.extraction.email ?? message.from_addr);
      if (!email) throw new Error("candidate requires a sender email");
      let client = state.clients.find((row) => row.email.toLowerCase() === email);
      if (!client) {
        const now = message.received_at;
        client = {
          id: randomUUID(),
          name: fallbackName(email, decision.extraction.name),
          email,
          phone: null,
          organization: null,
          type: clientTypeFromEvent(decision.extraction.event_type ?? "other"),
          source: "gmail",
          notes: null,
          archived: false,
          created_at: now,
          updated_at: now,
        };
        state.clients.push(client);
      }
      const inquiry = candidateInquiry(message, client.id, decision);
      state.inquiries.push(inquiry);
      state.messages.push(
        conversationFromInbound(message, inquiry.id, authorFor(message, decision.extraction)),
      );
      return { inquiryId: inquiry.id };
    },
    async markRouted({ inboundId, result, matchedInquiryId, processedAt }) {
      const row = state.inbound.find((item) => item.id === inboundId);
      if (!row) return;
      row.routing_result = result;
      row.matched_inquiry_id = matchedInquiryId;
      row.processed_at = processedAt;
    },
    async logNegative(row) {
      state.labels.push(row);
    },
    async listLessons() {
      return lessonsFromMemory(state);
    },
  };

  return { state, store };
}

function conversationFromInbound(
  message: InboundMessageRow,
  inquiryId: string,
  author: string | null,
): InquiryMessageRow {
  const sent = message.received_at;
  return {
    id: randomUUID(),
    inquiry_id: inquiryId,
    direction: isStudioSender(message.from_addr) ? "outbound" : "inbound",
    channel: "email",
    subject: message.subject,
    body: message.body || "(empty)",
    from_address: message.from_addr,
    to_address: message.to_addr,
    gmail_message_id: message.gmail_message_id,
    gmail_thread_id: message.gmail_thread_id,
    author,
    sent_at: sent,
    status: "received",
    created_by: null,
    created_at: sent,
  };
}

function candidateInquiry(
  message: InboundMessageRow,
  clientId: string,
  decision: RoutingDecision,
): InquiryRow {
  const eventType = decision.extraction.event_type ?? "other";
  const tbd = !decision.extraction.event_date || decision.extraction.event_date_tbd;
  return {
    id: randomUUID(),
    client_id: clientId,
    event_date: tbd ? null : decision.extraction.event_date,
    event_date_tbd: tbd,
    event_type: eventType,
    venue_id: null,
    venue_text: decision.extraction.place,
    guest_count: null,
    budget_range: decision.extraction.budget,
    source: "gmail",
    message: decision.extraction.vision ?? message.body,
    status: "new",
    closed_reason: null,
    received_at: message.received_at,
    contacted_at: null,
    proposal_sent_at: null,
    booked_at: null,
    closed_at: null,
    archived: false,
    created_by: null,
    updated_at: message.received_at,
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: decision.confidence,
    detection_reason: decision.reason,
    source_message_id: message.id,
    summary_text: null,
    summary_generated_at: null,
  };
}

function negativePayload(message: InboundMessageRow, decision: RoutingDecision | null): Json {
  return {
    from_addr: message.from_addr,
    subject: message.subject,
    body: (message.body ?? "").slice(0, 500),
    action: decision?.action ?? "ignored",
    confidence: decision?.confidence ?? null,
    reason: decision?.reason ?? null,
  };
}

export function routingNegativeRow(input: {
  message?: Pick<InboundMessageRow, "id" | "gmail_message_id"> | null;
  inquiryId?: string | null;
  label: RoutingLabelKind;
  source: RoutingLabelSource;
  reason: string | null;
  payload?: Json;
  now?: string;
}): InquiryRoutingLabelRow {
  return {
    id: randomUUID(),
    inbound_message_id: input.message?.id ?? null,
    inquiry_id: input.inquiryId ?? null,
    gmail_message_id: input.message?.gmail_message_id ?? null,
    label: input.label,
    source: input.source,
    reason: input.reason,
    payload: input.payload ?? {},
    created_at: input.now ?? new Date().toISOString(),
  };
}

export async function recordDismissedCandidate(
  input: {
    inquiryId: string;
    inbound?: Pick<InboundMessageRow, "id" | "gmail_message_id"> | null;
    reason: string;
    now?: Date;
  },
  store: RoutingStore,
) {
  await store.logNegative(
    routingNegativeRow({
      message: input.inbound ?? null,
      inquiryId: input.inquiryId,
      label: "dismissed",
      source: "human",
      reason: input.reason,
      payload: { inquiry_id: input.inquiryId },
      now: (input.now ?? new Date()).toISOString(),
    }),
  );
}

export async function classifyWithAnthropic(input: {
  message: InboundMessageRow;
  matches: InquiryMatch[];
  lessons?: InquiryLesson[];
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
}): Promise<unknown> {
  const apiKey = input.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("anthropic_not_configured");
  const model = input.model ?? process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-5";
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: inquiryRoutingSystemPrompt(),
      messages: [
        {
          role: "user",
          content: formatRoutingUserMessage(input.message, input.matches, input.lessons ?? []),
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`);
  }
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  return parseModelJson(text);
}

async function applyDecision(
  message: InboundMessageRow,
  decision: RoutingDecision,
  store: RoutingStore,
  now: Date,
) {
  const processedAt = now.toISOString();
  if (decision.action === "attached" && decision.matched_inquiry_id) {
    if (!(await store.hasConversationMessage(message.gmail_message_id))) {
      await store.attachMessage({
        message,
        inquiryId: decision.matched_inquiry_id,
        author: authorFor(message, decision.extraction),
      });
    }
    await store.markRouted({
      inboundId: message.id,
      result: "attached",
      matchedInquiryId: decision.matched_inquiry_id,
      processedAt,
    });
    return "attached" as const;
  }

  if (decision.action === "candidate") {
    const existing = await store.findInquiryBySource(message.id);
    const created = existing
      ? { inquiryId: existing.id }
      : await store.createCandidate({ message, decision });
    if (existing) {
      await store.attachMessage({
        message,
        inquiryId: existing.id,
        author: authorFor(message, decision.extraction),
      });
    }
    await store.markRouted({
      inboundId: message.id,
      result: "candidate",
      matchedInquiryId: created.inquiryId,
      processedAt,
    });
    return "candidate" as const;
  }

  await store.logNegative(
    routingNegativeRow({
      message,
      label: "ignored",
      source: "model",
      reason: decision.reason,
      payload: negativePayload(message, decision),
      now: processedAt,
    }),
  );
  await store.markRouted({
    inboundId: message.id,
    result: "ignored",
    matchedInquiryId: null,
    processedAt,
  });
  return "ignored" as const;
}

function tally(result: RoutingRunResult, action: InboundRoutingResult) {
  result.processed += 1;
  if (action === "attached") result.attached += 1;
  else if (action === "candidate") result.candidates += 1;
  else result.ignored += 1;
}

export function orderUnprocessedInbound(
  rows: InboundMessageRow[],
  knownThreadIds: ReadonlySet<string>,
) {
  return [...rows].sort((left, right) => {
    const leftHit = left.gmail_thread_id && knownThreadIds.has(left.gmail_thread_id) ? 0 : 1;
    const rightHit = right.gmail_thread_id && knownThreadIds.has(right.gmail_thread_id) ? 0 : 1;
    if (leftHit !== rightHit) return leftHit - rightHit;
    return left.received_at.localeCompare(right.received_at);
  });
}

function firstRecipient(to: string | null | undefined) {
  const direct = (to ?? "").split(" · ")[0] ?? "";
  return normalizeSenderEmail(direct.split(",")[0]);
}

/** A letter the studio sent from gmail on a new thread belongs to that client's one open inquiry. */
async function studioLetterDecision(
  message: InboundMessageRow,
  store: RoutingStore,
): Promise<RoutingDecision> {
  const recipient = firstRecipient(message.to_addr);
  const theirs =
    recipient && !isStudioSender(recipient)
      ? (
          await store.findMatches({ ...message, from_addr: recipient, gmail_thread_id: null })
        ).filter((row) => row.active && row.match_via.includes("sender"))
      : [];
  if (theirs.length === 1 && theirs[0]) {
    return {
      action: "attached",
      matched_inquiry_id: theirs[0].id,
      is_true_inquiry: true,
      confidence: 0.9,
      reason: "the studio wrote to this client from gmail",
      extraction: { ...EMPTY_EXTRACTION, email: normalizeSenderEmail(message.from_addr) },
    };
  }
  return {
    action: "ignored",
    matched_inquiry_id: null,
    is_true_inquiry: false,
    confidence: 1,
    reason: "sent from the studio",
    extraction: { ...EMPTY_EXTRACTION },
  };
}

export function activeThreadReply(
  message: Pick<InboundMessageRow, "from_addr" | "from_name">,
  matches: InquiryMatch[],
): RoutingDecision | null {
  const email = normalizeSenderEmail(message.from_addr);
  if (!email) return null;
  const thread = matches.find((row) => row.active && row.match_via.includes("thread"));
  if (!thread) return null;
  return {
    action: "attached",
    matched_inquiry_id: thread.id,
    is_true_inquiry: true,
    confidence: 1,
    reason: isStudioSender(email)
      ? "the studio wrote on the same gmail thread as an open inquiry"
      : "reply on the same gmail thread as an open inquiry",
    extraction: {
      ...EMPTY_EXTRACTION,
      email,
      name: message.from_name || senderName(message.from_addr),
    },
  };
}

export async function routeUnprocessedInbound(deps: {
  store: RoutingStore;
  classify: ClassifyInbound;
  now?: () => Date;
  limit?: number;
}): Promise<RoutingRunResult> {
  const now = deps.now ?? (() => new Date());
  const queued = await deps.store.listUnprocessed(deps.limit ?? MAX_PER_RUN);
  const result: RoutingRunResult = {
    skipped: false,
    reason: null,
    processed: 0,
    attached: 0,
    candidates: 0,
    ignored: 0,
    errors: 0,
  };

  const lessons = await deps.store.listLessons();

  for (const message of queued) {
    try {
      const email = normalizeSenderEmail(message.from_addr);
      if (!email) {
        const skipped: RoutingDecision = {
          action: "ignored",
          matched_inquiry_id: null,
          is_true_inquiry: false,
          confidence: 1,
          reason: "no sender email",
          extraction: { ...EMPTY_EXTRACTION },
        };
        const action = await applyDecision(message, skipped, deps.store, now());
        tally(result, action);
        continue;
      }

      const matches = await deps.store.findMatches(message);
      const threadReply = activeThreadReply(message, matches);
      if (threadReply) {
        const action = await applyDecision(message, threadReply, deps.store, now());
        tally(result, action);
        continue;
      }
      // the studio wrote from gmail: file it with the client it went to, and never make it a lead
      if (isStudioSender(email)) {
        const decision = await studioLetterDecision(message, deps.store);
        const action = await applyDecision(message, decision, deps.store, now());
        tally(result, action);
        continue;
      }
      const verdict = lessonVerdict(
        { from: message.from_addr, subject: message.subject, body: message.body },
        lessons,
      );
      if (verdict === "skip") {
        const skipped: RoutingDecision = {
          action: "ignored",
          matched_inquiry_id: null,
          is_true_inquiry: false,
          confidence: 0.92,
          reason: "similar to mail that was skipped",
          extraction: { ...EMPTY_EXTRACTION, email },
        };
        const action = await applyDecision(message, skipped, deps.store, now());
        tally(result, action);
        continue;
      }
      const raw = await deps.classify({ message, matches, lessons });
      const decision = normalizeRoutingDecision(raw, matches, message);
      if (verdict === "accept" && decision.action === "ignored") {
        decision.action = "candidate";
        decision.is_true_inquiry = true;
        decision.confidence = Math.max(decision.confidence, 0.8);
        decision.reason = "similar to an inquiry that was accepted";
      }
      if (
        decision.action === "candidate" &&
        !normalizeSenderEmail(decision.extraction.email ?? message.from_addr)
      ) {
        decision.action = "ignored";
        decision.reason = "candidate requires a sender email";
        decision.is_true_inquiry = false;
      } else if (
        decision.action === "candidate" &&
        verdict !== "accept" &&
        !belongsInReview({
          from: decision.extraction.email ?? message.from_addr,
          subject: message.subject,
          body: message.body,
          confidence: decision.confidence,
        })
      ) {
        decision.action = "ignored";
        decision.is_true_inquiry = false;
        decision.reason = "not a floral inquiry";
      }
      const action = await applyDecision(message, decision, deps.store, now());
      tally(result, action);
    } catch (error) {
      result.errors += 1;
      console.error(
        "[gmail-route] left a message unprocessed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return publicRoutingResult(result);
}

const ROUTING_NOISE =
  /\b(unsubscribe|newsletter|wholesale|partnership opportunity|password reset|verify your email|your receipt|order confirmation|tracking number|out of office|automatic reply|mailer-daemon)\b/i;

function senderName(from: string | null | undefined) {
  if (!from) return null;
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = named?.[1]?.trim() ?? "";
  if (name.length >= 2 && !name.includes("@")) return name.slice(0, 160);
  return null;
}

function guessEventType(text: string): EventType | null {
  if (/\b(subscription|concierge|weekly flowers|standing order)\b/i.test(text))
    return "subscription";
  if (/\b(wedding|bridal|elopement|ceremony|reception)\b/i.test(text)) return "wedding";
  if (/\b(photoshoot|styled shoot|editorial)\b/i.test(text)) return "photoshoot";
  if (/\bcorporate\b/i.test(text)) return "corporate";
  if (/\bbrand activation\b/i.test(text)) return "brand_activation";
  return null;
}

function routingNoise(email: string | null, text: string) {
  if (isAutomatedSender(email)) return true;
  return ROUTING_NOISE.test(text);
}

export function heuristicRoutingRaw(input: {
  message: InboundMessageRow;
  matches: InquiryMatch[];
}): unknown {
  const email = normalizeSenderEmail(input.message.from_addr);
  const text = `${input.message.subject ?? ""}\n${input.message.body ?? ""}`;
  const ask = inboundAsk(input.message.subject, input.message.body);
  const name = senderName(input.message.from_addr);
  if (routingNoise(email, text)) {
    return {
      action: "ignored",
      is_true_inquiry: false,
      confidence: 0.9,
      reason: email?.endsWith("@saysukii.com")
        ? "sent from the studio"
        : "not a booking conversation",
      extraction: { email, name },
    };
  }

  const thread = input.matches.find((row) => row.active && row.match_via.includes("thread"));
  if (thread) {
    return {
      action: "attached",
      matched_inquiry_id: thread.id,
      is_true_inquiry: true,
      confidence: 0.82,
      reason: "same gmail thread as an open inquiry",
      extraction: { email, name },
    };
  }

  const reply = /^\s*re:/i.test(input.message.subject ?? "");
  const sender = input.matches.find((row) => row.active && row.match_via.includes("sender"));
  if (reply && sender) {
    return {
      action: "attached",
      matched_inquiry_id: sender.id,
      is_true_inquiry: true,
      confidence: 0.66,
      reason: "reply from someone already in the book",
      extraction: { email, name },
    };
  }

  if (
    belongsInReview({
      from: input.message.from_addr,
      subject: input.message.subject,
      body: input.message.body,
      confidence: 0.6,
    })
  ) {
    const vision = ask.replace(/\s+/g, " ").trim();
    return {
      action: "candidate",
      is_true_inquiry: true,
      confidence: 0.6,
      reason: "the note asks for flowers or a floral occasion",
      extraction: {
        email,
        name,
        event_type: guessEventType(ask),
        vision: vision ? vision.slice(0, 280) : null,
      },
    };
  }

  return {
    action: "ignored",
    is_true_inquiry: false,
    confidence: 0.74,
    reason: "no floral booking ask",
    extraction: { email, name },
  };
}

export async function runGmailInboundRouting(deps?: {
  store?: RoutingStore;
  classify?: ClassifyInbound;
  now?: () => Date;
  limit?: number;
}): Promise<RoutingRunResult> {
  const classify =
    deps?.classify ??
    (process.env["ANTHROPIC_API_KEY"]
      ? // if claude can't answer, the house rules still sort the mail, so nothing waits forever
        async (input: { message: InboundMessageRow; matches: InquiryMatch[] }) =>
          classifyWithAnthropic(input).catch((error: unknown) => {
            console.error(
              "[gmail-route] claude could not sort a message, using the house rules:",
              error instanceof Error ? error.message : error,
            );
            return heuristicRoutingRaw(input);
          })
      : async (input: { message: InboundMessageRow; matches: InquiryMatch[] }) =>
          heuristicRoutingRaw(input));
  const routed: {
    store: RoutingStore;
    classify: ClassifyInbound;
    now?: () => Date;
    limit?: number;
  } = {
    store: deps?.store ?? liveRoutingStore(),
    classify,
  };
  if (deps?.now) routed.now = deps.now;
  if (deps?.limit != null) routed.limit = deps.limit;
  return routeUnprocessedInbound(routed);
}

function supabaseConfigured() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

function lessonsFromMemory(state: MemoryRoutingState): InquiryLesson[] {
  const lessons: InquiryLesson[] = [];
  for (const inquiry of state.inquiries) {
    if (inquiry.origin !== "detected") continue;
    if (inquiry.detection_status !== "confirmed" && inquiry.detection_status !== "dismissed")
      continue;
    const person = state.clients.find((row) => row.id === inquiry.client_id);
    const mail = state.messages.find(
      (row) => row.inquiry_id === inquiry.id && row.direction === "inbound",
    );
    const lesson = makeLesson({
      accepted: inquiry.detection_status === "confirmed",
      from: mail?.from_address ?? person?.email,
      subject: mail?.subject,
      body: mail?.body ?? inquiry.message,
    });
    if (lesson) lessons.push(lesson);
  }
  return lessons.slice(0, 40);
}

export async function loadInquiryLessons(
  client: SupabaseClient<Database>,
): Promise<InquiryLesson[]> {
  const { data, error } = await client
    .from("inquiries")
    .select("id, detection_status, message, source_message_id, client_id")
    .eq("origin", "detected")
    .in("detection_status", ["confirmed", "dismissed"])
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error || !data?.length) return [];
  const clientIds = [...new Set(data.map((row) => row.client_id))];
  const sourceIds = [
    ...new Set(data.map((row) => row.source_message_id).filter((id): id is string => Boolean(id))),
  ];
  const [people, inbound] = await Promise.all([
    client.from("clients").select("id, email").in("id", clientIds),
    sourceIds.length
      ? client.from("inbound_messages").select("id, from_addr, subject, body").in("id", sourceIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            from_addr: string | null;
            subject: string | null;
            body: string | null;
          }>,
        }),
  ]);
  const emailByClient = new Map((people.data ?? []).map((row) => [row.id, row.email]));
  const mailById = new Map((inbound.data ?? []).map((row) => [row.id, row]));
  return data.flatMap((row) => {
    const mail = row.source_message_id ? mailById.get(row.source_message_id) : null;
    const lesson = makeLesson({
      accepted: row.detection_status === "confirmed",
      from: mail?.from_addr ?? emailByClient.get(row.client_id),
      subject: mail?.subject,
      body: mail?.body ?? row.message,
    });
    return lesson ? [lesson] : [];
  });
}

async function loadInquiryLessonsFromSupabase() {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await loadInquiryLessons(supabaseAdmin);
  } catch {
    return null;
  }
}

export function liveRoutingStore(): RoutingStore {
  return {
    async listUnprocessed(limit) {
      const fromDb = await listUnprocessedFromSupabase(limit);
      if (fromDb) return fromDb;
      const local = await readJsonFile<InboundMessageRow[]>(INBOUND_PATH, []);
      return local
        .filter((row) => !row.processed_at && !row.routing_result)
        .sort((a, b) => a.received_at.localeCompare(b.received_at))
        .slice(0, limit);
    },
    async findMatches(message) {
      const fromDb = await findMatchesFromSupabase(message);
      if (fromDb) return fromDb;
      const book = await readLocalBook();
      return assembleMatches(message, book);
    },
    async findInquiryBySource(inboundId) {
      const fromDb = await findInquiryBySourceFromSupabase(inboundId);
      if (fromDb !== undefined) return fromDb;
      const book = await readLocalBook();
      return book.inquiries.find((row) => row.source_message_id === inboundId) ?? null;
    },
    async hasConversationMessage(gmailMessageId) {
      const fromDb = await hasConversationFromSupabase(gmailMessageId);
      if (fromDb !== null) return fromDb;
      const book = await readLocalBook();
      return book.messages.some((row) => row.gmail_message_id === gmailMessageId);
    },
    async attachMessage(input) {
      const written = await attachMessageSupabase(input);
      if (written) return;
      const book = await readLocalBook();
      if (
        input.message.gmail_message_id &&
        book.messages.some((row) => row.gmail_message_id === input.message.gmail_message_id)
      ) {
        return;
      }
      book.messages.push(conversationFromInbound(input.message, input.inquiryId, input.author));
      await writeLocalBook(book);
    },
    async createCandidate(input) {
      const fromDb = await createCandidateSupabase(input);
      if (fromDb) return fromDb;
      const memory = createMemoryRoutingStore(await readLocalBook());
      const created = await memory.store.createCandidate(input);
      await writeLocalBook({
        clients: memory.state.clients,
        inquiries: memory.state.inquiries,
        messages: memory.state.messages,
      });
      return created;
    },
    async markRouted(input) {
      const fromDb = await markRoutedSupabase(input);
      if (fromDb) return;
      await patchLocalInbound(input);
    },
    async logNegative(row) {
      const fromDb = await insertLabelSupabase(row);
      if (fromDb) return;
      const labels = await readJsonFile<InquiryRoutingLabelRow[]>(LABELS_PATH, []);
      labels.push(row);
      await writeJsonFile(LABELS_PATH, labels);
    },
    async listLessons() {
      const fromDb = await loadInquiryLessonsFromSupabase();
      if (fromDb) return fromDb;
      return [];
    },
  };
}

async function listUnprocessedFromSupabase(limit: number) {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const priority = await listThreadRepliesFromSupabase(limit);
    const { data, error } = await supabaseAdmin
      .from("inbound_messages")
      .select("*")
      .is("processed_at", null)
      .is("routing_result", null)
      .order("received_at", { ascending: true })
      .limit(limit);
    if (error) return null;
    const rest = (data ?? []) as InboundMessageRow[];
    if (!priority.length) return rest;
    const seen = new Set(priority.map((row) => row.id));
    const merged = [...priority];
    for (const row of rest) {
      if (seen.has(row.id)) continue;
      merged.push(row);
      if (merged.length >= limit) break;
    }
    return merged.slice(0, limit);
  } catch {
    return null;
  }
}

async function listThreadRepliesFromSupabase(limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const threads = await supabaseAdmin
    .from("inquiry_messages")
    .select("gmail_thread_id")
    .not("gmail_thread_id", "is", null);
  if (threads.error) return [];
  const threadIds = [
    ...new Set(
      (threads.data ?? [])
        .map((row) => row.gmail_thread_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!threadIds.length) return [];
  const found: InboundMessageRow[] = [];
  for (let i = 0; i < threadIds.length && found.length < limit; i += 100) {
    const slice = threadIds.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("inbound_messages")
      .select("*")
      .is("processed_at", null)
      .is("routing_result", null)
      .in("gmail_thread_id", slice)
      .order("received_at", { ascending: true })
      .limit(limit);
    if (error || !data) continue;
    found.push(...(data as InboundMessageRow[]));
  }
  return found.slice(0, limit);
}

async function findMatchesFromSupabase(message: InboundMessageRow) {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = normalizeSenderEmail(message.from_addr);
    const thread = message.gmail_thread_id?.trim() || null;
    const inquiryIds = new Set<string>();

    if (thread) {
      const { data, error } = await supabaseAdmin
        .from("inquiry_messages")
        .select("inquiry_id")
        .eq("gmail_thread_id", thread);
      if (error) return null;
      for (const row of data ?? []) inquiryIds.add(row.inquiry_id);
    }

    if (email) {
      const { data: clients, error: clientError } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("email", email);
      if (clientError) return null;
      const clientIds = (clients ?? []).map((row) => row.id);
      if (clientIds.length) {
        const { data: inquiries, error: inquiryError } = await supabaseAdmin
          .from("inquiries")
          .select("id")
          .in("client_id", clientIds);
        if (inquiryError) return null;
        for (const row of inquiries ?? []) inquiryIds.add(row.id);
      }
    }

    if (!inquiryIds.size) return [];
    const ids = [...inquiryIds];
    const [inquiryResult, messageResult] = await Promise.all([
      supabaseAdmin.from("inquiries").select("*").in("id", ids),
      supabaseAdmin.from("inquiry_messages").select("*").in("inquiry_id", ids),
    ]);
    if (inquiryResult.error || messageResult.error) return null;
    const inquiries = (inquiryResult.data ?? []) as InquiryRow[];
    const clientIds = [...new Set(inquiries.map((row) => row.client_id))];
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .in("id", clientIds);
    if (clientsError) return null;
    return assembleMatches(message, {
      inquiries,
      clients: (clients ?? []) as ClientRow[],
      messages: (messageResult.data ?? []) as InquiryMessageRow[],
    });
  } catch {
    return null;
  }
}

async function findInquiryBySourceFromSupabase(inboundId: string) {
  if (!supabaseConfigured()) return undefined;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("inquiries")
      .select("*")
      .eq("source_message_id", inboundId)
      .maybeSingle();
    if (error) return undefined;
    return (data as InquiryRow | null) ?? null;
  } catch {
    return undefined;
  }
}

async function hasConversationFromSupabase(gmailMessageId: string) {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("inquiry_messages")
      .select("id")
      .eq("gmail_message_id", gmailMessageId)
      .maybeSingle();
    if (error) return null;
    return Boolean(data);
  } catch {
    return null;
  }
}

async function attachMessageSupabase(input: {
  message: InboundMessageRow;
  inquiryId: string;
  author: string | null;
}) {
  if (!supabaseConfigured()) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = conversationFromInbound(input.message, input.inquiryId, input.author);
    const { error } = await supabaseAdmin.from("inquiry_messages").insert({
      inquiry_id: row.inquiry_id,
      direction: row.direction,
      channel: row.channel,
      subject: row.subject,
      body: row.body,
      from_address: row.from_address,
      to_address: row.to_address,
      gmail_message_id: row.gmail_message_id,
      gmail_thread_id: row.gmail_thread_id,
      author: row.author,
      sent_at: row.sent_at,
      status: row.status,
    });
    if (error?.code === "23505") return true;
    if (error) return false;
    const { refreshInquirySummarySafe } = await import("@/lib/os/inquiry-summary.server");
    void refreshInquirySummarySafe(supabaseAdmin, input.inquiryId);
    return true;
  } catch {
    return false;
  }
}

async function createCandidateSupabase(input: {
  message: InboundMessageRow;
  decision: RoutingDecision;
}) {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = normalizeSenderEmail(input.decision.extraction.email ?? input.message.from_addr);
    if (!email) throw new Error("candidate requires a sender email");
    const name = fallbackName(email, input.decision.extraction.name);
    const eventType = input.decision.extraction.event_type ?? "other";

    const { data: existingClient, error: findError } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (findError) return null;

    let clientId = existingClient?.id ?? null;
    if (!clientId) {
      const { data: created, error: createError } = await supabaseAdmin
        .from("clients")
        .insert({
          name,
          email,
          type: clientTypeFromEvent(eventType),
          source: "gmail",
        })
        .select("id")
        .single();
      if (!createError && created) clientId = created.id;
      else if (createError?.code === "23505") {
        const { data: raced } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("email", email)
          .single();
        clientId = raced?.id ?? null;
      } else {
        return null;
      }
    }
    if (!clientId) return null;

    const draft = candidateInquiry(input.message, clientId, input.decision);
    const { data: inquiry, error: inquiryError } = await supabaseAdmin
      .from("inquiries")
      .insert({
        client_id: draft.client_id,
        event_date: draft.event_date,
        event_date_tbd: draft.event_date_tbd,
        event_type: draft.event_type,
        venue_text: draft.venue_text,
        budget_range: draft.budget_range,
        source: draft.source,
        message: draft.message,
        status: draft.status,
        received_at: draft.received_at,
        origin: "detected" satisfies InquiryOrigin,
        detection_status: "candidate",
        detection_confidence: draft.detection_confidence,
        detection_reason: draft.detection_reason,
        source_message_id: draft.source_message_id,
      })
      .select("*")
      .single();
    if (inquiryError || !inquiry) return null;

    const attached = await attachMessageSupabase({
      message: input.message,
      inquiryId: inquiry.id,
      author: authorFor(input.message, input.decision.extraction),
    });
    if (!attached) return null;
    return { inquiryId: inquiry.id };
  } catch {
    return null;
  }
}

async function markRoutedSupabase(input: {
  inboundId: string;
  result: InboundRoutingResult;
  matchedInquiryId: string | null;
  processedAt: string;
}) {
  if (!supabaseConfigured()) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("inbound_messages")
      .update({
        routing_result: input.result,
        matched_inquiry_id: input.matchedInquiryId,
        processed_at: input.processedAt,
      })
      .eq("id", input.inboundId);
    return !error;
  } catch {
    return false;
  }
}

async function insertLabelSupabase(row: InquiryRoutingLabelRow) {
  if (!supabaseConfigured()) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("inquiry_routing_labels").insert({
      id: row.id,
      inbound_message_id: row.inbound_message_id,
      inquiry_id: row.inquiry_id,
      gmail_message_id: row.gmail_message_id,
      label: row.label,
      source: row.source,
      reason: row.reason,
      payload: row.payload,
      created_at: row.created_at,
    });
    return !error;
  } catch {
    return false;
  }
}

async function patchLocalInbound(input: {
  inboundId: string;
  result: InboundRoutingResult;
  matchedInquiryId: string | null;
  processedAt: string;
}) {
  const rows = await readJsonFile<InboundMessageRow[]>(INBOUND_PATH, []);
  const row = rows.find((item) => item.id === input.inboundId);
  if (!row) return;
  row.routing_result = input.result;
  row.matched_inquiry_id = input.matchedInquiryId;
  row.processed_at = input.processedAt;
  await writeJsonFile(INBOUND_PATH, rows);
}

async function readLocalBook(): Promise<LocalBook> {
  return readJsonFile<LocalBook>(BOOK_PATH, { clients: [], inquiries: [], messages: [] });
}

async function writeLocalBook(book: LocalBook) {
  await writeJsonFile(BOOK_PATH, book);
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, path);
}
