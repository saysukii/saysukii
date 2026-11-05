import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import { appFileLink } from "@/lib/app-file-link";
import { loveNoteFileName, type LoveNote } from "@/lib/love-note-view";

const BUCKET = "love-notes";
const LINK_SECONDS = 60 * 30;

/** The notes that have fully arrived, newest first. A recording still uploading isn't shown. */
export const listLoveNotes = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<LoveNote[]> => {
    const { data, error } = await context.supabase
      .from("love_notes")
      .select(
        "id, note, from_name, created_at, audio_path, consent_given_at, consent_wording, marketing_consent_given_at, marketing_consent_wording",
      )
      .eq("status", "received")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const paths = rows.flatMap((row) => (row.audio_path ? [row.audio_path] : []));
    const links = new Map<string, string>();
    if (paths.length > 0) {
      const signed = await context.supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, LINK_SECONDS);
      for (const row of signed.data ?? []) {
        if (row.path && row.signedUrl) links.set(row.path, appFileLink(row.signedUrl)!);
      }
    }

    return rows.map((row) => {
      const audioUrl = row.audio_path ? (links.get(row.audio_path) ?? null) : null;
      const downloadName = row.audio_path
        ? loveNoteFileName(row.from_name, row.created_at, row.audio_path)
        : null;
      return {
        id: row.id,
        note: row.note,
        name: row.from_name,
        createdAt: row.created_at,
        audioUrl,
        downloadUrl:
          audioUrl && downloadName
            ? `${audioUrl}&download=${encodeURIComponent(downloadName)}`
            : null,
        downloadName,
        hasRecording: !!row.audio_path,
        okToUse: !!row.consent_given_at,
        okForMarketing: !!row.marketing_consent_given_at,
        consentWording: row.consent_wording,
        marketingWording: row.marketing_consent_wording,
      };
    });
  });

/** What's come in lately, for the bell. */
export const listFreshLoveNotes = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("love_notes")
      .select("id, from_name, audio_path")
      .eq("status", "received")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.from_name,
      hasRecording: !!row.audio_path,
    }));
  });

/** Deletes a note for good, with its recording. */
export const deleteLoveNote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("love_notes")
      .select("audio_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: true as const };

    // the recording goes first, so a note is never gone while its recording stays behind
    if (row.audio_path) {
      const removed = await context.supabase.storage.from(BUCKET).remove([row.audio_path]);
      if (removed.error) throw new Error(removed.error.message);
    }
    const deleted = await context.supabase.from("love_notes").delete().eq("id", data.id);
    if (deleted.error) throw new Error(deleted.error.message);
    return { ok: true as const };
  });
