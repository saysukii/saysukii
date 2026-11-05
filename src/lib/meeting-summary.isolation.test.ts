import assert from "node:assert/strict";
import test from "node:test";

import { SUMMARY_EXPECTED_MS, summaryState } from "./meeting-summary.ts";

const startsAt = "2026-11-05T15:00:00Z";
const start = Date.parse(startsAt);
const state = (over: Partial<Parameters<typeof summaryState>[0]> = {}) =>
  summaryState({ startsAt, summary: null, granolaConnected: true, now: start + 60_000, ...over });

test("a kept summary shows, whenever it is", () => {
  assert.equal(state({ summary: "a lovely call." }), "ready");
  assert.equal(state({ summary: "a lovely call.", granolaConnected: false }), "ready");
});

test("nothing shows before a call, or for an all-day hold", () => {
  assert.equal(state({ now: start - 60_000 }), "none");
  assert.equal(state({ allDay: true }), "none");
});

test("after a call it waits, then says none came", () => {
  assert.equal(state(), "waiting");
  assert.equal(state({ now: start + SUMMARY_EXPECTED_MS - 1 }), "waiting");
  assert.equal(state({ now: start + SUMMARY_EXPECTED_MS }), "missing");
});

test("says to connect granola when it isn't", () => {
  assert.equal(state({ granolaConnected: false }), "unconnected");
  assert.equal(state({ granolaConnected: null }), "none");
});
