import assert from "node:assert/strict";
import test from "node:test";

import {
  afterCheck,
  checkAgain,
  foundSummary,
  shouldLookOnOpen,
  startWaiting,
  SUMMARY_GIVE_UP_MS,
  summaryStatus,
} from "./meeting-summary.ts";

const meeting = {
  name: "Camila Reyes",
  email: "camila@test.dev",
  startsAt: "2026-11-03T15:00:00Z",
};
const start = Date.parse("2026-11-03T15:00:00Z");

test("opening granola starts waiting for the summary, with nothing to stop", () => {
  const waiting = startWaiting(meeting, start);
  assert.equal(summaryStatus(waiting), "creating");
  assert.equal(waiting.name, "Camila Reyes");
  assert.equal(waiting.startedAt, new Date(start).toISOString());
});

test("a summary from granola makes it ready", () => {
  const next = afterCheck(startWaiting(meeting, start), "a lovely call.", start + 60_000);
  assert.equal(summaryStatus(next), "ready");
  assert.equal(next.summary, "a lovely call.");
});

test("it waits through a long call, then says so, and can look again", () => {
  const waiting = startWaiting(meeting, start);
  const threeHours = start + 3 * 60 * 60 * 1000;
  assert.equal(summaryStatus(afterCheck(waiting, null, threeHours)), "creating");
  const gaveUp = afterCheck(waiting, null, start + SUMMARY_GIVE_UP_MS);
  assert.equal(summaryStatus(gaveUp), "not_found");
  const later = start + SUMMARY_GIVE_UP_MS + 1000;
  const again = checkAgain(gaveUp, later);
  assert.equal(summaryStatus(again), "creating");
  assert.equal(summaryStatus(afterCheck(again, null, later + 1000)), "creating");
});

test("a call recorded straight in granola can still arrive", () => {
  const found = foundSummary(meeting, "from granola");
  assert.equal(summaryStatus(found), "ready");
  assert.equal(found.summary, "from granola");
});

test("it only looks on opening for a meeting that has begun and has no summary yet", () => {
  assert.equal(shouldLookOnOpen(undefined, meeting, start + 1000), true);
  assert.equal(shouldLookOnOpen(undefined, meeting, start - 1000), false);
  assert.equal(shouldLookOnOpen(undefined, { ...meeting, allDay: true }, start + 1000), false);
  assert.equal(shouldLookOnOpen(startWaiting(meeting, start), meeting, start + 1000), false);
  assert.equal(shouldLookOnOpen(foundSummary(meeting, "x"), meeting, start + 1000), false);
});

test("meetings saved before this change still read correctly", () => {
  assert.equal(summaryStatus(undefined), "none");
  assert.equal(summaryStatus({ done: false, summary: "" }), "none");
  // one left mid-recording by the old live button goes back to the start
  assert.equal(summaryStatus({ done: false, summary: "", recording: true } as never), "none");
  assert.equal(summaryStatus({ done: true, summary: "" }), "not_found");
  assert.equal(summaryStatus({ done: true, summary: "old notes" }), "ready");
});
