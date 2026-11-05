import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import type { StudioMeeting } from "@/lib/os/google.server";
import {
  matchMeetings,
  noteWindow,
  openGranolaKey,
  readGranolaNotes,
  supabaseGranolaVault,
  type GranolaNote,
} from "@/lib/os/granola.server";

type StudioClient = SupabaseClient<Database>;

/** how far back the sync looks for meetings still waiting on their summary */
export const SYNC_LOOKBACK_MS = 12 * 60 * 60 * 1000;

export type MeetingSyncDeps = {
  readKey: () => Promise<string | null>;
  readMeetings: (from: Date, to: Date) => Promise<StudioMeeting[] | null>;
  /** the notes and calendar events that already have a summary kept */
  readKept: (since: Date) => Promise<{ noteIds: Set<string>; eventIds: Set<string> }>;
  keep: (meeting: StudioMeeting, note: GranolaNote) => Promise<void>;
  readNotes?: typeof readGranolaNotes;
};

export type MeetingSyncResult =
  { status: "no_key" | "no_calendar" } | { status: "ok"; waiting: number; kept: number };

/**
 * Brings in granola's summary for each meeting on the studio's calendar that started in the last
 * twelve hours and doesn't have one yet. Granola only shares a note once its summary is written,
 * so a call still being written up is simply looked for again next time.
 */
export async function syncMeetingSummaries(
  deps: MeetingSyncDeps,
  options: { now?: Date; only?: string } = {},
): Promise<MeetingSyncResult> {
  const now = options.now ?? new Date();
  const key = await deps.readKey();
  if (!key) return { status: "no_key" };

  const meetings = options.only
    ? await deps.readMeetings(new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000), now)
    : await deps.readMeetings(new Date(now.getTime() - SYNC_LOOKBACK_MS), now);
  if (!meetings) return { status: "no_calendar" };

  const since = new Date(now.getTime() - 62 * 24 * 60 * 60 * 1000);
  const kept = await deps.readKept(since);
  const waiting = meetings.filter(
    (meeting) => !kept.eventIds.has(meeting.id) && (!options.only || meeting.id === options.only),
  );
  if (!waiting.length) return { status: "ok", waiting: 0, kept: 0 };

  const starts = waiting.map((meeting) => meeting.startsAt).sort();
  const window = noteWindow(starts[0]!, starts[starts.length - 1]!, now);
  const notes = await (deps.readNotes ?? readGranolaNotes)(key, {
    ...window,
    skip: kept.noteIds,
  });

  let count = 0;
  for (const { meeting, note } of matchMeetings(waiting, notes)) {
    await deps.keep(meeting, note);
    count += 1;
  }
  return { status: "ok", waiting: waiting.length, kept: count };
}

/** The sync wired to the studio's database, calendar and granola key. */
export function studioMeetingSync(client: StudioClient): MeetingSyncDeps {
  return {
    async readKey() {
      return openGranolaKey(await supabaseGranolaVault().read());
    },
    async readMeetings(from, to) {
      const { readStudioMeetings } = await import("@/lib/os/google.server");
      return readStudioMeetings(from, to);
    },
    async readKept(since) {
      const { data, error } = await client
        .from("meetings")
        .select("granola_note_id, calendar_event_id")
        .gte("occurred_at", since.toISOString());
      if (error) throw new Error(error.message);
      return {
        noteIds: new Set((data ?? []).map((row) => row.granola_note_id)),
        eventIds: new Set(
          (data ?? []).flatMap((row) => (row.calendar_event_id ? [row.calendar_event_id] : [])),
        ),
      };
    },
    async keep(meeting, note) {
      const { error } = await client.from("meetings").insert({
        granola_note_id: note.id,
        calendar_event_id: meeting.id,
        title: meeting.name || note.title || "meeting",
        occurred_at: meeting.startsAt,
        summary: note.summary_text ?? "",
        attendees: (note.attendees ?? []) as Json,
      });
      // another run kept it first
      if (error && error.code !== "23505") throw new Error(error.message);
    },
  };
}
