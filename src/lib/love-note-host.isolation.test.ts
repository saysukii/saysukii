import assert from "node:assert/strict";
import test from "node:test";

import { isLoveNoteHost, loveNoteHostAction } from "./love-note-host.ts";

const headers = (values: Record<string, string>) => new Headers(values);

test("the card's address is recognised, however it arrives", () => {
  assert.ok(isLoveNoteHost(headers({ host: "lovenote.saysukii.com" })));
  assert.ok(isLoveNoteHost(headers({ host: "LoveNote.SaySukii.com:443" })));
  assert.ok(
    isLoveNoteHost(headers({ "x-forwarded-host": "lovenote.saysukii.com", host: "x.vercel.app" })),
  );
});

test("the studio's address is left alone", () => {
  assert.equal(isLoveNoteHost(headers({ host: "inside.saysukii.com" })), false);
  assert.equal(isLoveNoteHost(headers({ host: "lovenote.saysukii.com.evil.test" })), false);
  assert.equal(isLoveNoteHost(headers({})), false);
});

test("every page on the card's address is the card", () => {
  assert.equal(loveNoteHostAction("GET", "/"), "card");
  assert.equal(loveNoteHostAction("GET", "/dashboard"), "card");
  assert.equal(loveNoteHostAction("GET", "/love-notes"), "card");
  assert.equal(loveNoteHostAction("HEAD", "/"), "card");
});

test("only sending a note gets through to the app", () => {
  assert.equal(loveNoteHostAction("POST", "/api/love-notes"), "pass");
  assert.equal(loveNoteHostAction("POST", "/api/love-notes/finish"), "pass");
  assert.equal(loveNoteHostAction("POST", "/api/love-notesx"), "refuse");
  assert.equal(loveNoteHostAction("POST", "/_serverFn/anything"), "refuse");
  assert.equal(loveNoteHostAction("POST", "/"), "refuse");
  assert.equal(loveNoteHostAction("GET", "/_serverFn/anything"), "card");
});
