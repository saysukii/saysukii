import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decryptSecret } from "./crypto.server";
import {
  connectGranolaKey,
  findMeetingNote,
  pickMeetingNote,
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
  it("rejects a key that is not a granola workspace key", async () => {
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
    name: "Camila Reyes",
    email: "camila@test.dev",
    startsAt: "2026-11-03T15:00:00.000Z",
    startedAt: "2026-11-03T15:02:00.000Z",
  };
  const note = (id: string, createdAt: string, extra = {}) => ({
    id,
    title: "untitled",
    created_at: createdAt,
    summary_text: `summary of ${id}`,
    ...extra,
  });

  it("goes by the guest's email first, even over a closer note", () => {
    const found = pickMeetingNote(
      [
        note("not_close", "2026-11-03T15:02:30.000Z"),
        note("not_guest", "2026-11-03T15:12:00.000Z", {
          attendees: [{ email: "CAMILA@test.dev" }],
        }),
      ],
      meeting,
    );
    assert.equal(found?.id, "not_guest");
  });

  it("can go by the calendar time or the name in the title", () => {
    const later = "2026-11-03T16:30:00.000Z";
    assert.equal(
      pickMeetingNote(
        [
          note("not_cal", later, {
            calendar_event: { scheduled_start_time: "2026-11-03T15:00:00.000Z" },
          }),
        ],
        meeting,
      )?.id,
      "not_cal",
    );
    assert.equal(
      pickMeetingNote([note("not_named", later, { title: "Call with Camila Reyes" })], meeting)?.id,
      "not_named",
    );
  });

  it("recognises the meeting by its shared title, over a note that's merely closer", () => {
    const found = pickMeetingNote(
      [
        note("not_close", "2026-11-03T15:02:10.000Z"),
        note("not_title", "2026-11-03T15:11:00.000Z", { title: "  camila   REYES " }),
      ],
      meeting,
    );
    assert.equal(found?.id, "not_title");
    assert.equal(
      pickMeetingNote(
        [
          note("not_event", "2026-11-03T16:00:00.000Z", {
            calendar_event: { event_title: "Camila Reyes" },
          }),
        ],
        meeting,
      )?.id,
      "not_event",
    );
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

  it("takes a note begun around pressing record, but never just the latest one", () => {
    assert.equal(
      pickMeetingNote([note("not_near", "2026-11-03T15:05:00.000Z")], meeting)?.id,
      "not_near",
    );
    assert.equal(pickMeetingNote([note("not_other", "2026-11-03T18:00:00.000Z")], meeting), null);
  });

  describe("never another client's call", () => {
    const lumen = {
      title: "Lumen Studio",
      owner: { email: "info@saysukii.com" },
      attendees: [{ email: "info@saysukii.com" }, { email: "hello@lumen.dev" }],
    };

    it("leaves a call booked close by when it lists someone else", () => {
      assert.equal(
        pickMeetingNote(
          [
            note("not_lumen", "2026-11-03T15:15:00.000Z", {
              ...lumen,
              calendar_event: {
                event_title: "Lumen Studio",
                invitees: [{ email: "hello@lumen.dev" }],
                scheduled_start_time: "2026-11-03T15:15:00.000Z",
              },
            }),
          ],
          meeting,
        ),
        null,
      );
    });

    it("leaves a note begun close by when it lists someone else", () => {
      assert.equal(
        pickMeetingNote([note("not_lumen", "2026-11-03T15:05:00.000Z", lumen)], meeting),
        null,
      );
    });

    it("doesn't count the note's owner as someone else", () => {
      const alone = {
        owner: { email: "info@saysukii.com" },
        attendees: [{ email: "INFO@saysukii.com" }],
      };
      assert.equal(
        pickMeetingNote([note("not_mine", "2026-11-03T15:05:00.000Z", alone)], meeting)?.id,
        "not_mine",
      );
    });

    it("doesn't guess by time when granola wasn't opened from this meeting", () => {
      const onOpening = { ...meeting, startedAt: meeting.startsAt };
      assert.equal(
        pickMeetingNote([note("not_near", "2026-11-03T15:05:00.000Z")], onOpening),
        null,
      );
    });
  });

  it("skips deleted notes and notes with no summary", () => {
    const at = "2026-11-03T15:03:00.000Z";
    assert.equal(
      pickMeetingNote(
        [note("not_gone", at, { deleted_at: at }), note("not_empty", at, { summary_text: " " })],
        meeting,
      ),
      null,
    );
  });

  it("reads the list, then each note, with the key", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(String(url));
      assert.equal((init.headers as Record<string, string>)["Authorization"], "Bearer grn_test");
      const body = String(url).includes("/notes?")
        ? { notes: [{ id: "not_one", title: null, created_at: "2026-11-03T15:03:00.000Z" }] }
        : note("not_one", "2026-11-03T15:03:00.000Z");
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const found = await findMeetingNote("grn_test", meeting, fetchImpl);
    assert.equal(found?.summary_text, "summary of not_one");
    assert.ok(seen[0]?.includes("created_after=2026-11-03T14%3A47%3A00.000Z"));
    assert.ok(seen[1]?.endsWith("/notes/not_one"));
  });

  it("treats a note that's still being written as not there yet", async () => {
    const fetchImpl = (async (url: string) =>
      String(url).includes("/notes?")
        ? new Response(
            JSON.stringify({
              notes: [{ id: "not_one", title: null, created_at: "2026-11-03T15:03:00.000Z" }],
            }),
          )
        : new Response("", { status: 404 })) as unknown as typeof fetch;
    assert.equal(await findMeetingNote("grn_test", meeting, fetchImpl), null);
  });

  it("lets a refused key show up as a failure, not as no summary", async () => {
    const fetchImpl = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await assert.rejects(findMeetingNote("grn_test", meeting, fetchImpl));
  });
});
