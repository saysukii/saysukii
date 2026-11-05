import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import {
  parseLoveNote,
  VIDEO_CONSENT_WORDING,
  VIDEO_MARKETING_WORDING,
  VOICE_CONSENT_WORDING,
  VOICE_MARKETING_WORDING,
} from "@/lib/love-note-input.ts";

const BUCKET = "love-notes";
const NOTES_PER_SENDER_PER_HOUR = 10;
const NOTES_PER_HOUR = 300;

type Client = SupabaseClient<Database>;

export type LoveNoteResult =
  | { status: 200; body: { ok: true; id: string | null; uploadUrl?: string } }
  | { status: 400 | 404 | 409 | 429 | 500; body: { ok: false; error: string } };

const refuse = (status: 400 | 404 | 409 | 429 | 500, error: string): LoveNoteResult => ({
  status,
  body: { ok: false, error },
});

/** Keyed, so the address itself is never stored and the hash can't be looked up. */
export function hashSender(address: string, secret: string) {
  return address ? createHmac("sha256", secret).update(address).digest("hex") : null;
}

async function notesSince(client: Client, since: string, senderHash?: string) {
  let query = client
    .from("love_notes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (senderHash) query = query.eq("sender_hash", senderHash);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Saves a note. A recording goes straight from the person's browser to private
 * storage, through a link that works once, so the note waits as "uploading" until it has arrived.
 */
export async function createLoveNote(
  client: Client,
  raw: unknown,
  senderHash: string | null,
): Promise<LoveNoteResult> {
  const parsed = parseLoveNote(raw);
  // a bot is told it worked, so it has no reason to try again
  if (parsed.kind === "bot") return { status: 200, body: { ok: true, id: null } };
  if (parsed.kind === "invalid") return refuse(400, parsed.error);
  const { note, name, audio, video, marketing } = parsed.input;

  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  if (
    (senderHash &&
      (await notesSince(client, anHourAgo, senderHash)) >= NOTES_PER_SENDER_PER_HOUR) ||
    (await notesSince(client, anHourAgo)) >= NOTES_PER_HOUR
  ) {
    return refuse(429, "too many notes, please try again later");
  }

  const id = crypto.randomUUID();
  const audioPath = audio ? `${id}/voice.${audio.extension}` : null;
  const videoPath = video ? `${id}/video.${video.extension}` : null;
  const recordingPath = audioPath ?? videoPath;
  const storage = client.storage.from(BUCKET);

  const now = new Date().toISOString();
  const inserted = await client.from("love_notes").insert({
    id,
    note,
    from_name: name,
    audio_path: audioPath,
    // only named when there is a video, so text and voice notes still save on a database that
    // hasn't had the video migration yet
    ...(videoPath ? { video_path: videoPath } : {}),
    consent_given_at: recordingPath ? now : null,
    consent_wording: recordingPath ? (video ? VIDEO_CONSENT_WORDING : VOICE_CONSENT_WORDING) : null,
    marketing_consent_given_at: marketing ? now : null,
    marketing_consent_wording: marketing
      ? video
        ? VIDEO_MARKETING_WORDING
        : VOICE_MARKETING_WORDING
      : null,
    status: recordingPath ? "uploading" : "received",
    sender_hash: senderHash,
  });
  if (inserted.error) throw inserted.error;

  if (!recordingPath) return { status: 200, body: { ok: true, id } };
  const link = await storage.createSignedUploadUrl(recordingPath);
  if (link.error) throw link.error;
  return { status: 200, body: { ok: true, id, uploadUrl: link.data.signedUrl } };
}

const finishSchema = z.object({ id: z.string().uuid() });

/** Marks a note received, once its recording really is in storage. Safe to call twice. */
export async function finishLoveNote(client: Client, raw: unknown): Promise<LoveNoteResult> {
  const parsed = finishSchema.safeParse(raw);
  if (!parsed.success) return refuse(400, "invalid note");
  const { id } = parsed.data;

  const { data: row, error } = await client
    .from("love_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return refuse(404, "note not found");
  const recordingPath = row.audio_path ?? row.video_path ?? null;
  if (row.status === "received" || !recordingPath) return { status: 200, body: { ok: true, id } };

  const name = recordingPath.split("/").pop()!;
  const listed = await client.storage.from(BUCKET).list(id, { search: name });
  if (listed.error) throw listed.error;
  if (!listed.data.some((file) => file.name === name))
    return refuse(409, "recording hasn't arrived");

  const updated = await client.from("love_notes").update({ status: "received" }).eq("id", id);
  if (updated.error) throw updated.error;
  return { status: 200, body: { ok: true, id } };
}

const MAX_BODY_LENGTH = 20_000;

/** Reads a public JSON request, with the same limits for every love note route. */
export async function readLoveNoteBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
