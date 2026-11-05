import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decryptSecret } from "./crypto.server";
import {
  connectGranolaKey,
  matchMeetings,
  noteWindow,
  pickMeetingNote,
  readGranolaNotes,
  createMemoryGranolaVault,
  disconnectGranolaKey,
  publicGranola,
  readGranolaConnection,
} from "./granola.server";

process.env["INTEGRATION_ENCRYPTION_KEY"] ??= "granola-isolation-test-key";

const KEY = "grn_workspace_key_for_say_sukii";

function notesResponse(status: number) {
  return new Response(
    status === 200 ? JSON.stringify({ notes: [], hasMore: false, cursor: null }) : "no",
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("granola connection", () => {
  it("rejects a key that is not a granola api key", async () => {
    const vault = createMemoryGranolaVault();
    await assert.rejects(
      connectGranolaKey("not-a-key", { vault, fetchImpl: async () => notesResponse(200) }),
      /starts with grn_/,
    );
    assert.equal(await vault.read(), null);
  });

  it("stores the key encrypted after granola accepts it", async () => {
    const vault = createMemoryGranolaVault();
    const seen: string[] = [];
    const connected = await connectGranolaKey(`  Bearer ${KEY}  `, {
      vault,
      now: () => new Date("2026-11-02T17:00:00.000Z"),
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        seen.push(headers.get("Authorization") ?? "");
        return notesResponse(200);
      },
    });

    assert.deepEqual(seen, [`Bearer ${KEY}`]);
    assert.equal(connected.status, "connected");
    const stored = await vault.read();
    assert.ok(stored?.encrypted_api_key);
    assert.equal(stored.encrypted_api_key.includes(KEY), false);
    assert.equal(decryptSecret(stored.encrypted_api_key), KEY);
    assert.deepEqual(await readGranolaConnection(vault), {
      status: "connected",
      connected_at: "2026-11-02T17:00:00.000Z",
      updated_at: stored.updated_at,
    });
    assert.equal(JSON.stringify(publicGranola(stored)).includes(KEY), false);
  });

  it("leaves the studio disconnected when granola refuses the key", async () => {
    const vault = createMemoryGranolaVault();
    await assert.rejects(
      connectGranolaKey(KEY, { vault, fetchImpl: async () => notesResponse(401) }),
      /did not accept/,
    );
    assert.equal((await readGranolaConnection(vault)).status, "disconnected");
  });

  it("clears the key on disconnect", async () => {
    const vault = createMemoryGranolaVault();
    await connectGranolaKey(KEY, { vault, fetchImpl: async () => notesResponse(200) });
    const disconnected = await disconnectGranolaKey({ vault });
    assert.equal(disconnected.status, "disconnected");
    assert.equal((await vault.read())?.encrypted_api_key, null);
    assert.equal((await readGranolaConnection(vault)).status, "disconnected");
  });
});

describe("finding a meeting's summary", () => {
  const meeting = {
    id: "evt_camila",
    eventIds: ["evt_camila", "evt_camila@google.com"],
    name: "let's talk · Camila Reyes",
    startsAt: "2026-11-03T15:00:00.000Z",
    guests: ["camila@test.dev"],
  };
  const note = (id: string, createdAt: string, extra = {}) => ({
    id,
    title: "untitled",
    created_at: createdAt,
    summary_text: `summary of ${id}`,
    owner: { email: "info@saysukii.com" },
    ...extra,
  });
  const lumen = {
    title: "Lumen Studio",
    attendees: [{ email: "info@saysukii.com" }, { email: "hello@lumen.dev" }],
  };

  it("goes by granola's link to the calendar event first", () => {
    const found = pickMeetingNote(
      [
        note("not_guest", "2026-11-03T15:01:00.000Z", {
          attendees: [{ email: "camila@test.dev" }],
        }),
        note("not_event", "2026-11-03T15:20:00.000Z", {
          calendar_event: { calendar_event_id: "evt_camila@google.com" },
        }),
      ],
      meeting,
    );
    assert.equal(found?.id, "not_event");
  });

  it("then by a guest's email, from the note or its invite", () => {
    assert.equal(
      pickMeetingNote(
        [
          note("not_close", "2026-11-03T15:00:30.000Z"),
          note("not_guest", "2026-11-03T15:12:00.000Z", {
            calendar_event: { invitees: [{ email: "CAMILA@test.dev" }] },
          }),
        ],
        meeting,
      )?.id,
      "not_guest",
    );
  });

  it("then by the meeting's title", () => {
    assert.equal(
      pickMeetingNote(
        [note("not_title", "2026-11-03T15:11:00.000Z", { title: "  let's talk ·  camila reyes " })],
        meeting,
      )?.id,
      "not_title",
    );
  });

  it("then by the scheduled time, for a note that lists nobody else", () => {
    const sameTime = { calendar_event: { scheduled_start_time: "2026-11-03T15:00:00.000Z" } };
    assert.equal(
      pickMeetingNote([note("not_cal", "2026-11-03T15:02:00.000Z", sameTime)], meeting)?.id,
      "not_cal",
    );
    assert.equal(
      pickMeetingNote(
        [note("not_lumen", "2026-11-03T15:02:00.000Z", { ...lumen, ...sameTime })],
        meeting,
      ),
      null,
    );
  });

  it("never goes by time alone", () => {
    assert.equal(pickMeetingNote([note("not_near", "2026-11-03T15:01:00.000Z")], meeting), null);
    assert.equal(
      pickMeetingNote([note("not_lumen", "2026-11-03T15:05:00.000Z", lumen)], meeting),
      null,
    );
  });

  it("doesn't count the note's owner as someone else", () => {
    const mine = {
      attendees: [{ email: "INFO@saysukii.com" }],
      calendar_event: { scheduled_start_time: "2026-11-03T15:00:00.000Z" },
    };
    assert.equal(
      pickMeetingNote([note("not_mine", "2026-11-03T15:05:00.000Z", mine)], meeting)?.id,
      "not_mine",
    );
  });

  it("skips deleted notes, notes with no summary, and notes from another day", () => {
    const linked = { calendar_event: { calendar_event_id: "evt_camila" } };
    assert.equal(
      pickMeetingNote(
        [
          note("not_gone", "2026-11-03T15:03:00.000Z", { ...linked, deleted_at: "2026-11-03" }),
          note("not_empty", "2026-11-03T15:03:00.000Z", { ...linked, summary_text: " " }),
          note("not_early", "2026-11-03T14:30:00.000Z", linked),
          note("not_late", "2026-11-04T04:00:00.000Z", linked),
        ],
        meeting,
      ),
      null,
    );
  });

  it("gives each note to one meeting only", () => {
    const both = { calendar_event: { scheduled_start_time: "2026-11-03T15:00:00.000Z" } };
    const second = { ...meeting, id: "evt_two", eventIds: ["evt_two"], name: "", guests: [] };
    const pairs = matchMeetings(
      [second, meeting],
      [note("not_one", "2026-11-03T15:02:00.000Z", both)],
    );
    assert.equal(pairs.length, 1);
  });

  it("notices a key that works but can't see any notes", async () => {
    const vault = createMemoryGranolaVault();
    const empty = (async () =>
      new Response(JSON.stringify({ notes: [] }))) as unknown as typeof fetch;
    const some = (async () =>
      new Response(JSON.stringify({ notes: [{ id: "not_x" }] }))) as unknown as typeof fetch;
    assert.equal((await connectGranolaKey(KEY, { vault, fetchImpl: empty })).sees_notes, false);
    assert.equal((await connectGranolaKey(KEY, { vault, fetchImpl: some })).sees_notes, true);
  });
});

describe("reading granola's notes", () => {
  const listing = (id: string) => ({ id, title: null, created_at: "2026-11-03T15:03:00.000Z" });
  const window = { after: "2026-11-03T14:45:00.000Z", before: "2026-11-03T20:00:00.000Z" };
  const noPause = async () => {};

  it("follows every page, skips notes already kept, and reads each with the key", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(String(url));
      assert.equal((init.headers as Record<string, string>)["Authorization"], "Bearer grn_test");
      const at = new URL(String(url));
      if (at.pathname.endsWith("/notes")) {
        const body = at.searchParams.get("cursor")
          ? { notes: [listing("not_two"), listing("not_kept")], hasMore: false, cursor: null }
          : { notes: [listing("not_one")], hasMore: true, cursor: "next" };
        return new Response(JSON.stringify(body));
      }
      return new Response(JSON.stringify({ ...listing(at.pathname.split("/").pop()!) }));
    }) as unknown as typeof fetch;
    const notes = await readGranolaNotes(
      "grn_test",
      { ...window, skip: new Set(["not_kept"]) },
      { fetchImpl, pause: noPause },
    );
    assert.deepEqual(
      notes.map((found) => found.id),
      ["not_one", "not_two"],
    );
    assert.ok(seen[0]?.includes("created_after=2026-11-03T14%3A45%3A00.000Z"));
    assert.ok(seen[0]?.includes("page_size=30"));
    assert.ok(seen[1]?.includes("cursor=next"));
    assert.ok(!seen.some((url) => url.endsWith("/notes/not_kept")));
  });

  it("treats a note that's still being written as not there yet", async () => {
    const fetchImpl = (async (url: string) =>
      new URL(String(url)).pathname.endsWith("/notes")
        ? new Response(JSON.stringify({ notes: [listing("not_one")], hasMore: false }))
        : new Response("", { status: 404 })) as unknown as typeof fetch;
    assert.deepEqual(await readGranolaNotes("grn_test", window, { fetchImpl, pause: noPause }), []);
  });

  it("lets a refused key show up as a failure, not as no summary", async () => {
    const fetchImpl = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await assert.rejects(readGranolaNotes("grn_test", window, { fetchImpl, pause: noPause }));
  });

  it("looks from just before the first call to now, or twelve hours after the last", () => {
    const now = new Date("2026-11-03T18:00:00.000Z");
    assert.deepEqual(noteWindow("2026-11-03T09:00:00.000Z", "2026-11-03T16:00:00.000Z", now), {
      after: "2026-11-03T08:45:00.000Z",
      before: "2026-11-03T18:00:00.000Z",
    });
  });
});
