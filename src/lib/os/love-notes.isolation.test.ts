/* eslint-disable @typescript-eslint/no-explicit-any -- a small stand-in for the database */
import assert from "node:assert/strict";
import test from "node:test";

import {
  VIDEO_CONSENT_WORDING,
  VIDEO_MARKETING_WORDING,
  VOICE_CONSENT_WORDING,
  VOICE_MARKETING_WORDING,
} from "../love-note-input.ts";
import {
  createLoveNote,
  finishLoveNote,
  hashSender,
  readLoveNoteBody,
} from "./love-notes.server.ts";

const name = "Maya Lee";

/** Just enough of the database and storage to see what the routes do, with nothing real behind it. */
function fakeClient(
  options: { recent?: number; arrived?: boolean; row?: unknown; insertFails?: boolean } = {},
) {
  const calls = {
    uploads: [] as string[],
    removed: [] as string[][],
    inserts: [] as any[],
    updates: [] as any[],
    signed: [] as string[],
  };
  const client = {
    from() {
      return {
        select() {
          const q: any = {
            gte: () => q,
            eq: () => q,
            maybeSingle: async () => ({ data: options.row ?? null, error: null }),
            then: (done: any) => done({ count: options.recent ?? 0, error: null }),
          };
          return q;
        },
        insert: async (row: any) => {
          calls.inserts.push(row);
          return { error: options.insertFails ? new Error("no") : null };
        },
        update: (row: any) => ({
          eq: async () => {
            calls.updates.push(row);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          calls.uploads.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          calls.removed.push(paths);
          return { error: null };
        },
        createSignedUploadUrl: async (path: string) => {
          calls.signed.push(path);
          return { data: { signedUrl: `https://storage.test/${path}?token=x` }, error: null };
        },
        list: async (_folder: string, query?: { search?: string }) => ({
          data: options.arrived ? [{ name: query?.search ?? "voice.webm" }] : [],
          error: null,
        }),
      }),
    },
  };
  return { client: client as any, calls };
}

test("a named note is saved as received, with no upload link or consent", async () => {
  const { client, calls } = fakeClient();
  const result = await createLoveNote(client, { text: "Thank You", name }, "sender");
  assert.equal(result.status, 200);
  assert.equal(calls.inserts[0].note, "thank you");
  assert.equal(calls.inserts[0].from_name, "Maya Lee");
  assert.equal(calls.inserts[0].status, "received");
  assert.equal(calls.inserts[0].sender_hash, "sender");
  assert.equal(calls.inserts[0].consent_given_at, null);
  assert.equal("uploadUrl" in result.body, false);
  assert.equal(calls.signed.length, 0);
});

test("text and voice notes never name the video column, so they save before the video migration", async () => {
  const { client, calls } = fakeClient();
  await createLoveNote(client, { text: "thank you", name }, "s");
  await createLoveNote(client, { name, consent: true, audioType: "audio/mp4", audioBytes: 900 }, "s");
  assert.equal("video_path" in calls.inserts[0], false);
  assert.equal("video_path" in calls.inserts[1], false);
});

test("a voice note waits as uploading, with its consent on record and a link only for its own file", async () => {
  const { client, calls } = fakeClient();
  const result = await createLoveNote(
    client,
    { name, consent: true, audioType: "audio/webm;codecs=opus", audioBytes: 900 },
    "s",
  );
  assert.equal(result.status, 200);
  assert.equal(calls.inserts[0].status, "uploading");
  assert.equal(calls.inserts[0].consent_wording, VOICE_CONSENT_WORDING);
  assert.ok(calls.inserts[0].consent_given_at);
  assert.match(calls.signed[0]!, /\/voice\.webm$/);
  assert.equal(calls.signed[0], calls.inserts[0].audio_path);
  assert.ok(result.body.ok && result.body.uploadUrl?.includes("voice.webm"));
});

test("a video note waits as uploading, with the video wording on record and its own file", async () => {
  const { client, calls } = fakeClient();
  const result = await createLoveNote(
    client,
    { name, consent: true, consentMarketing: true, videoType: "video/mp4", videoBytes: 4_000_000 },
    "s",
  );
  assert.equal(result.status, 200);
  assert.equal(calls.inserts[0].status, "uploading");
  assert.equal(calls.inserts[0].audio_path, null);
  assert.equal(calls.inserts[0].consent_wording, VIDEO_CONSENT_WORDING);
  assert.equal(calls.inserts[0].marketing_consent_wording, VIDEO_MARKETING_WORDING);
  assert.match(calls.signed[0]!, /\/video\.mp4$/);
  assert.equal(calls.signed[0], calls.inserts[0].video_path);
});

test("a yes to marketing is saved on its own, and a no leaves it empty", async () => {
  const note = { name, consent: true, audioType: "audio/webm", audioBytes: 900 };
  const yes = fakeClient();
  await createLoveNote(yes.client, { ...note, consentMarketing: true }, "s");
  assert.equal(yes.calls.inserts[0].marketing_consent_wording, VOICE_MARKETING_WORDING);
  assert.ok(yes.calls.inserts[0].marketing_consent_given_at);
  const no = fakeClient();
  await createLoveNote(no.client, note, "s");
  assert.ok(no.calls.inserts[0].consent_given_at);
  assert.equal(no.calls.inserts[0].marketing_consent_given_at, null);
  assert.equal(no.calls.inserts[0].marketing_consent_wording, null);
});

test("a voice note without consent saves nothing", async () => {
  const { client, calls } = fakeClient();
  const result = await createLoveNote(
    client,
    { name, audioType: "audio/webm", audioBytes: 900 },
    "s",
  );
  assert.equal(result.status, 400);
  assert.equal(calls.inserts.length + calls.signed.length, 0);
});

test("a note without a name saves nothing", async () => {
  const { client, calls } = fakeClient();
  const result = await createLoveNote(client, { text: "hello" }, "s");
  assert.equal(result.status, 400);
  assert.equal(calls.inserts.length, 0);
});

test("a bot is told it worked, and nothing is saved", async () => {
  const { client, calls } = fakeClient();
  const result = await createLoveNote(client, { text: "spam", name, website: "spam.test" }, "s");
  assert.deepEqual(result, { status: 200, body: { ok: true, id: null } });
  assert.equal(calls.inserts.length, 0);
});

test("too many notes are turned away before anything is saved", async () => {
  const { client, calls } = fakeClient({ recent: 10 });
  const result = await createLoveNote(client, { text: "hi", name }, "s");
  assert.equal(result.status, 429);
  assert.equal(calls.inserts.length, 0);
});

test("a database failure is reported, not hidden", async () => {
  const { client } = fakeClient({ insertFails: true });
  await assert.rejects(createLoveNote(client, { text: "hi", name }, "s"));
});

const id = "3f2b1c9e-7a44-4d21-9b1a-0c5e8f6a1d22";

test("finishing needs the recording to really be there", async () => {
  const row = { status: "uploading", audio_path: `${id}/voice.webm` };
  const missing = fakeClient({ row });
  assert.equal((await finishLoveNote(missing.client, { id })).status, 409);
  assert.equal(missing.calls.updates.length, 0);

  const arrived = fakeClient({ row, arrived: true });
  assert.equal((await finishLoveNote(arrived.client, { id })).status, 200);
  assert.deepEqual(arrived.calls.updates, [{ status: "received" }]);
});

test("finishing a video note needs the video to really be there", async () => {
  const row = { status: "uploading", audio_path: null, video_path: `${id}/video.mp4` };
  const missing = fakeClient({ row });
  assert.equal((await finishLoveNote(missing.client, { id })).status, 409);
  const arrived = fakeClient({ row, arrived: true });
  assert.equal((await finishLoveNote(arrived.client, { id })).status, 200);
  assert.deepEqual(arrived.calls.updates, [{ status: "received" }]);
});

test("finishing is safe to repeat, and refuses anything else", async () => {
  const done = fakeClient({ row: { status: "received", audio_path: `${id}/voice.webm` } });
  assert.equal((await finishLoveNote(done.client, { id })).status, 200);
  assert.equal(done.calls.updates.length, 0);
  assert.equal((await finishLoveNote(fakeClient().client, { id })).status, 404);
  assert.equal((await finishLoveNote(fakeClient().client, { id: "../other" })).status, 400);
});

test("the sender's address is never stored as it is", () => {
  const hash = hashSender("203.0.113.9", "secret");
  assert.ok(hash && !hash.includes("203.0.113.9"));
  assert.notEqual(hash, hashSender("203.0.113.9", "other"));
  assert.equal(hashSender("", "secret"), null);
});

test("only a small json body gets through", async () => {
  const post = (body: string, type = "application/json") =>
    readLoveNoteBody(
      new Request("https://x.test", { method: "POST", headers: { "content-type": type }, body }),
    );
  assert.deepEqual(await post('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.equal((await post('{"a":1}', "text/plain")).ok, false);
  assert.equal((await post("not json")).ok, false);
  assert.equal((await post(JSON.stringify({ a: "x".repeat(20_001) }))).ok, false);
});
