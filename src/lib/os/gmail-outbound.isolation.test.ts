import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRfc822,
  encodeGmailRaw,
  fetchGmailReplyHeaders,
  replySubject,
  resolveReplyContext,
  sendInquiryEmail,
  sendResultContainsSecrets,
} from "./gmail-outbound.server";

const TOKEN = "ya29.secret-token-never-leak";

describe("Gmail outbound composer", () => {
  it("threads a reply onto the inquiry gmail_thread_id and never exposes the token", async () => {
    const seen: {
      captured: { url: string; body: Record<string, unknown>; auth: string | null } | null;
    } = { captured: null };
    const rfc = buildRfc822({
      from: "info@saysukii.com",
      fromName: "Say Sukii",
      to: "elena@example.com",
      toName: "Elena Ruiz",
      subject: "Re: wedding flowers at PAMM",
      body: "Elena — I have the date. I'll send a first look this week.",
      inReplyTo: "mid-original@mail.gmail.com",
      date: new Date("2026-09-15T03:00:00.000Z"),
    });
    assert.match(rfc, /To: "Elena Ruiz" <elena@example.com>/);
    assert.equal(/Cc:/i.test(rfc), false);
    assert.match(rfc, /From: "Say Sukii" <info@saysukii.com>/);
    assert.match(rfc, /Subject: Re: wedding flowers at PAMM/);
    assert.match(rfc, /In-Reply-To: <mid-original@mail.gmail.com>/);
    assert.match(rfc, /References: <mid-original@mail.gmail.com>/);
    assert.match(rfc, /multipart\/alternative/);
    const html = Buffer.from(
      rfc
        .split("Content-Type: text/html; charset=UTF-8")[1]
        ?.split("--saysukii-letter--")[0]
        ?.replace(/Content-Transfer-Encoding: base64/g, "")
        .replace(/\s+/g, "") ?? "",
      "base64",
    ).toString("utf8");
    assert.match(html, /Elena — I have the date/);
    assert.equal(rfc.includes(TOKEN), false);
    assert.equal(encodeGmailRaw(rfc).includes("+"), false);

    const sent = await sendInquiryEmail({
      from: "info@saysukii.com",
      to: "elena@example.com",
      subject: "Re: wedding flowers at PAMM",
      body: "on the thread",
      threadId: "thread-pamm",
      inReplyTo: "mid-original@mail.gmail.com",
      accessToken: TOKEN,
      fetchImpl: async (url, init) => {
        seen.captured = {
          url: String(url),
          body: JSON.parse(String(init?.body)),
          auth: new Headers(init?.headers).get("Authorization"),
        };
        return new Response(JSON.stringify({ id: "msg-out-1", threadId: "thread-pamm" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const captured = seen.captured;
    assert.equal(captured?.url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(captured?.body["threadId"], "thread-pamm");
    assert.equal(typeof captured?.body["raw"], "string");
    assert.equal(JSON.stringify(captured?.body).includes(TOKEN), false);
    assert.equal(sent.gmail_message_id, "msg-out-1");
    assert.equal(sent.gmail_thread_id, "thread-pamm");
    assert.equal(sendResultContainsSecrets(sent, TOKEN), false);
  });

  it("attaches files as real parts and sends them through gmail's upload endpoint on the thread", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 ceremony layout");
    const rfc = buildRfc822({
      from: "info@saysukii.com",
      to: "camila@example.com",
      subject: "Re: flowers",
      body: "the layout is attached.",
      attachments: [{ name: "ceremony layout é.pdf", type: "application/pdf", data: pdf }],
    });
    assert.match(rfc, /Content-Type: multipart\/mixed; boundary="saysukii-mail"/);
    assert.match(rfc, /Content-Type: multipart\/alternative; boundary="saysukii-letter"/);
    assert.match(
      rfc,
      /Content-Disposition: attachment; filename="ceremony layout _.pdf"; filename\*=UTF-8''ceremony%20layout%20%C3%A9\.pdf/,
    );
    assert.match(
      rfc,
      new RegExp(Buffer.from(pdf).toString("base64").slice(0, 20).replace(/[+/]/g, "\\$&")),
    );
    assert.match(rfc, /--saysukii-mail--/);

    let captured = { url: "", type: "", body: "" };
    await sendInquiryEmail({
      from: "info@saysukii.com",
      to: "camila@example.com",
      subject: "Re: flowers",
      body: "the layout is attached.",
      threadId: "thread-camila",
      attachments: [{ name: "layout.pdf", type: "application/pdf", data: pdf }],
      accessToken: TOKEN,
      fetchImpl: async (url, init) => {
        captured = {
          url: String(url),
          type: new Headers(init?.headers).get("content-type") ?? "",
          body: String(init?.body),
        };
        return new Response(JSON.stringify({ id: "msg-out-2", threadId: "thread-camila" }), {
          status: 200,
        });
      },
    });
    assert.equal(
      captured.url,
      "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart",
    );
    assert.match(captured.type, /multipart\/related/);
    assert.match(captured.body, /\{"threadId":"thread-camila"\}/);
    assert.match(captured.body, /Content-Type: message\/rfc822/);
    assert.match(captured.body, /filename="layout.pdf"/);
    assert.equal(captured.body.includes(TOKEN), false);
  });

  it("turns a calendar link into a real link in the html part", () => {
    const rfc = buildRfc822({
      from: "info@saysukii.com",
      to: "camila@example.com",
      subject: "Let's Connect!",
      body: "using my [calendar link](https://inside.saysukii.com/schedule)",
    });
    const html = Buffer.from(
      rfc
        .split("Content-Type: text/html; charset=UTF-8")[1]
        ?.split("--saysukii-letter--")[0]
        ?.replace(/Content-Transfer-Encoding: base64/g, "")
        .replace(/\s+/g, "") ?? "",
      "base64",
    ).toString("utf8");
    assert.match(html, /<a href="https:\/\/inside\.saysukii\.com\/schedule"/);
    assert.match(html, /color:#ff4d94/);
    assert.match(html, />calendar link</);
  });

  it("puts extra recipients on To and copies on Cc", () => {
    const rfc = buildRfc822({
      from: "info@saysukii.com",
      fromName: "Say Sukii",
      to: "elena@example.com",
      toName: "Elena Ruiz",
      tos: ["elena@example.com", "planner@studio.com"],
      cc: ["mom@example.com", "dad@example.com"],
      subject: "your invoice",
      body: "the invoice is ready.",
      date: new Date("2026-09-15T03:00:00.000Z"),
    });
    assert.match(rfc, /To: "Elena Ruiz" <elena@example.com>, planner@studio.com/);
    assert.match(rfc, /Cc: mom@example.com, dad@example.com/);
  });

  it("sends a proposal link as a pink button and other links as pink text", () => {
    const rfc = buildRfc822({
      from: "info@saysukii.com",
      to: "camila@example.com",
      subject: "your proposal",
      body: "ready.\n\n[your proposal](https://inside.saysukii.com/proposal/abc)\n\n[saysukii.com](https://www.saysukii.com)",
    });
    const html = Buffer.from(
      rfc
        .split("Content-Type: text/html; charset=UTF-8")[1]
        ?.split("--saysukii-letter--")[0]
        ?.replace(/Content-Transfer-Encoding: base64/g, "")
        .replace(/\s+/g, "") ?? "",
      "base64",
    ).toString("utf8");
    assert.match(html, /background:#ff4d94/);
    assert.match(html, />your proposal</);
    assert.match(html, /color:#ff4d94;text-decoration:underline/);
  });

  it("starts a new Gmail thread when the inquiry has no gmail_thread_id", async () => {
    const context = resolveReplyContext([
      {
        gmail_thread_id: null,
        gmail_message_id: null,
        subject: "new inquiry",
        sent_at: "2026-09-01T00:00:00.000Z",
        channel: "form",
      },
    ]);
    assert.equal(context.threadId, null);
    assert.equal(replySubject(context.subject), "Re: new inquiry");

    let body: Record<string, unknown> = {};
    await sendInquiryEmail({
      from: "info@saysukii.com",
      to: "maya@example.com",
      subject: "from say sukii",
      body: "thank you for writing.",
      accessToken: TOKEN,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: "msg-new", threadId: "thread-new" }), {
          status: 200,
        });
      },
    });
    assert.equal("threadId" in body, false);
  });

  it("resolves the latest inquiry thread and prefixes Re: once", () => {
    const context = resolveReplyContext([
      {
        gmail_thread_id: "thread-a",
        gmail_message_id: "gmail-in",
        subject: "wedding flowers at PAMM",
        sent_at: "2026-09-14T18:00:00.000Z",
        channel: "email",
      },
      {
        gmail_thread_id: null,
        gmail_message_id: null,
        subject: null,
        sent_at: "2026-09-14T19:00:00.000Z",
        channel: "note",
      },
    ]);
    assert.equal(context.threadId, "thread-a");
    assert.equal(context.replyToMessageId, "gmail-in");
    assert.equal(replySubject(context.subject), "Re: wedding flowers at PAMM");
    assert.equal(replySubject("Re: wedding flowers at PAMM"), "Re: wedding flowers at PAMM");
    assert.equal(replySubject(null), "from say sukii");
  });

  it("reads Message-ID for In-Reply-To without returning the access token", async () => {
    const headers = await fetchGmailReplyHeaders("gmail-in", TOKEN, async (url, init) => {
      assert.match(String(url), /gmail-in/);
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${TOKEN}`);
      return new Response(
        JSON.stringify({
          payload: {
            headers: [
              { name: "Message-ID", value: "<mid-original@mail.gmail.com>" },
              { name: "Subject", value: "wedding flowers at PAMM" },
            ],
          },
        }),
        { status: 200 },
      );
    });
    assert.equal(headers.messageId, "<mid-original@mail.gmail.com>");
    assert.equal(JSON.stringify(headers).includes(TOKEN), false);
  });
});
