import assert from "node:assert/strict";
import test from "node:test";

import { safeDownloadName } from "./app-file-link.ts";
import {
  inLoveNoteView,
  loveNoteDate,
  loveNoteFileName,
  loveNoteNotice,
  type LoveNote,
} from "./love-note-view.ts";

const typed: LoveNote = {
  id: "1",
  note: "thank you",
  name: "Maya Lee",
  createdAt: "2026-11-03T15:00:00.000Z",
  audioUrl: null,
  downloadUrl: null,
  downloadName: null,
  hasRecording: false,
  okToUse: false,
  okForMarketing: false,
  consentWording: null,
  marketingWording: null,
};
const voice = { ...typed, id: "2", hasRecording: true, okToUse: true, audioUrl: "/file/x" };
const cleared = { ...voice, id: "3", okForMarketing: true };

test("every note is in all", () => {
  for (const note of [typed, voice, cleared]) assert.ok(inLoveNoteView(note, "all"));
});

test("voice notes are the ones with a recording", () => {
  assert.equal(inLoveNoteView(typed, "voice"), false);
  assert.equal(inLoveNoteView(voice, "voice"), true);
});

test("only a recording that said yes is ok for marketing", () => {
  assert.equal(inLoveNoteView(typed, "marketing"), false);
  assert.equal(inLoveNoteView(voice, "marketing"), false);
  assert.equal(inLoveNoteView(cleared, "marketing"), true);
  // a typed note can't count, even if the flag were somehow set
  assert.equal(inLoveNoteView({ ...typed, okForMarketing: true }, "marketing"), false);
});

test("the bell names who wrote, and rings once per note", () => {
  const notice = loveNoteNotice({ id: "abc", name: "Maya Lee", hasRecording: false });
  assert.equal(notice.id, "love-note-abc");
  assert.equal(notice.title, "Maya Lee left a love note");
  assert.equal(notice.href, "/love-notes");
  assert.equal(
    loveNoteNotice({ id: "abc", name: "Maya", hasRecording: true }).body,
    "with a voice note.",
  );
});

test("a saved recording is named for who it's from and when", () => {
  const when = "2026-11-03T15:00:00.000Z";
  assert.equal(
    loveNoteFileName("Maya Lee", when, "abc/voice.m4a"),
    "love-note-maya-lee-2026-11-03.m4a",
  );
  assert.equal(
    loveNoteFileName("José & Ana!", when, "abc/video.webm"),
    "love-note-jos-ana-2026-11-03.webm",
  );
});

test("a download name can't carry anything a browser would act on", () => {
  assert.equal(safeDownloadName('a"; filename=evil.exe\r\nX: y'), "a-filename-evil.exe-x-y");
  assert.equal(safeDownloadName("../../etc/passwd"), "etc-passwd");
  assert.equal(safeDownloadName(""), "");
});

test("a date reads the studio's way", () => {
  assert.match(loveNoteDate("2026-11-03T15:00:00.000Z"), /^nov \d, 2026$/);
  assert.equal(loveNoteDate("not a date"), "");
});
