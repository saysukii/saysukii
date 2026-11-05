import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StudioMeeting } from "./google.server";
import type { GranolaNote } from "./granola.server";
import { syncMeetingSummaries, type MeetingSyncDeps } from "./meeting-sync.server";

const now = new Date("2026-11-05T20:00:00.000Z");
const call = (id: string, startsAt: string, guests: string[] = []): StudioMeeting => ({
  id,
  eventIds: [id],
  name: `let's talk · ${id}`,
  startsAt,
  guests,
});
const note = (
  id: string,
  eventId: string,
  createdAt = "2026-11-05T17:02:00.000Z",
): GranolaNote => ({
  id,
  title: "untitled",
  created_at: createdAt,
  summary_text: `summary of ${id}`,
  calendar_event: { calendar_event_id: eventId },
});

function fakes(over: Partial<MeetingSyncDeps> = {}) {
  const kept: Array<{ event: string; note: string }> = [];
  const asked: Array<{ after: string; before: string; skip?: ReadonlySet<string> }> = [];
  const deps: MeetingSyncDeps = {
    readKey: async () => "grn_test",
    readMeetings: async () => [
      call("evt_done", "2026-11-05T15:00:00.000Z"),
      call("evt_new", "2026-11-05T17:00:00.000Z"),
      call("evt_later", "2026-11-05T19:00:00.000Z"),
    ],
    readKept: async () => ({ noteIds: new Set(["not_done"]), eventIds: new Set(["evt_done"]) }),
    keep: async (meeting, found) => {
      kept.push({ event: meeting.id, note: found.id });
    },
    readNotes: async (_key, window) => {
      asked.push(window);
      return [note("not_new", "evt_new")];
    },
    ...over,
  };
  return { deps, kept, asked };
}

describe("syncing meeting summaries", () => {
  it("keeps the summary of each call that has one, against its calendar event", async () => {
    const { deps, kept, asked } = fakes();
    const result = await syncMeetingSummaries(deps, { now });
    assert.deepEqual(result, { status: "ok", waiting: 2, kept: 1 });
    assert.deepEqual(kept, [{ event: "evt_new", note: "not_new" }]);
    // notes already kept aren't read again
    assert.ok(asked[0]?.skip?.has("not_done"));
    assert.equal(asked[0]?.after, "2026-11-05T16:45:00.000Z");
  });

  it("leaves granola alone when every call already has its summary", async () => {
    const { deps, asked } = fakes({
      readKept: async () => ({
        noteIds: new Set(),
        eventIds: new Set(["evt_done", "evt_new", "evt_later"]),
      }),
    });
    assert.deepEqual(await syncMeetingSummaries(deps, { now }), {
      status: "ok",
      waiting: 0,
      kept: 0,
    });
    assert.equal(asked.length, 0);
  });

  it("can look for just one meeting, from further back", async () => {
    let from = new Date();
    const { deps, kept } = fakes({
      readMeetings: async (start) => {
        from = start;
        return [
          call("evt_old", "2026-10-20T15:00:00.000Z"),
          call("evt_new", "2026-11-05T17:00:00.000Z"),
        ];
      },
      readNotes: async () => [
        note("not_old", "evt_old", "2026-10-20T15:03:00.000Z"),
        note("not_new", "evt_new"),
      ],
    });
    await syncMeetingSummaries(deps, { now, only: "evt_old" });
    assert.ok(from < new Date("2026-10-01T00:00:00.000Z"));
    assert.deepEqual(
      kept.map((row) => row.event),
      ["evt_old"],
    );
  });

  it("says why when there's no key or no calendar", async () => {
    assert.deepEqual(await syncMeetingSummaries(fakes({ readKey: async () => null }).deps), {
      status: "no_key",
    });
    assert.deepEqual(
      await syncMeetingSummaries(fakes({ readMeetings: async () => null }).deps, { now }),
      { status: "no_calendar" },
    );
  });
});
