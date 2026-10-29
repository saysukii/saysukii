import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { InboundMessageRow } from "../../integrations/supabase/types";
import { mailRecord } from "./mail-people";

const LOOKBACK_DAYS = 7;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;
const MAX_NEW_FETCH = 50;
const CURSOR_PATH = join(process.cwd(), ".data", "gmail-inbound-cursor.json");
const MESSAGES_PATH = join(process.cwd(), ".data", "inbound-messages.json");

export type CapturedInbound = {
  gmail_message_id: string;
  gmail_thread_id: string | null;
  from_addr: string | null;
  from_name: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
};

export type InboundSyncResult = {
  skipped: boolean;
  reason: string | null;
  scanned: number;
  inserted: number;
  duplicates: number;
  historyId: string | null;
};

export type InboundCursor = {
  historyId: string | null;
  lastSyncedAt: string | null;
};

export type GmailApiPart = {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailApiPart[];
};

export type GmailApiMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailApiPart;
};

export type InboundMailbox = {
  profileHistoryId(): Promise<string | null>;
  listHistory(
    historyId: string,
    pageToken?: string,
    labelId?: string,
  ): Promise<{
    ids: string[];
    historyId: string | null;
    nextPageToken: string | null;
    expired: boolean;
  }>;
  listInbox(
    query: string,
    pageToken?: string,
  ): Promise<{
    ids: string[];
    nextPageToken: string | null;
  }>;
  /** null when the message is gone, like a draft that was edited or sent since it was listed */
  getMessage(id: string): Promise<GmailApiMessage | null>;
};

export type InboundStore = {
  existingIds(ids: string[]): Promise<Set<string>>;
  insert(rows: CapturedInbound[]): Promise<number>;
  readCursor(): Promise<InboundCursor>;
  writeCursor(cursor: InboundCursor): Promise<void>;
};

export function createMemoryInboundStore(initial: CapturedInbound[] = []): InboundStore {
  const rows = new Map(initial.map((row) => [row.gmail_message_id, row]));
  let cursor: InboundCursor = { historyId: null, lastSyncedAt: null };
  return {
    async existingIds(ids) {
      return new Set(ids.filter((id) => rows.has(id)));
    },
    async insert(incoming) {
      let inserted = 0;
      for (const row of incoming) {
        if (rows.has(row.gmail_message_id)) continue;
        rows.set(row.gmail_message_id, row);
        inserted += 1;
      }
      return inserted;
    },
    async readCursor() {
      return cursor;
    },
    async writeCursor(next) {
      cursor = next;
    },
  };
}

export function decodeGmailBody(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function headerValue(payload: GmailApiPart | undefined, name: string) {
  const match = payload?.headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );
  const value = match?.value?.trim();
  return value ? value : null;
}

export function headerEmail(value: string | null) {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  const email = (angled?.[1] ?? value).trim();
  return email.slice(0, 320) || null;
}

export function headerName(value: string | null) {
  const named = value?.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = named?.[1]?.trim() ?? "";
  return name.length >= 2 && !name.includes("@") ? name.slice(0, 160) : null;
}

/** Every address on To and Cc, kept as the same "to · cc:" line the studio writes when it sends. */
export function headerRecipients(to: string | null, cc: string | null) {
  const addresses = (value: string | null) => value?.match(/[^\s<>",;]+@[^\s<>",;]+/g) ?? [];
  const line = mailRecord(addresses(to), addresses(cc)).line;
  return line ? line.slice(0, 2000) : null;
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectBodies(part: GmailApiPart | undefined, into: { plain: string[]; html: string[] }) {
  if (!part) return;
  const mime = part.mimeType ?? "";
  const data = part.body?.data;
  if (data && mime.startsWith("text/plain")) into.plain.push(decodeGmailBody(data));
  else if (data && mime.startsWith("text/html")) into.html.push(decodeGmailBody(data));
  for (const child of part.parts ?? []) collectBodies(child, into);
}

export function parseGmailMessage(message: GmailApiMessage): CapturedInbound | null {
  const id = message.id?.trim();
  if (!id) return null;
  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(message.payload, bodies);
  const body = bodies.plain.join("\n\n").trim() || htmlToText(bodies.html.join("\n"));
  const internal = message.internalDate ? Number(message.internalDate) : NaN;
  const receivedAt = Number.isFinite(internal)
    ? new Date(internal).toISOString()
    : new Date().toISOString();
  return {
    gmail_message_id: id,
    gmail_thread_id: message.threadId?.trim() || null,
    from_addr: headerEmail(headerValue(message.payload, "From")),
    from_name: headerName(headerValue(message.payload, "From")),
    to_addr: headerRecipients(
      headerValue(message.payload, "To"),
      headerValue(message.payload, "Cc"),
    ),
    subject: headerValue(message.payload, "Subject"),
    body: body || null,
    received_at: receivedAt,
  };
}

export async function syncInboundMail(deps: {
  mailbox: InboundMailbox;
  store: InboundStore;
  now?: () => Date;
  lookbackDays?: number;
}): Promise<Omit<InboundSyncResult, "skipped" | "reason"> & { skipped: false; reason: null }> {
  const now = deps.now?.() ?? new Date();
  const lookbackDays = deps.lookbackDays ?? LOOKBACK_DAYS;
  const cursor = await deps.store.readCursor();
  const ids: string[] = [];
  let historyId = cursor.historyId;
  let usedHistory = false;

  if (cursor.historyId) {
    const history = await collectHistoryIds(deps.mailbox, cursor.historyId);
    if (!history.expired) {
      ids.push(...history.ids);
      historyId = history.historyId ?? cursor.historyId;
      usedHistory = true;
    }
  }

  if (!usedHistory) {
    const listed = await collectInboxIds(deps.mailbox, lookbackDays);
    ids.push(...listed);
  }

  const uniqueIds = [...new Set(ids)];
  const already = uniqueIds.length ? await deps.store.existingIds(uniqueIds) : new Set<string>();
  const unseen = uniqueIds.filter((id) => !already.has(id));
  const freshIds = unseen.slice(0, MAX_NEW_FETCH);
  const captured: CapturedInbound[] = [];
  for (const id of freshIds) {
    const raw = await deps.mailbox.getMessage(id);
    if (!raw) continue;
    if (raw.labelIds && !CAPTURED_LABELS.some((label) => raw.labelIds?.includes(label))) continue;
    const parsed = parseGmailMessage(raw);
    if (parsed) captured.push(parsed);
  }

  const inserted = captured.length ? await deps.store.insert(captured) : 0;
  // with more waiting than one run reads, stay where we were so the rest comes in next time
  const caughtUp = unseen.length <= MAX_NEW_FETCH;
  const profileHistory = caughtUp ? await deps.mailbox.profileHistoryId() : null;
  const nextHistory = caughtUp ? (profileHistory ?? historyId ?? null) : cursor.historyId;
  await deps.store.writeCursor({
    historyId: nextHistory,
    lastSyncedAt: now.toISOString(),
  });

  return {
    skipped: false,
    reason: null,
    scanned: uniqueIds.length,
    inserted,
    duplicates: already.size,
    historyId: nextHistory,
  };
}

// what clients send, and what the studio sends straight from gmail
const CAPTURED_LABELS = ["INBOX", "SENT"];

async function collectHistoryIds(mailbox: InboundMailbox, startHistoryId: string) {
  const ids: string[] = [];
  let historyId: string | null = startHistoryId;
  for (const label of CAPTURED_LABELS) {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await mailbox.listHistory(startHistoryId, pageToken, label);
      if (result.expired) return { ids: [], historyId: null, expired: true as const };
      ids.push(...result.ids);
      historyId = result.historyId ?? historyId;
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }
  }
  return { ids, historyId, expired: false as const };
}

async function collectInboxIds(mailbox: InboundMailbox, lookbackDays: number) {
  const ids: string[] = [];
  let pageToken: string | undefined;
  const query = `{in:inbox in:sent} newer_than:${lookbackDays}d`;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = pageToken
      ? await mailbox.listInbox(query, pageToken)
      : await mailbox.listInbox(query);
    ids.push(...result.ids);
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }
  return ids;
}

export async function runGmailInboundSync(): Promise<InboundSyncResult> {
  const { getGmailPublicStatus, validGmailAccessToken } = await import("./gmail.server");
  const status = await getGmailPublicStatus();
  if (status.status !== "connected") {
    return {
      skipped: true,
      reason: "gmail_not_connected",
      scanned: 0,
      inserted: 0,
      duplicates: 0,
      historyId: null,
    };
  }

  try {
    await validGmailAccessToken();
  } catch {
    return {
      skipped: true,
      reason: "gmail_not_connected",
      scanned: 0,
      inserted: 0,
      duplicates: 0,
      historyId: null,
    };
  }

  const result = await syncInboundMail({
    mailbox: liveInboundMailbox(),
    store: liveInboundStore(),
  });
  await recordInboundSync(result);
  return result;
}

function liveInboundMailbox(): InboundMailbox {
  return {
    async profileHistoryId() {
      const payload = await gmailGet<{ historyId?: string }>("/profile");
      return payload.historyId ?? null;
    },
    async listHistory(historyId, pageToken, labelId) {
      const params = new URLSearchParams({
        startHistoryId: historyId,
        historyTypes: "messageAdded",
        // drafts come and go; only what lands in a label we read is asked for
        ...(labelId ? { labelId } : {}),
        maxResults: String(PAGE_SIZE),
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await gmailFetch(`/history?${params.toString()}`);
      if (response.status === 404 || response.status === 400) {
        return { ids: [], historyId: null, nextPageToken: null, expired: true };
      }
      const payload = (await response.json()) as {
        history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
        historyId?: string;
        nextPageToken?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message || "Gmail history.list failed");
      }
      const ids = (payload.history ?? []).flatMap((entry) =>
        (entry.messagesAdded ?? [])
          .map((added) => added.message?.id)
          .filter((id): id is string => Boolean(id)),
      );
      return {
        ids,
        historyId: payload.historyId ?? null,
        nextPageToken: payload.nextPageToken ?? null,
        expired: false,
      };
    },
    async listInbox(query, pageToken) {
      const params = new URLSearchParams({
        q: query,
        maxResults: String(PAGE_SIZE),
      });
      if (pageToken) params.set("pageToken", pageToken);
      const payload = await gmailGet<{
        messages?: Array<{ id?: string }>;
        nextPageToken?: string;
      }>(`/messages?${params.toString()}`);
      return {
        ids: (payload.messages ?? [])
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
        nextPageToken: payload.nextPageToken ?? null,
      };
    },
    async getMessage(id) {
      const response = await gmailFetch(`/messages/${encodeURIComponent(id)}?format=full`);
      // history still lists messages that were deleted after they arrived; skip them, or the sync stalls on them
      if (response.status === 404) return null;
      const payload = (await response.json()) as GmailApiMessage & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message || `Gmail request failed (${response.status})`);
      }
      return payload;
    },
  };
}

function liveInboundStore(): InboundStore {
  return {
    async existingIds(ids) {
      const fromDb = await existingIdsFromSupabase(ids);
      if (fromDb) return fromDb;
      const local = await readLocalMessages();
      return new Set(ids.filter((id) => local.some((row) => row.gmail_message_id === id)));
    },
    async insert(rows) {
      const written = await insertSupabaseMessages(rows);
      if (written !== null) return written;
      return insertLocalMessages(rows);
    },
    async readCursor() {
      const fromDb = await readSupabaseCursor();
      if (fromDb) return fromDb;
      return readLocalCursor();
    },
    async writeCursor(cursor) {
      // the server's own folder is read-only on vercel; the local file is only for running without supabase
      if (supabaseConfigured()) {
        await writeSupabaseCursor(cursor);
        return;
      }
      await writeLocalCursor(cursor);
    },
  };
}

async function gmailGet<T>(path: string): Promise<T> {
  const response = await gmailFetch(path);
  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gmail request failed (${response.status})`);
  }
  return payload;
}

async function gmailFetch(path: string) {
  const { validGmailAccessToken } = await import("./gmail.server");
  const accessToken = await validGmailAccessToken();
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function supabaseConfigured() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

async function existingIdsFromSupabase(ids: string[]) {
  if (!supabaseConfigured() || ids.length === 0) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 50) {
      const slice = ids.slice(i, i + 50);
      const { data, error } = await supabaseAdmin
        .from("inbound_messages")
        .select("gmail_message_id")
        .in("gmail_message_id", slice);
      if (error) return null;
      for (const row of data ?? []) found.add(row.gmail_message_id);
    }
    return found;
  } catch {
    return null;
  }
}

async function insertSupabaseMessages(rows: CapturedInbound[]) {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("inbound_messages")
      .upsert(
        rows.map((row) => ({
          gmail_message_id: row.gmail_message_id,
          gmail_thread_id: row.gmail_thread_id,
          from_addr: row.from_addr,
          from_name: row.from_name,
          to_addr: row.to_addr,
          subject: row.subject,
          body: row.body,
          received_at: row.received_at,
          processed_at: null,
          routing_result: null,
          matched_inquiry_id: null,
        })),
        { onConflict: "gmail_message_id", ignoreDuplicates: true },
      )
      .select("gmail_message_id");
    if (error) {
      console.error("[gmail-inbound] insert failed:", error.message);
      return null;
    }
    return data?.length ?? 0;
  } catch (error) {
    console.error(
      "[gmail-inbound] inbound_messages unavailable — using local capture until Supabase is activated.",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function readSupabaseCursor(): Promise<InboundCursor | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integration_events")
      .select("payload")
      .eq("provider", "gmail")
      .eq("event_type", "inbound_sync_cursor")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      error ||
      !data?.payload ||
      typeof data.payload !== "object" ||
      Array.isArray(data.payload)
    ) {
      return null;
    }
    const historyId = data.payload["historyId"];
    const lastSyncedAt = data.payload["lastSyncedAt"];
    return {
      historyId: typeof historyId === "string" ? historyId : null,
      lastSyncedAt: typeof lastSyncedAt === "string" ? lastSyncedAt : null,
    };
  } catch {
    return null;
  }
}

async function writeSupabaseCursor(cursor: InboundCursor) {
  if (!supabaseConfigured()) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integration_events").insert({
      provider: "gmail",
      event_type: "inbound_sync_cursor",
      status: "succeeded",
      attempts: 1,
      payload: {
        historyId: cursor.historyId,
        lastSyncedAt: cursor.lastSyncedAt,
      },
    });
  } catch {
    // Local cursor is enough until Supabase is activated.
  }
}

async function recordInboundSync(result: InboundSyncResult) {
  if (!supabaseConfigured()) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integration_events").insert({
      provider: "gmail",
      event_type: "inbound_sync",
      status: "succeeded",
      attempts: 1,
      payload: {
        scanned: result.scanned,
        inserted: result.inserted,
        duplicates: result.duplicates,
        historyId: result.historyId,
      },
    });
  } catch {
    // Isolation / pre-Supabase: skip event log.
  }
}

async function readLocalMessages(): Promise<InboundMessageRow[]> {
  try {
    const raw = await readFile(MESSAGES_PATH, "utf8");
    const parsed = JSON.parse(raw) as InboundMessageRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function insertLocalMessages(rows: CapturedInbound[]) {
  const existing = await readLocalMessages();
  const known = new Set(existing.map((row) => row.gmail_message_id));
  const now = new Date().toISOString();
  const added: InboundMessageRow[] = [];
  for (const row of rows) {
    if (known.has(row.gmail_message_id)) continue;
    known.add(row.gmail_message_id);
    added.push({
      id: randomUUID(),
      gmail_message_id: row.gmail_message_id,
      gmail_thread_id: row.gmail_thread_id,
      from_addr: row.from_addr,
      from_name: row.from_name,
      to_addr: row.to_addr,
      subject: row.subject,
      body: row.body,
      received_at: row.received_at,
      processed_at: null,
      routing_result: null,
      matched_inquiry_id: null,
      created_at: now,
    });
  }
  if (added.length) await writeJsonFile(MESSAGES_PATH, [...existing, ...added]);
  return added.length;
}

async function readLocalCursor(): Promise<InboundCursor> {
  try {
    const raw = await readFile(CURSOR_PATH, "utf8");
    const parsed = JSON.parse(raw) as InboundCursor;
    return {
      historyId: parsed.historyId ?? null,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
    };
  } catch {
    return { historyId: null, lastSyncedAt: null };
  }
}

async function writeLocalCursor(cursor: InboundCursor) {
  await writeJsonFile(CURSOR_PATH, cursor);
}

async function writeJsonFile(path: string, value: unknown) {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, path);
}
