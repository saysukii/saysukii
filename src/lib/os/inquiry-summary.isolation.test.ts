import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InquiryMessageRow } from "@/integrations/supabase/types";
import { generateInquirySummaryText } from "@/lib/os/inquiry-summary.server";
import {
  NEW_LEAD_SUMMARY,
  buildInquirySummaryFacts,
  fallbackInquirySummary,
  formatInquirySummaryUserMessage,
  inquirySummaryFingerprint,
  inquirySummarySystemPrompt,
  isNewUncontactedLead,
  resolveInquirySummaryText,
  sanitizeInquirySummary,
} from "@/lib/os/inquiry-summary";

const NOW = new Date("2026-09-16T16:00:00.000Z");

function inbound(overrides: Partial<InquiryMessageRow> = {}): InquiryMessageRow {
  return {
    id: "msg-in",
    inquiry_id: "inq-1",
    direction: "inbound",
    channel: "form",
    subject: "new inquiry",
    body: "Soft garden romance with orchids.",
    from_address: "maya@example.com",
    to_address: "info@saysukii.com",
    gmail_message_id: null,
    gmail_thread_id: null,
    author: "Maya",
    sent_at: "2026-09-16T12:00:00.000Z",
    status: "received",
    created_by: null,
    created_at: "2026-09-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("inquiry summary", () => {
  it("uses the canned line for a brand-new uncontacted lead", () => {
    const messages = [inbound()];
    assert.equal(
      isNewUncontactedLead({
        status: "new",
        contacted_at: null,
        messages,
        proposalStatus: null,
      }),
      true,
    );
    const facts = buildInquirySummaryFacts({
      status: "new",
      contacted_at: null,
      messages,
      proposals: [],
      now: NOW,
    });
    assert.equal(resolveInquirySummaryText(facts), NEW_LEAD_SUMMARY);
  });

  it("does not treat a replied lead as new", () => {
    const messages = [
      inbound(),
      inbound({
        id: "msg-out",
        direction: "outbound",
        channel: "email",
        body: "thank you for writing",
        sent_at: "2026-09-16T13:00:00.000Z",
      }),
    ];
    assert.equal(
      isNewUncontactedLead({
        status: "new",
        contacted_at: null,
        messages,
        proposalStatus: null,
      }),
      false,
    );
  });

  it("grounds fallback in record data and never invents a proposal or meeting", () => {
    const facts = buildInquirySummaryFacts({
      status: "in_conversation",
      contacted_at: "2026-09-13T12:00:00.000Z",
      messages: [inbound({ sent_at: "2026-09-13T12:00:00.000Z", body: "ceremony arch if the budget can hold it" })],
      proposals: [],
      meetings: [],
      now: NOW,
    });
    const text = fallbackInquirySummary(facts);
    assert.match(text, /in touch/i);
    assert.match(text, /3 days/);
    assert.match(text, /send proposal/);
    assert.equal(facts.lastInboundGist?.includes("ceremony arch"), true);
    assert.equal(/proposal (sent|draft|viewed|accepted)/i.test(text), false);
    assert.equal(/meeting/i.test(text), false);
    assert.equal(text.split("\n").length <= 2, true);
  });

  it("includes proposal status and upcoming meetings only when present", () => {
    const facts = buildInquirySummaryFacts({
      status: "proposal_sent",
      contacted_at: "2026-09-01T12:00:00.000Z",
      messages: [inbound({ sent_at: "2026-09-14T12:00:00.000Z", body: "we received the proposal" })],
      proposals: [{ status: "viewed", created_at: "2026-09-10T12:00:00.000Z" }],
      meetings: [
        { title: "consult at the studio", occurred_at: "2026-09-20T18:00:00.000Z", match_status: "matched" },
      ],
      now: NOW,
    });
    const text = fallbackInquirySummary(facts);
    assert.match(text, /proposal sent/);
    assert.match(text, /viewed/);
    assert.match(text, /consult at the studio/);
    assert.match(text, /waiting on them/);
  });

  it("changes fingerprint when the thread or stage changes", () => {
    const base = buildInquirySummaryFacts({
      status: "contacted",
      contacted_at: "2026-09-14T12:00:00.000Z",
      messages: [inbound()],
      proposals: [],
      now: NOW,
    });
    const afterMail = buildInquirySummaryFacts({
      status: "contacted",
      contacted_at: "2026-09-14T12:00:00.000Z",
      messages: [inbound(), inbound({ id: "msg-2", sent_at: "2026-09-16T15:00:00.000Z", body: "guest count is 120" })],
      proposals: [],
      now: NOW,
    });
    const afterStage = buildInquirySummaryFacts({
      status: "proposal_sent",
      contacted_at: "2026-09-14T12:00:00.000Z",
      messages: [inbound()],
      proposals: [{ status: "sent", created_at: "2026-09-15T12:00:00.000Z" }],
      now: NOW,
    });
    assert.notEqual(inquirySummaryFingerprint(base), inquirySummaryFingerprint(afterMail));
    assert.notEqual(inquirySummaryFingerprint(base), inquirySummaryFingerprint(afterStage));
  });

  it("keeps the prompt grounded and never mentions the API key", () => {
    const prompt = inquirySummarySystemPrompt();
    assert.match(prompt, /never invent/i);
    assert.match(prompt, /facts json/i);
    assert.equal(prompt.includes("ANTHROPIC"), false);
    const facts = buildInquirySummaryFacts({
      status: "new",
      messages: [inbound()],
      proposals: [],
      now: NOW,
    });
    const user = formatInquirySummaryUserMessage(facts);
    assert.match(user, /do not add anything/i);
    assert.equal(user.includes("sk-"), false);
  });

  it("sanitizes the model down to one or two lines", () => {
    const text = sanitizeInquirySummary('"in touch.\n\nnext: send proposal.\nextra line"');
    assert.equal(text.includes("extra line"), false);
    assert.equal(text.split("\n").length <= 2, true);
  });

  it("does not call Anthropic for a brand-new lead", async () => {
    let called = 0;
    const facts = buildInquirySummaryFacts({
      status: "new",
      contacted_at: null,
      messages: [inbound()],
      proposals: [],
      now: NOW,
    });
    const text = await generateInquirySummaryText(facts, {
      empty: true,
      apiKey: "sk-ant-test-never-leak",
      fetchImpl: async () => {
        called += 1;
        return new Response("{}", { status: 500 });
      },
    });
    assert.equal(called, 0);
    assert.equal(text, NEW_LEAD_SUMMARY);
  });

  it("calls Anthropic server-side with the summary prompt and never returns the key", async () => {
    const apiKey = "sk-ant-test-never-leak";
    const captured = { url: "", body: "" };
    const facts = buildInquirySummaryFacts({
      status: "in_conversation",
      contacted_at: "2026-09-10T12:00:00.000Z",
      messages: [inbound({ sent_at: "2026-09-14T12:00:00.000Z", body: "can we add a ceremony arch" })],
      proposals: [],
      now: NOW,
    });
    const text = await generateInquirySummaryText(facts, {
      apiKey,
      model: "claude-sonnet-4-5",
      fetchImpl: async (url, init) => {
        captured.url = String(url);
        captured.body = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "in touch — they asked about a ceremony arch. next: send proposal." }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
    assert.match(captured.body, /never invent/i);
    assert.match(captured.body, /can we add a ceremony arch/);
    assert.equal(captured.body.includes(apiKey), false);
    assert.equal(text.includes(apiKey), false);
    assert.match(text, /ceremony arch/);
  });
});
