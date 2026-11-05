import { SAY_SUKII_STUDIO_ID } from "@/integrations/supabase/types";

import { decryptSecret, encryptSecret } from "./crypto.server";

const GRANOLA_NOTES_URL = "https://public-api.granola.ai/v1/notes?page_size=1";

export type GranolaConnectionStatus = "connected" | "disconnected" | "error";

export type GranolaConnection = {
  status: GranolaConnectionStatus;
  connected_at: string | null;
  updated_at: string | null;
};

type GranolaStored = GranolaConnection & {
  encrypted_api_key: string | null;
};

export type GranolaVault = {
  read(): Promise<GranolaStored | null>;
  write(record: Omit<GranolaStored, "updated_at">): Promise<void>;
};

export function normalizeGranolaKey(value: string) {
  return value.trim().replace(/^bearer\s+/i, "");
}

export function granolaKeyError(value: string) {
  const key = normalizeGranolaKey(value);
  if (!/^grn_[A-Za-z0-9._-]{8,200}$/.test(key)) {
    return "paste the api key from granola. it starts with grn_.";
  }
  return null;
}

type GranolaPerson = { name?: string | null; email?: string | null };

export type GranolaNoteListing = {
  id: string;
  title: string | null;
  created_at: string;
  deleted_at?: string | null;
};

export type GranolaNote = GranolaNoteListing & {
  summary_text?: string | null;
  owner?: GranolaPerson | null;
  attendees?: GranolaPerson[] | null;
  calendar_event?: {
    calendar_event_id?: string | null;
    invitees?: GranolaPerson[] | null;
    event_title?: string | null;
    scheduled_start_time?: string | null;
  } | null;
};

/** A meeting on the studio's calendar, as granola's notes are matched to it. */
export type GranolaMeeting = {
  /** the calendar event's title */
  name: string;
  startsAt: string;
  /** the guests' emails, from the invite */
  guests: string[];
  /** the event's ids on google calendar, which granola keeps on a note recorded from it */
  eventIds: string[];
};

const NEAR_MS = 15 * 60 * 1000;
/** how long after a meeting starts its note can still begin */
const NOTE_WINDOW_MS = 12 * 60 * 60 * 1000;
const GRANOLA_API = "https://public-api.granola.ai/v1";

const clean = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function peopleOn(note: GranolaNote) {
  return [...(note.attendees ?? []), ...(note.calendar_event?.invitees ?? [])]
    .map((person) => clean(person.email))
    .filter(Boolean);
}

/** Granola recorded this note from the meeting's own calendar event. */
function fromEvent(note: GranolaNote, meeting: GranolaMeeting) {
  const id = note.calendar_event?.calendar_event_id?.trim();
  return Boolean(id) && meeting.eventIds.includes(id!);
}

function hasGuest(note: GranolaNote, meeting: GranolaMeeting) {
  const guests = new Set(meeting.guests.map(clean).filter(Boolean));
  return guests.size > 0 && peopleOn(note).some((email) => guests.has(email));
}

/** The note lists other people and none of the meeting's guests, so it's someone else's call. */
function forSomeoneElse(note: GranolaNote, meeting: GranolaMeeting) {
  if (hasGuest(note, meeting)) return false;
  const owner = clean(note.owner?.email);
  return peopleOn(note).some((email) => email !== owner);
}

/** The studio's meetings carry the same title in the app, google calendar and granola. */
function titledSame(note: GranolaNote, name: string) {
  const wanted = clean(name);
  if (!wanted) return false;
  return clean(note.title) === wanted || clean(note.calendar_event?.event_title) === wanted;
}

function bookedTogether(note: GranolaNote, startsAt: string) {
  const scheduled = note.calendar_event?.scheduled_start_time;
  if (!scheduled) return false;
  return Math.abs(Date.parse(scheduled) - Date.parse(startsAt)) <= NEAR_MS;
}

/**
 * The note for this meeting, or none. Granola's own link to the calendar event decides it, then a
 * guest's email or the meeting's title. Failing those, a note scheduled for the same time will do,
 * but only one that lists nobody else, so one client's call can't end up under another's name.
 * Time alone is never enough.
 */
export function pickMeetingNote(notes: readonly GranolaNote[], meeting: GranolaMeeting) {
  const starts = Date.parse(meeting.startsAt);
  const gap = (note: GranolaNote) => Math.abs(Date.parse(note.created_at) - starts);
  const ready = notes
    .filter((note) => !note.deleted_at && note.summary_text?.trim())
    .filter((note) => {
      const created = Date.parse(note.created_at);
      return created >= starts - NEAR_MS && created <= starts + NOTE_WINDOW_MS;
    })
    .sort((left, right) => gap(left) - gap(right));
  return (
    ready.find((note) => fromEvent(note, meeting)) ??
    ready.find((note) => hasGuest(note, meeting)) ??
    ready.find((note) => titledSame(note, meeting.name)) ??
    ready.find(
      (note) => !forSomeoneElse(note, meeting) && bookedTogether(note, meeting.startsAt),
    ) ??
    null
  );
}

/** Each meeting with its note, earliest meeting first, and no note given to two meetings. */
export function matchMeetings<Meeting extends GranolaMeeting>(
  meetings: readonly Meeting[],
  notes: readonly GranolaNote[],
) {
  const left = [...notes];
  const pairs: Array<{ meeting: Meeting; note: GranolaNote }> = [];
  const ordered = [...meetings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (const meeting of ordered) {
    const note = pickMeetingNote(left, meeting);
    if (!note) continue;
    pairs.push({ meeting, note });
    left.splice(left.indexOf(note), 1);
  }
  return pairs;
}

type GranolaReadDeps = {
  fetchImpl?: typeof fetch;
  /** a pause between reads, to stay inside granola's 5 a second */
  pause?: (ms: number) => Promise<void>;
};

function granolaReader(apiKey: string, deps: GranolaReadDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return async <T>(path: string): Promise<T | null> => {
    const response = await fetchImpl(`${GRANOLA_API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    // a note still being written isn't shared yet
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`granola answered ${response.status}`);
    return (await response.json()) as T;
  };
}

/**
 * Granola's notes made in this window, read in full, leaving out ones already kept. Only notes with
 * a finished summary are shared, so a call still being written up simply isn't here yet.
 */
export async function readGranolaNotes(
  apiKey: string,
  window: { after: string; before: string; skip?: ReadonlySet<string>; most?: number },
  deps: GranolaReadDeps = {},
) {
  const read = granolaReader(apiKey, deps);
  const pause = deps.pause ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const listed: GranolaNoteListing[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({
      created_after: window.after,
      created_before: window.before,
      page_size: "30",
    });
    if (cursor) params.set("cursor", cursor);
    const list = await read<{
      notes?: GranolaNoteListing[];
      hasMore?: boolean;
      cursor?: string | null;
    }>(`/notes?${params}`);
    listed.push(...(list?.notes ?? []));
    cursor = list?.hasMore ? (list.cursor ?? null) : null;
    if (!cursor) break;
  }
  const wanted = listed
    .filter((note) => !note.deleted_at && !window.skip?.has(note.id))
    .slice(0, window.most ?? 20);
  const notes: GranolaNote[] = [];
  for (const [index, note] of wanted.entries()) {
    if (index) await pause(250);
    const full = await read<GranolaNote>(`/notes/${encodeURIComponent(note.id)}`);
    if (full) notes.push(full);
  }
  return notes;
}

/** The window of notes that could belong to meetings starting between these times. */
export function noteWindow(earliestStart: string, latestStart: string, now: Date) {
  const before = Math.min(Date.parse(latestStart) + NOTE_WINDOW_MS, now.getTime());
  return {
    after: new Date(Date.parse(earliestStart) - NEAR_MS).toISOString(),
    before: new Date(before).toISOString(),
  };
}

export function openGranolaKey(row: { encrypted_api_key: string | null } | null) {
  return row?.encrypted_api_key ? decryptSecret(row.encrypted_api_key) : null;
}

export function createMemoryGranolaVault(): GranolaVault {
  let row: GranolaStored | null = null;
  return {
    async read() {
      return row;
    },
    async write(record) {
      row = { ...record, updated_at: new Date().toISOString() };
    },
  };
}

export function publicGranola(row: GranolaStored | null): GranolaConnection {
  const connected = row?.status === "connected" && Boolean(row.encrypted_api_key);
  return {
    status: connected ? "connected" : row?.status === "error" ? "error" : "disconnected",
    connected_at: connected ? row.connected_at : null,
    updated_at: row?.updated_at ?? null,
  };
}

export async function readGranolaConnection(vault: GranolaVault) {
  return publicGranola(await vault.read());
}

export async function connectGranolaKey(
  apiKey: string,
  deps: { vault: GranolaVault; fetchImpl?: typeof fetch; now?: () => Date },
) {
  const key = normalizeGranolaKey(apiKey);
  const invalid = granolaKeyError(key);
  if (invalid) throw new Error(invalid);

  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(GRANOLA_NOTES_URL, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("granola could not be reached. try again.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("granola did not accept that key.");
  }
  if (!response.ok) {
    throw new Error("granola could not be reached. try again.");
  }

  // granola accepts a key that can't see any notes, which would leave every summary waiting
  const seesNotes = await response
    .json()
    .then((body: { notes?: unknown[] }) =>
      Array.isArray(body?.notes) ? body.notes.length > 0 : null,
    )
    .catch(() => null);

  const now = (deps.now ?? (() => new Date()))().toISOString();
  await deps.vault.write({
    encrypted_api_key: encryptSecret(key),
    status: "connected",
    connected_at: now,
  });
  return {
    status: "connected" as const,
    connected_at: now,
    updated_at: now,
    sees_notes: seesNotes,
  };
}

export async function disconnectGranolaKey(deps: { vault: GranolaVault; now?: () => Date }) {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  await deps.vault.write({
    encrypted_api_key: null,
    status: "disconnected",
    connected_at: null,
  });
  return { status: "disconnected" as const, connected_at: null, updated_at: now };
}

export function supabaseGranolaVault(): GranolaVault {
  return {
    async read() {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("granola_integration")
        .select("encrypted_api_key, status, connected_at, updated_at")
        .eq("studio_id", SAY_SUKII_STUDIO_ID)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async write(record) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("granola_integration").upsert(
        {
          studio_id: SAY_SUKII_STUDIO_ID,
          encrypted_api_key: record.encrypted_api_key,
          status: record.status,
          connected_at: record.connected_at,
        },
        { onConflict: "studio_id" },
      );
      if (error) throw new Error(error.message);
    },
  };
}
