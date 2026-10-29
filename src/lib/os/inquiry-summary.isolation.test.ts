import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InquiryMessageRow, InquiryStatus } from "@/integrations/supabase/types";
import { generateInquirySummaryText } from "@/lib/os/inquiry-summary.server";
import {
  NEW_LEAD_SUMMARY,
  buildInquirySummaryFacts,
  fallbackInquirySummary,
  formatInquirySummaryUserMessage,
  inquirySummaryFingerprint,
  inquirySummarySystemPrompt,
  isNewUncontactedLead,
  sanitizeInquirySummary,
  summaryTextIsStale,
  type InquirySummaryDetails,
  type InquirySummaryInvoice,
  type InquirySummaryMeeting,
  type InquirySummaryProposal,
} from "@/lib/os/inquiry-summary";
import { connectLetterBody } from "@/lib/os/connect-letter";

const NOW = new Date("2026-09-16T16:00:00.000Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

const CAMILA: InquirySummaryDetails = {
  clientName: "Camila Reyes",
  clientEmail: "camila@example.com",
  eventType: "wedding",
  eventDate: "2027-03-14",
  eventDateTbd: false,
  venue: "The W Hotel, 401 N Fort Lauderdale Beach Blvd, Fort Lauderdale, FL",
  guestCount: 120,
  budget: "$10,000 - $15,000",
  receivedAt: at(-1),
  detectionStatus: "na",
};

function message(overrides: Partial<InquiryMessageRow> = {}): InquiryMessageRow {
  return {
    id: `msg-${Math.random()}`,
    inquiry_id: "inq-1",
    direction: "inbound",
    channel: "form",
    subject: "new inquiry",
    body: "A garden ceremony at dusk. Garden roses and candlelight.",
    from_address: "camila@example.com",
    to_address: "info@saysukii.com",
    gmail_message_id: null,
    gmail_thread_id: null,
    author: "Camila Reyes",
    sent_at: at(-1),
    status: "received",
    created_by: null,
    created_at: at(-1),
    ...overrides,
  };
}

const form = (days = -1) => message({ sent_at: at(days), created_at: at(days) });
const studio = (days: number, body = "so lovely to hear from you.", subject = "re: flowers") =>
  message({
    direction: "outbound",
    channel: "email",
    subject,
    body,
    from_address: "info@saysukii.com",
    sent_at: at(days),
    created_at: at(days),
    status: "sent",
  });
const reply = (days: number, body: string, from = "camila@example.com", author = "Camila Reyes") =>
  message({
    channel: "email",
    subject: "re: flowers",
    body,
    from_address: from,
    author,
    sent_at: at(days),
    created_at: at(days),
  });

function read(input: {
  status?: InquiryStatus;
  messages?: InquiryMessageRow[];
  proposals?: InquirySummaryProposal[];
  meetings?: InquirySummaryMeeting[];
  details?: Partial<InquirySummaryDetails>;
  calls?: Array<{ starts_at: string }>;
  invoices?: InquirySummaryInvoice[];
  contacted?: boolean;
}) {
  const messages = input.messages ?? [form()];
  const facts = buildInquirySummaryFacts({
    status: input.status ?? "new",
    contacted_at: input.contacted ? at(-5) : null,
    messages,
    proposals: input.proposals ?? [],
    meetings: input.meetings ?? [],
    details: { ...CAMILA, ...input.details },
    calls: input.calls ?? [],
    ...(input.invoices ? { invoices: input.invoices } : {}),
    now: NOW,
  });
  return { facts, text: fallbackInquirySummary(facts) };
}

describe("inquiry summary situations", () => {
  it("new and unanswered: who wrote, what for, and to write back today", () => {
    const { facts, text } = read({});
    assert.equal(facts.situation, "new_unanswered");
    assert.match(
      text,
      /camila wrote in on sep 15 about a wedding on mar 14, 2027 at the w hotel, 120 guests, budget \$10,000–\$15,000\./,
    );
    assert.match(text, /next: write back today, a same-day reply keeps the date\./);
    assert.equal(
      isNewUncontactedLead({
        status: "new",
        contacted_at: null,
        messages: [form()],
        proposalStatus: null,
      }),
      true,
    );
  });

  it("new and unanswered for days, missing the date and place", () => {
    const { text } = read({
      messages: [form(-4)],
      details: { eventDate: null, eventDateTbd: true, venue: null, receivedAt: at(-4) },
    });
    assert.match(text, /no date or place yet\./);
    assert.match(
      text,
      /next: write back today and ask for the date and place, they've been waiting since sep 12\./,
    );
    assert.equal(/date tbd/.test(text), false);
  });

  it("new with a close date says so", () => {
    const { text } = read({ details: { eventDate: "2026-10-10" } });
    assert.match(text, /their date is close/);
  });

  it("they wrote back after the studio: the move is hers, with their question", () => {
    const { facts, text } = read({
      status: "contacted",
      messages: [
        form(-5),
        studio(-4),
        reply(-1, "Thank you! Could we do taper candles down the long table?"),
      ],
    });
    assert.equal(facts.situation, "reply_owed");
    assert.match(
      text,
      /camila asked on sep 15: “could we do taper candles down the long table\?”|camila asked on sep 15: “Could we do taper candles down the long table\?”/,
    );
    assert.match(text, /next: answer their question while it's fresh\./);
  });

  it("a fresh note from someone else says to reply to them and keep the client on", () => {
    const { text } = read({
      status: "in_conversation",
      messages: [
        form(-9),
        studio(-8),
        reply(0, "Load-in is 2pm.", "ana@planner.example", "Ana Ruiz"),
      ],
    });
    assert.match(text, /next: reply to ana ruiz and keep camila on the thread\./);
  });

  it("a planner on the thread is named, and waiting days push it to today", () => {
    const { text } = read({
      status: "in_conversation",
      messages: [
        form(-9),
        studio(-8),
        reply(-4, "Looping in our timeline. Load-in is 2pm.", "ana@planner.example", "Ana Ruiz"),
      ],
    });
    assert.match(text, /ana ruiz wrote on sep 12: “Looping in our timeline\. Load-in is 2pm\.”/);
    assert.equal(/is on the thread too/.test(text), false);
    assert.match(text, /next: reply today, they've been waiting since sep 12\./);
  });

  it("let's connect sent: give them a few days, then nudge, then one last check-in", () => {
    const connect = (days: number) => [
      form(days - 1),
      studio(days, connectLetterBody("Camila"), "let's connect!"),
    ];
    assert.match(
      read({ status: "contacted", messages: connect(-2) }).text,
      /give them a few days to pick a time/,
    );
    assert.match(
      read({ status: "contacted", messages: connect(-6) }).text,
      /send a gentle nudge with the calendar link/,
    );
    const cold = read({ status: "contacted", messages: connect(-15) });
    assert.equal(cold.facts.situation, "gone_cold");
    assert.match(cold.text, /one last check-in, then archive it if it stays quiet/);
    assert.equal(/hasn't been contacted/i.test(cold.text), false);
  });

  it("the studio wrote last: wait, then follow up, then call it cold", () => {
    const after = (days: number) =>
      read({
        status: "in_conversation",
        messages: [form(days - 2), studio(days, "here are a few palettes to look at.")],
      });
    assert.equal(after(-2).facts.situation, "studio_waiting");
    assert.match(
      after(-2).text,
      /you wrote on sep 14 and haven't heard back: “here are a few palettes to look at\.”/,
    );
    assert.equal(after(-9).facts.situation, "gone_quiet");
    assert.match(after(-9).text, /send a gentle follow-up/);
    assert.equal(after(-30).facts.situation, "gone_cold");
    assert.match(after(-30).text, /it's gone cold, send one last note or archive it/);
  });

  it("a call on the calendar: when, and what to bring", () => {
    const { facts, text } = read({
      status: "contacted",
      messages: [form(-3), studio(-2, connectLetterBody("Camila"), "let's connect!")],
      calls: [{ starts_at: "2026-09-17T18:00:00.000Z" }],
    });
    assert.equal(facts.situation, "call_booked");
    assert.match(text, /camila booked a call for thu, sep 17 at 2:00 pm about a wedding/);
    assert.match(
      text,
      /next: come ready with their notes, the budget \(\$10,000–\$15,000\), and the space\./,
    );
  });

  it("after the call: send the proposal, with the meeting takeaway", () => {
    const { facts, text } = read({
      status: "in_conversation",
      messages: [form(-6), studio(-5, connectLetterBody("Camila"), "let's connect!")],
      meetings: [
        {
          title: "consult",
          occurred_at: at(-1),
          match_status: "matched",
          summary: "wants a hanging installation over the long table",
        },
      ],
    });
    assert.equal(facts.situation, "call_done");
    assert.match(
      text,
      /you met with camila on sep 15: “wants a hanging installation over the long table”/,
    );
    assert.match(text, /next: send the proposal while the conversation is fresh\./);
  });

  it("proposal drafted, unopened, and opened each get their own move", () => {
    const thread = [form(-10), studio(-8)];
    const draft = read({
      status: "in_conversation",
      messages: thread,
      proposals: [{ status: "draft", created_at: at(-1), total_cents: 1_840_000 }],
    });
    assert.equal(draft.facts.situation, "proposal_draft");
    assert.match(draft.text, /a \$18,400 proposal is drafted for camila but hasn't gone out\./);

    const unopened = read({
      status: "proposal_sent",
      messages: thread,
      proposals: [{ status: "sent", created_at: at(-5), sent_at: at(-4), total_cents: 1_840_000 }],
    });
    assert.equal(unopened.facts.situation, "proposal_unopened");
    assert.match(
      unopened.text,
      /the \$18,400 proposal went to camila on sep 12 and hasn't been opened\./,
    );
    assert.match(unopened.text, /next: send a short note to make sure it landed\./);

    const opened = read({
      status: "proposal_sent",
      messages: thread,
      proposals: [
        {
          status: "viewed",
          created_at: at(-8),
          sent_at: at(-7),
          viewed_at: at(-6),
          total_cents: 1_840_000,
          valid_until: "2026-09-20",
        },
      ],
    });
    assert.equal(opened.facts.situation, "proposal_opened");
    assert.match(opened.text, /camila opened the \$18,400 proposal on sep 10 and hasn't replied\./);
    assert.match(
      opened.text,
      /follow up and ask what they think or what they'd change, it's good until sep 20\./,
    );
  });

  it("a reply after opening the proposal is called out", () => {
    const { facts, text } = read({
      status: "proposal_sent",
      messages: [form(-10), studio(-7), reply(-1, "Can we bring it closer to 15?")],
      proposals: [
        { status: "viewed", created_at: at(-7), viewed_at: at(-3), total_cents: 1_840_000 },
      ],
    });
    assert.equal(facts.situation, "reply_owed");
    assert.match(
      text,
      /camila asked on sep 15, after opening the proposal: “Can we bring it closer to 15\?”/,
    );
  });

  it("expired, declined, and accepted proposals", () => {
    const thread = [form(-30), studio(-25)];
    const expired = read({
      status: "proposal_sent",
      messages: thread,
      proposals: [
        { status: "sent", created_at: at(-20), valid_until: "2026-09-10", total_cents: 900_000 },
      ],
    });
    assert.equal(expired.facts.situation, "proposal_expired");
    assert.match(expired.text, /re-send it with fresh dates, or archive it/);

    const declined = read({
      status: "proposal_sent",
      messages: thread,
      proposals: [
        {
          status: "declined",
          created_at: at(-20),
          declined_at: at(-2),
          declined_reason: "went with a smaller budget",
        },
      ],
    });
    assert.equal(declined.facts.situation, "proposal_declined");
    assert.match(
      declined.text,
      /camila passed on the proposal on sep 14: “went with a smaller budget”/,
    );
    assert.match(declined.text, /ask if a smaller version would work, or archive it/);

    const accepted = read({
      status: "proposal_sent",
      messages: thread,
      proposals: [
        { status: "accepted", created_at: at(-20), accepted_at: at(-1), total_cents: 1_840_000 },
      ],
      invoices: [{ status: "unpaid", amount_cents: 920_000 }],
    });
    assert.equal(accepted.facts.situation, "proposal_accepted");
    assert.match(
      accepted.text,
      /camila accepted the \$18,400 proposal on sep 15\. the deposit isn't paid yet\./,
    );
    assert.match(accepted.text, /check in about the deposit, then mark it booked once it's paid/);
  });

  it("booked: unpaid deposit, held date, event soon, and event past", () => {
    const thread = [form(-60), studio(-58)];
    const unpaid = read({
      status: "booked",
      messages: thread,
      invoices: [{ status: "unpaid", amount_cents: 920_000 }],
    });
    assert.equal(unpaid.facts.situation, "booked_unpaid");
    assert.match(unpaid.text, /check in about the deposit so the date is truly held/);

    const held = read({
      status: "booked",
      messages: thread,
      invoices: [{ status: "paid", amount_cents: 920_000 }],
    });
    assert.equal(held.facts.situation, "booked");
    assert.match(held.text, /booked: a wedding on mar 14, 2027 at the w hotel\. deposit paid\./);

    const soon = read({ status: "booked", messages: thread, details: { eventDate: "2026-09-25" } });
    assert.equal(soon.facts.situation, "event_soon");
    assert.match(soon.text, /the wedding is on sep 25 at the w hotel, under two weeks away\./);
    assert.match(soon.text, /confirm the final details: timing, load-in, and final counts/);

    const past = read({ status: "booked", messages: thread, details: { eventDate: "2026-09-01" } });
    assert.equal(past.facts.situation, "event_past_booked");
    assert.match(past.text, /send a thank-you, ask for photos, and close it out/);
  });

  it("a date that passed without booking, gmail review, and archived", () => {
    const lapsed = read({
      status: "in_conversation",
      messages: [form(-90), studio(-89)],
      details: { eventDate: "2026-09-01" },
    });
    assert.equal(lapsed.facts.situation, "event_past_open");
    assert.match(lapsed.text, /their date \(sep 1\) has passed and it never booked\./);

    const review = read({
      messages: [reply(-1, "Do you do flowers for a dinner party?")],
      details: { detectionStatus: "candidate" },
    });
    assert.equal(review.facts.situation, "review");
    assert.match(review.text, /approve it if it's a real lead, or dismiss it/);

    const archived = read({
      status: "closed",
      messages: [form(-90), studio(-89)],
      details: { closedAt: at(-3), closedReason: "timeline changed" },
    });
    assert.equal(archived.facts.situation, "archived");
    assert.match(archived.text, /archived on sep 13: timeline changed\./);
  });

  it("never invents a proposal, meeting, or call, and stays within two lines", () => {
    const { text } = read({
      status: "in_conversation",
      messages: [form(-4), studio(-3, "lovely, thank you.")],
    });
    assert.equal(/proposal|meeting|call/i.test(text), false);
    assert.equal(text.split("\n").length, 2);
    assert.equal(/days ago|yesterday/i.test(text), false);
  });
});

describe("inquiry summary upkeep", () => {
  it("re-reads the old canned line and anything saved more than a day ago", () => {
    const { facts } = read({ status: "contacted", messages: [form(-3), studio(-2)] });
    assert.equal(summaryTextIsStale(NEW_LEAD_SUMMARY, facts), true);
    assert.equal(
      summaryTextIsStale("you wrote on sep 14. no reply yet.", facts, at(-2), NOW),
      true,
    );
    assert.equal(
      summaryTextIsStale("you wrote on sep 14. no reply yet.", facts, at(-0.5), NOW),
      false,
    );
  });

  it("changes fingerprint when the thread or stage changes", () => {
    const base = read({ status: "contacted", messages: [form(-3), studio(-2)] }).facts;
    const afterMail = read({
      status: "contacted",
      messages: [form(-3), studio(-2), reply(0, "guest count is 140")],
    }).facts;
    const afterProposal = read({
      status: "proposal_sent",
      messages: [form(-3), studio(-2)],
      proposals: [{ status: "sent", created_at: at(-1) }],
    }).facts;
    assert.notEqual(inquirySummaryFingerprint(base), inquirySummaryFingerprint(afterMail));
    assert.notEqual(inquirySummaryFingerprint(base), inquirySummaryFingerprint(afterProposal));
  });

  it("keeps the prompt grounded and never mentions the API key", () => {
    const prompt = inquirySummarySystemPrompt();
    assert.match(prompt, /never invent/i);
    assert.match(prompt, /facts json/i);
    assert.match(prompt, /never write relative times/i);
    assert.equal(prompt.includes("ANTHROPIC"), false);
    const user = formatInquirySummaryUserMessage(read({}).facts);
    assert.match(user, /do not add anything/i);
    assert.match(user, /"draft": "camila wrote in/);
    assert.equal(user.includes("sk-"), false);
  });

  it("sanitizes the model down to one or two lines", () => {
    const text = sanitizeInquirySummary('"in touch.\n\nnext: send proposal.\nextra line"');
    assert.equal(text.includes("extra line"), false);
    assert.equal(text.split("\n").length <= 2, true);
  });

  it("does not call Anthropic for an archived lead", async () => {
    let called = 0;
    const { facts } = read({ status: "closed", messages: [form(-9)] });
    const text = await generateInquirySummaryText(facts, {
      apiKey: "sk-ant-test-never-leak",
      fetchImpl: async () => {
        called += 1;
        return new Response("{}", { status: 500 });
      },
    });
    assert.equal(called, 0);
    assert.match(text, /^archived/);
  });

  it("falls back to the written line when the model fails", async () => {
    const { facts, text: written } = read({});
    const text = await generateInquirySummaryText(facts, {
      apiKey: "sk-ant-test-never-leak",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 529 }),
    });
    assert.equal(text, written);
  });

  it("calls Anthropic server-side with the draft and never returns the key", async () => {
    const apiKey = "sk-ant-test-never-leak";
    const captured = { url: "", body: "" };
    const { facts } = read({
      status: "in_conversation",
      messages: [form(-6), studio(-5), reply(-1, "can we add a ceremony arch?")],
    });
    const text = await generateInquirySummaryText(facts, {
      apiKey,
      model: "claude-sonnet-4-5",
      fetchImpl: async (url, init) => {
        captured.url = String(url);
        captured.body = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: "camila asked on sep 15 about adding a ceremony arch.\nnext: answer her, the next move is yours.",
              },
            ],
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
