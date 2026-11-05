import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_AUDIO_BYTES,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_VIDEO_BYTES,
  parseLoveNote,
  VIDEO_CONSENT_WORDING,
  VIDEO_MARKETING_WORDING,
  VOICE_CONSENT_WORDING,
  VOICE_MARKETING_WORDING,
} from "./love-note-input.ts";

const name = "Maya Lee";
const voice = { name, consent: true, audioType: "audio/webm;codecs=opus", audioBytes: 2000 };
const video = { name, consent: true, videoType: "video/mp4;codecs=avc1,mp4a", videoBytes: 900_000 };

test("a named note comes through in lowercase, with its spaces trimmed", () => {
  const parsed = parseLoveNote({ text: "  Thank YOU ", name: "  Maya Lee " });
  assert.equal(parsed.kind, "ok");
  if (parsed.kind === "ok") {
    assert.equal(parsed.input.note, "thank you");
    assert.equal(parsed.input.name, "Maya Lee");
    assert.equal(parsed.input.audio, null);
  }
});

test("a note without a name is refused", () => {
  assert.deepEqual(parseLoveNote({ text: "hello" }), {
    kind: "invalid",
    error: "a name is needed",
  });
  assert.equal(parseLoveNote({ text: "hello", name: "   " }).kind, "invalid");
  assert.equal(
    parseLoveNote({ text: "hello", name: "x".repeat(MAX_NAME_LENGTH + 1) }).kind,
    "invalid",
  );
  assert.equal(parseLoveNote({ text: "hello", name: "x".repeat(MAX_NAME_LENGTH) }).kind, "ok");
});

test("a note needs words or a recording", () => {
  assert.equal(parseLoveNote({ text: "   ", name }).kind, "invalid");
});

test("a typed note doesn't need consent", () => {
  assert.equal(parseLoveNote({ text: "hi", name }).kind, "ok");
});

test("a recording is refused without consent", () => {
  assert.deepEqual(parseLoveNote({ ...voice, consent: false }), {
    kind: "invalid",
    error: "consent is needed for a voice note",
  });
  assert.equal(parseLoveNote({ ...voice, consent: undefined }).kind, "invalid");
  assert.equal(parseLoveNote({ ...voice, consent: "yes" }).kind, "invalid");
});

test("marketing is optional, and only ever applies to a recording", () => {
  const without = parseLoveNote(voice);
  assert.equal(without.kind === "ok" && without.input.marketing, false);
  const yes = parseLoveNote({ ...voice, consentMarketing: true });
  assert.equal(yes.kind === "ok" && yes.input.marketing, true);
  const typed = parseLoveNote({ text: "hi", name, consentMarketing: true });
  assert.equal(typed.kind === "ok" && typed.input.marketing, false);
  assert.equal(parseLoveNote({ ...voice, consent: false, consentMarketing: true }).kind, "invalid");
});

test("a recording alone is enough, and its codec is set aside", () => {
  const parsed = parseLoveNote(voice);
  assert.equal(parsed.kind, "ok");
  if (parsed.kind === "ok") {
    assert.deepEqual(parsed.input.audio, { contentType: "audio/webm", extension: "webm" });
  }
});

test("an iphone's recording is kept as m4a", () => {
  const parsed = parseLoveNote({ ...voice, audioType: "audio/mp4" });
  assert.equal(parsed.kind === "ok" && parsed.input.audio?.extension, "m4a");
});

test("only audio, at a sensible size, is accepted", () => {
  assert.equal(parseLoveNote({ ...voice, audioType: "text/html" }).kind, "invalid");
  assert.equal(parseLoveNote({ ...voice, audioType: "video/mp4" }).kind, "invalid");
  assert.equal(parseLoveNote({ ...voice, audioBytes: 0 }).kind, "invalid");
  assert.equal(parseLoveNote({ ...voice, audioBytes: MAX_AUDIO_BYTES + 1 }).kind, "invalid");
});

test("the note's length limit holds", () => {
  assert.equal(parseLoveNote({ text: "x".repeat(MAX_NOTE_LENGTH), name }).kind, "ok");
  assert.equal(parseLoveNote({ text: "x".repeat(MAX_NOTE_LENGTH + 1), name }).kind, "invalid");
});

test("the hidden field catches bots, whatever else they send", () => {
  assert.deepEqual(parseLoveNote({ text: "spam", website: "http://spam" }), { kind: "bot" });
});

test("anything that isn't a note is refused", () => {
  assert.equal(parseLoveNote(null).kind, "invalid");
  assert.equal(parseLoveNote("hello").kind, "invalid");
  assert.equal(parseLoveNote({ text: 5, name }).kind, "invalid");
});

test("a video note comes through, kept as mp4 or webm", () => {
  const parsed = parseLoveNote(video);
  assert.equal(parsed.kind, "ok");
  if (parsed.kind === "ok") {
    assert.deepEqual(parsed.input.video, { contentType: "video/mp4", extension: "mp4" });
    assert.equal(parsed.input.audio, null);
  }
  const webm = parseLoveNote({ ...video, videoType: "video/webm;codecs=vp9,opus" });
  assert.equal(webm.kind === "ok" && webm.input.video?.extension, "webm");
});

test("a video note needs consent, and marketing stays optional", () => {
  assert.deepEqual(parseLoveNote({ ...video, consent: false }), {
    kind: "invalid",
    error: "consent is needed for a video note",
  });
  const yes = parseLoveNote({ ...video, consentMarketing: true });
  assert.equal(yes.kind === "ok" && yes.input.marketing, true);
});

test("only video, at a sensible size, is accepted as a video note", () => {
  assert.equal(parseLoveNote({ ...video, videoType: "audio/mp4" }).kind, "invalid");
  assert.equal(parseLoveNote({ ...video, videoType: "text/html" }).kind, "invalid");
  assert.equal(parseLoveNote({ ...video, videoBytes: 0 }).kind, "invalid");
  assert.equal(parseLoveNote({ ...video, videoBytes: MAX_VIDEO_BYTES + 1 }).kind, "invalid");
});

test("a note carries one recording, not a voice note and a video note", () => {
  assert.equal(parseLoveNote({ ...voice, ...video }).kind, "invalid");
});

test("the card shows exactly the consent wording that gets saved", () => {
  const card = readFileSync(new URL("../../public/love-note.html", import.meta.url), "utf8");
  assert.ok(card.includes(`>${VOICE_CONSENT_WORDING}</span>`));
  assert.ok(card.includes(`>${VOICE_MARKETING_WORDING} (optional)</span>`));
  assert.ok(card.includes(`data-video="${VIDEO_CONSENT_WORDING}"`));
  assert.ok(card.includes(`data-video="${VIDEO_MARKETING_WORDING} (optional)"`));
});
