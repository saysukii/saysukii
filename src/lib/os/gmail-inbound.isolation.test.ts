import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMemoryInboundStore,
  htmlToText,
  parseGmailMessage,
  syncInboundMail,
  type GmailApiMessage,
  type InboundMailbox,
} from "./gmail-inbound.server";

function message(id: string, overrides?: Partial<{ from: string; subject: string; body: string; html: string; date: number }>): GmailApiMessage {
  const parts = [];
  if (overrides?.body) {
    parts.push({
      mimeType: "text/plain",
      body: { data: Buffer.from(overrides.body).toString("base64url") },
    });
  }
  if (overrides?.html) {
    parts.push({
      mimeType: "text/html",
      body: { data: Buffer.from(overrides.html).toString("base64url") },
    });
  }
  return {
    id,
    threadId: `thread-${id}`,
    internalDate: String(overrides?.date ?? 1_726_300_000_000),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: overrides?.from ?? "Ada <ada@example.com>" },
        { name: "To", value: "Say Sukii <info@saysukii.com>" },
        { name: "Subject", value: overrides?.subject ?? `hello ${id}` },
      ],
      parts,
    },
  };
}

function fakeMailbox(seed: GmailApiMessage[], options?: { historyExpired?: boolean }): InboundMailbox & { seed: GmailApiMessage[] } {
  const box = {
    seed,
    async profileHistoryId() {
      return `hist-${box.seed.length}`;
    },
    async listHistory(_historyId: string, _pageToken?: string) {
      if (options?.historyExpired) {
        return { ids: [], historyId: null, nextPageToken: null, expired: true };
      }
      return {
        ids: box.seed.map((item) => item.id ?? ""),
        historyId: `hist-${box.seed.length}`,
        nextPageToken: null,
        expired: false,
      };
    },
    async listInbox(_query: string, _pageToken?: string) {
      return {
        ids: box.seed.map((item) => item.id ?? ""),
        nextPageToken: null,
      };
    },
    async getMessage(id: string) {
      const found = box.seed.find((item) => item.id === id);
      if (!found) throw new Error(`missing ${id}`);
      return found;
    },
  };
  return box;
}

describe("Gmail inbound capture", () => {
  it("prefers plain text and strips html", () => {
    const parsed = parseGmailMessage(
      message("m1", {
        body: "plain body",
        html: "<p>html <b>body</b></p>",
        from: "Jordan <jordan@studio.com>",
      }),
    );
    assert.equal(parsed?.from_addr, "jordan@studio.com");
    assert.equal(parsed?.to_addr, "info@saysukii.com");
    assert.equal(parsed?.body, "plain body");
    assert.equal(htmlToText("<p>Need peonies &amp; ranunculus</p>"), "Need peonies & ranunculus");
  });

  it("captures new inbox mail and de-duplicates by gmail_message_id", async () => {
    const store = createMemoryInboundStore();
    const mailbox = fakeMailbox([
      message("a", { subject: "wedding inquiry" }),
      message("b", { subject: "rehearsal" }),
      message("a", { subject: "duplicate id in list" }),
    ]);

    const first = await syncInboundMail({ mailbox, store, now: () => new Date("2026-09-14T16:00:00.000Z") });
    assert.equal(first.inserted, 2);
    assert.equal(first.scanned, 2);
    assert.equal(first.duplicates, 0);
    assert.equal(first.historyId, "hist-3");

    const second = await syncInboundMail({ mailbox, store, now: () => new Date("2026-09-14T16:05:00.000Z") });
    assert.equal(second.inserted, 0);
    assert.equal(second.duplicates, 2);
    assert.equal(second.scanned, 2);

    mailbox.seed.push(message("c", { subject: "new lead" }));
    const third = await syncInboundMail({ mailbox, store, now: () => new Date("2026-09-14T16:10:00.000Z") });
    assert.equal(third.inserted, 1);
    assert.equal(third.duplicates, 2);
    assert.equal(third.scanned, 3);

    const rows = await store.existingIds(["a", "b", "c", "zzz"]);
    assert.deepEqual([...rows].sort(), ["a", "b", "c"]);
    const captured = await Promise.all(["a", "b", "c"].map((id) => mailbox.getMessage(id)));
    for (const item of captured) {
      const parsed = parseGmailMessage(item);
      assert.equal(parsed?.gmail_message_id, item.id);
    }
  });

  it("falls back to inbox list when history has expired and never routes", async () => {
    const store = createMemoryInboundStore();
    await store.writeCursor({ historyId: "stale", lastSyncedAt: "2026-09-01T00:00:00.000Z" });
    const mailbox = fakeMailbox([message("z", { subject: "after reconnect" })], { historyExpired: true });
    const result = await syncInboundMail({ mailbox, store });
    assert.equal(result.inserted, 1);
    assert.equal(result.scanned, 1);
    const encoded = JSON.stringify(result);
    assert.equal(encoded.includes("routing"), false);
    assert.equal(encoded.includes("candidate"), false);
    assert.equal(encoded.includes("access_token"), false);
  });

  it("does not capture mail that left the inbox", async () => {
    const store = createMemoryInboundStore();
    const sent = message("sent-1", { subject: "our reply" });
    sent.labelIds = ["SENT"];
    const mailbox = fakeMailbox([sent, message("in-1", { subject: "new inquiry" })]);
    const result = await syncInboundMail({ mailbox, store });
    assert.equal(result.inserted, 1);
    const kept = await store.existingIds(["sent-1", "in-1"]);
    assert.deepEqual([...kept], ["in-1"]);
  });
});
