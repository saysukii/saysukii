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
    return "paste the workspace key from granola. it starts with grn_.";
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
    invitees?: GranolaPerson[] | null;
    event_title?: string | null;
    scheduled_start_time?: string | null;
  } | null;
};

export type GranolaMeeting = {
  name: string;
  email: string;
  /** when the call was booked for */
  startsAt: string;
  /** when granola was opened for it, or the booked time for a call recorded straight in granola */
  startedAt: string;
};

const CLOSE_TO_RECORDING_MS = 15 * 60 * 1000;

function hasGuest(note: GranolaNote, email: string) {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return false;
  const people = [...(note.attendees ?? []), ...(note.calendar_event?.invitees ?? [])];
  return people.some((person) => person.email?.trim().toLowerCase() === wanted);
}

/** The note lists other people and the guest isn't one of them, so it's someone else's call. */
function forSomeoneElse(note: GranolaNote, email: string) {
  if (hasGuest(note, email)) return false;
  const owner = note.owner?.email?.trim().toLowerCase();
  const people = [...(note.attendees ?? []), ...(note.calendar_event?.invitees ?? [])];
  return people.some((person) => {
    const address = person.email?.trim().toLowerCase();
    return Boolean(address) && address !== owner;
  });
}

function namesGuest(note: GranolaNote, name: string) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;
  const title = `${note.title ?? ""} ${note.calendar_event?.event_title ?? ""}`.toLowerCase();
  return title.includes(wanted);
}

/** The studio's meetings carry the same title in the app, google calendar and granola. */
function titledSame(note: GranolaNote, name: string) {
  const clean = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const wanted = clean(name);
  if (!wanted) return false;
  return clean(note.title) === wanted || clean(note.calendar_event?.event_title) === wanted;
}

function bookedTogether(note: GranolaNote, startsAt: string) {
  const scheduled = note.calendar_event?.scheduled_start_time;
  if (!scheduled) return false;
  return Math.abs(Date.parse(scheduled) - Date.parse(startsAt)) <= CLOSE_TO_RECORDING_MS;
}

/**
 * The note for this meeting, or none. The guest's email or the meeting's title decide it. Failing
 * those, the calendar time or a note begun within minutes of opening granola here will do, but only
 * for a note that lists nobody else, so one client's call can't end up under another's name.
 */
export function pickMeetingNote(notes: GranolaNote[], meeting: GranolaMeeting) {
  const started = Date.parse(meeting.startedAt);
  const gap = (note: GranolaNote) => Math.abs(Date.parse(note.created_at) - started);
  const ready = notes
    .filter((note) => !note.deleted_at && note.summary_text?.trim())
    .sort((left, right) => gap(left) - gap(right));
  const unclaimed = ready.filter((note) => !forSomeoneElse(note, meeting.email));
  // a meeting looked up on opening has no moment granola was opened to go by
  const openedHere = meeting.startedAt !== meeting.startsAt;
  return (
    ready.find((note) => hasGuest(note, meeting.email)) ??
    ready.find((note) => titledSame(note, meeting.name)) ??
    unclaimed.find((note) => bookedTogether(note, meeting.startsAt)) ??
    ready.find((note) => namesGuest(note, meeting.name)) ??
    (openedHere ? unclaimed.find((note) => gap(note) <= CLOSE_TO_RECORDING_MS) : undefined) ??
    null
  );
}

/** Looks for this meeting's note. Notes still being written aren't shared by granola yet. */
export async function findMeetingNote(
  apiKey: string,
  meeting: GranolaMeeting,
  fetchImpl: typeof fetch = fetch,
) {
  const after = new Date(Date.parse(meeting.startedAt) - CLOSE_TO_RECORDING_MS).toISOString();
  const read = async <T>(path: string): Promise<T | null> => {
    const response = await fetchImpl(`https://public-api.granola.ai/v1${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`granola answered ${response.status}`);
    return (await response.json()) as T;
  };

  const before = new Date(Date.parse(meeting.startedAt) + 12 * 60 * 60 * 1000).toISOString();
  const list = await read<{ notes?: GranolaNoteListing[] }>(
    `/notes?created_after=${encodeURIComponent(after)}&created_before=${encodeURIComponent(before)}&page_size=10`,
  );
  const notes = await Promise.all(
    (list?.notes ?? [])
      .filter((note) => !note.deleted_at)
      .slice(0, 10)
      .map((note) => read<GranolaNote>(`/notes/${encodeURIComponent(note.id)}`)),
  );
  return pickMeetingNote(
    notes.filter((note): note is GranolaNote => note !== null),
    meeting,
  );
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
