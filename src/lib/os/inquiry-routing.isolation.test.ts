import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOOK_DETECTION_STATUSES } from "./inquiry-detection";
import {
  TRUE_INQUIRY_DEFINITION,
  formatRoutingUserMessage,
  inquiryRoutingSystemPrompt,
} from "./inquiry-routing.prompt";
import {
  assembleMatches,
  classifyWithAnthropic,
  createMemoryRoutingStore,
  isBookDetectionStatus,
  heuristicRoutingRaw,
  normalizeRoutingDecision,
  parseModelJson,
  publicRoutingResult,
  recordDismissedCandidate,
  routeUnprocessedInbound,
  runGmailInboundRouting,
  type InquiryMatch,
} from "./inquiry-routing.server";
import type {
  ClientRow,
  InboundMessageRow,
  InquiryMessageRow,
  InquiryRow,
} from "../../integrations/supabase/types";

const NOW = new Date("2026-09-14T20:00:00.000Z");

function inbound(id: string, overrides: Partial<InboundMessageRow> = {}): InboundMessageRow {
  return {
    id: `inb-${id}`,
    gmail_message_id: `gmail-${id}`,
    gmail_thread_id: `thread-${id}`,
    from_addr: "ada@example.com",
    to_addr: "info@saysukii.com",
    subject: "flowers",
    body: "Hi, I would love flowers for my wedding in Miami this December.",
    received_at: "2026-09-14T18:00:00.000Z",
    processed_at: null,
    routing_result: null,
    matched_inquiry_id: null,
    created_at: "2026-09-14T18:00:00.000Z",
    ...overrides,
  };
}

function client(id: string, email = "ada@example.com"): ClientRow {
  return {
    id,
    name: "Ada",
    email,
    phone: null,
    organization: null,
    type: "individual",
    source: "form",
    notes: null,
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function inquiry(id: string, clientId: string, overrides: Partial<InquiryRow> = {}): InquiryRow {
  return {
    id,
    client_id: clientId,
    event_date: "2026-12-12",
    event_date_tbd: false,
    event_type: "wedding",
    venue_id: null,
    venue_text: "Vizcaya",
    guest_count: 80,
    budget_range: "$10,000–$20,000",
    source: "form",
    message: "ceremony + reception",
    status: "in_conversation",
    closed_reason: null,
    received_at: "2026-08-01T00:00:00.000Z",
    contacted_at: "2026-08-02T00:00:00.000Z",
    proposal_sent_at: null,
    booked_at: null,
    closed_at: null,
    archived: false,
    created_by: null,
    updated_at: "2026-08-02T00:00:00.000Z",
    origin: "form",
    detection_status: "na",
    detection_confidence: null,
    detection_reason: null,
    source_message_id: null,
    summary_text: null,
    summary_generated_at: null,
    ...overrides,
  };
}

function threadMessage(inquiryId: string, threadId: string): InquiryMessageRow {
  return {
    id: `msg-${inquiryId}`,
    inquiry_id: inquiryId,
    direction: "inbound",
    channel: "email",
    subject: "wedding",
    body: "We are getting married at Vizcaya on December 12.",
    from_address: "ada@example.com",
    to_address: "info@saysukii.com",
    gmail_message_id: `orig-${inquiryId}`,
    gmail_thread_id: threadId,
    author: "Ada",
    sent_at: "2026-08-01T00:00:00.000Z",
    status: "received",
    created_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function weddingMatch(): InquiryMatch {
  return {
    id: "inq-wedding",
    client_id: "cli-ada",
    client_name: "Ada",
    client_email: "ada@example.com",
    event_type: "wedding",
    event_date: "2026-12-12",
    event_date_tbd: false,
    venue_text: "Vizcaya",
    status: "in_conversation",
    archived: false,
    origin: "form",
    detection_status: "na",
    active: true,
    match_via: ["thread", "sender"],
    latest_message_excerpt: "We are getting married at Vizcaya",
    received_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("inquiry routing prompt", () => {
  it("keeps the true-inquiry definition and routing rules in one editable file", () => {
    const prompt = inquiryRoutingSystemPrompt();
    assert.match(TRUE_INQUIRY_DEFINITION, /TRUE INQUIRY/);
    assert.match(TRUE_INQUIRY_DEFINITION, /NOT a true inquiry/);
    assert.match(prompt, /TRUE INQUIRY/);
    assert.match(prompt, /MATCHED \+ RELEVANT/);
    assert.match(prompt, /NEW \/ DIFFERENT INQUIRY/);
    assert.match(prompt, /Never bury/);
    assert.match(prompt, /"action": "attach" \| "candidate" \| "ignored"/);
    assert.equal(prompt.includes("ANTHROPIC"), false);
    const user = formatRoutingUserMessage(inbound("x"), [
      {
        id: "inq-1",
        client_name: "Ada",
        client_email: "ada@example.com",
        event_type: "wedding",
        event_date: "2026-12-12",
        event_date_tbd: false,
        venue_text: "Vizcaya",
        status: "in_conversation",
        archived: false,
        origin: "form",
        detection_status: "na",
        active: true,
        match_via: ["thread"],
        latest_message_excerpt: "ceremony",
      },
    ]);
    assert.match(user, /inq-1/);
    assert.match(user, /ada@example.com/);
  });
});

describe("decision guards", () => {
  it("attaches only to an active inquiry from the match list", () => {
    const decision = normalizeRoutingDecision(
      {
        action: "attach",
        matched_inquiry_id: "inq-wedding",
        is_true_inquiry: false,
        confidence: 0.91,
        reason: "same Vizcaya wedding thread",
        extraction: { name: "Ada", event_type: "wedding" },
      },
      [weddingMatch()],
      inbound("1"),
    );
    assert.equal(decision.action, "attached");
    assert.equal(decision.matched_inquiry_id, "inq-wedding");
    assert.equal(decision.confidence, 0.91);
  });

  it("refuses a hallucinated attach id and will not bury a true inquiry", () => {
    const decision = normalizeRoutingDecision(
      {
        action: "attach",
        matched_inquiry_id: "not-a-real-id",
        is_true_inquiry: true,
        confidence: 1.7,
        reason: "invented",
        extraction: { event_type: "not-a-type", event_date: "soon" },
      },
      [weddingMatch()],
      inbound("1"),
    );
    assert.equal(decision.action, "candidate");
    assert.equal(decision.matched_inquiry_id, null);
    assert.equal(decision.confidence, 1);
    assert.equal(decision.extraction.event_type, null);
    assert.equal(decision.extraction.event_date_tbd, true);
  });

  it("never attaches to a closed or dismissed match", () => {
    const closed = { ...weddingMatch(), active: false, status: "closed" as const };
    const decision = normalizeRoutingDecision(
      {
        action: "attach",
        matched_inquiry_id: closed.id,
        is_true_inquiry: true,
        confidence: 0.8,
        reason: "same person, new job",
        extraction: { event_type: "private", name: "Ada" },
      },
      [closed],
      inbound("1"),
    );
    assert.equal(decision.action, "candidate");
    assert.equal(decision.matched_inquiry_id, null);
  });

  it("parses fenced JSON from the model", () => {
    const parsed = parseModelJson('Sure.\n```json\n{"action":"ignored","reason":"newsletter"}\n```');
    assert.deepEqual(parsed, { action: "ignored", reason: "newsletter" });
  });
});

describe("match assembly", () => {
  it("matches by thread and by sender without mixing unrelated leads", () => {
    const ada = client("cli-ada");
    const other = client("cli-other", "other@example.com");
    const wedding = inquiry("inq-wedding", ada.id);
    const closed = inquiry("inq-old", ada.id, { status: "closed", event_type: "private", archived: false });
    const stranger = inquiry("inq-stranger", other.id);
    const matches = assembleMatches(
      { from_addr: "Ada <ada@example.com>", gmail_thread_id: "thread-wedding" },
      {
        clients: [ada, other],
        inquiries: [wedding, closed, stranger],
        messages: [
          threadMessage(wedding.id, "thread-wedding"),
          threadMessage(stranger.id, "thread-other"),
        ],
      },
    );
    assert.deepEqual(
      matches.map((row) => row.id).sort(),
      ["inq-old", "inq-wedding"],
    );
    const threadHit = matches.find((row) => row.id === "inq-wedding");
    assert.deepEqual(threadHit?.match_via, ["thread", "sender"]);
    assert.equal(threadHit?.active, true);
    assert.equal(matches.find((row) => row.id === "inq-old")?.active, false);
  });
});

describe("classify + route engine", () => {
  it("attaches relevant mail to the active inquiry conversation as inbound", async () => {
    const { state, store } = createMemoryRoutingStore({
      inbound: [
        inbound("follow", {
          gmail_thread_id: "thread-wedding",
          subject: "Re: wedding",
          body: "The venue confirmed 4pm ceremony. Guest count is 90.",
        }),
      ],
      clients: [client("cli-ada")],
      inquiries: [inquiry("inq-wedding", "cli-ada")],
      messages: [threadMessage("inq-wedding", "thread-wedding")],
    });

    const result = await routeUnprocessedInbound({
      store,
      now: () => NOW,
      classify: async ({ matches }) => {
        assert.equal(matches[0]?.id, "inq-wedding");
        return {
          action: "attach",
          matched_inquiry_id: "inq-wedding",
          is_true_inquiry: false,
          confidence: 0.94,
          reason: "same Vizcaya wedding thread",
          extraction: {},
        };
      },
    });

    assert.equal(result.attached, 1);
    assert.equal(result.candidates, 0);
    assert.equal(state.inbound[0]?.routing_result, "attached");
    assert.equal(state.inbound[0]?.matched_inquiry_id, "inq-wedding");
    assert.equal(state.inbound[0]?.processed_at, NOW.toISOString());
    assert.equal(state.inquiries.length, 1);
    const added = state.messages.find((row) => row.gmail_message_id === "gmail-follow");
    assert.equal(added?.inquiry_id, "inq-wedding");
    assert.equal(added?.direction, "inbound");
    assert.equal(added?.channel, "email");
    assert.match(added?.body ?? "", /Guest count is 90/);
    assert.equal(state.labels.length, 0);
  });

  it("files a reply on the open thread ahead of older inbox noise, even if the model would ignore it", async () => {
    const { state, store } = createMemoryRoutingStore({
      inbound: [
        inbound("noise", {
          from_addr: "cash@square.com",
          gmail_thread_id: "thread-receipt",
          subject: "You spent $15",
          body: "receipt",
          received_at: "2026-09-01T00:00:00.000Z",
        }),
        inbound("reply", {
          gmail_thread_id: "thread-wedding",
          subject: "Re: Let's Connect!",
          body: "thank you!",
          received_at: "2026-09-14T19:00:00.000Z",
        }),
      ],
      clients: [client("cli-ada")],
      inquiries: [inquiry("inq-wedding", "cli-ada")],
      messages: [threadMessage("inq-wedding", "thread-wedding")],
    });

    const first = await store.listUnprocessed(1);
    assert.equal(first[0]?.gmail_message_id, "gmail-reply");

    let classified = 0;
    const result = await routeUnprocessedInbound({
      store,
      now: () => NOW,
      limit: 2,
      classify: async () => {
        classified += 1;
        return {
          action: "ignored",
          matched_inquiry_id: null,
          is_true_inquiry: false,
          confidence: 0.99,
          reason: "not a booking",
          extraction: {},
        };
      },
    });

    assert.equal(classified, 1);
    assert.equal(result.attached, 1);
    assert.equal(result.ignored, 1);
    const added = state.messages.find((row) => row.gmail_message_id === "gmail-reply");
    assert.equal(added?.inquiry_id, "inq-wedding");
    assert.equal(added?.direction, "inbound");
    assert.match(added?.body ?? "", /thank you/);
    assert.equal(state.inbound.find((row) => row.id === "inb-reply")?.routing_result, "attached");
  });

  it("opens a new candidate when a past client writes about a different event", async () => {
    const { state, store } = createMemoryRoutingStore({
      inbound: [
        inbound("new-event", {
          gmail_thread_id: "thread-brand",
          subject: "brand dinner in Wynwood",
          body: "We got married with you last year. Now we need flowers for a brand dinner on 2026-11-02 in Wynwood, budget around $6,000. Lush tropical.",
        }),
      ],
      clients: [client("cli-ada")],
      inquiries: [inquiry("inq-old-wedding", "cli-ada", { status: "closed", closed_at: "2025-12-20T00:00:00.000Z" })],
      messages: [threadMessage("inq-old-wedding", "thread-old")],
    });

    const result = await routeUnprocessedInbound({
      store,
      now: () => NOW,
      classify: async ({ matches }) => {
        assert.equal(matches.some((row) => row.id === "inq-old-wedding"), true);
        return {
          action: "candidate",
          matched_inquiry_id: "inq-old-wedding",
          is_true_inquiry: true,
          confidence: 0.88,
          reason: "same sender, different event — brand dinner not the closed wedding",
          extraction: {
            name: "Ada",
            email: "ada@example.com",
            event_type: "brand_activation",
            event_date: "2026-11-02",
            place: "Wynwood",
            budget: "$6,000",
            vision: "lush tropical brand dinner",
          },
        };
      },
    });

    assert.equal(result.candidates, 1);
    assert.equal(state.inquiries.length, 2);
    const created = state.inquiries.find((row) => row.origin === "detected");
    assert.ok(created);
    assert.equal(created?.detection_status, "candidate");
    assert.equal(created?.event_type, "brand_activation");
    assert.equal(created?.event_date, "2026-11-02");
    assert.equal(created?.venue_text, "Wynwood");
    assert.equal(created?.budget_range, "$6,000");
    assert.equal(created?.source_message_id, "inb-new-event");
    assert.equal(created?.id === "inq-old-wedding", false);
    assert.equal(isBookDetectionStatus(created!.detection_status), false);
    assert.equal(BOOK_DETECTION_STATUSES.includes(created!.detection_status), false);
    const oldThread = state.messages.filter((row) => row.inquiry_id === "inq-old-wedding");
    assert.equal(oldThread.some((row) => row.gmail_message_id === "gmail-new-event"), false);
    const newThread = state.messages.filter((row) => row.inquiry_id === created!.id);
    assert.equal(newThread.length, 1);
    assert.equal(newThread[0]?.direction, "inbound");
    assert.equal(state.inbound[0]?.routing_result, "candidate");
    assert.equal(state.inbound[0]?.matched_inquiry_id, created?.id);
  });

  it("creates a candidate for an unmatched true inquiry and keeps it out of the book", async () => {
    const { state, store } = createMemoryRoutingStore({
      inbound: [inbound("fresh")],
    });
    const result = await routeUnprocessedInbound({
      store,
      now: () => NOW,
      classify: async ({ matches }) => {
        assert.equal(matches.length, 0);
        return {
          action: "candidate",
          matched_inquiry_id: null,
          is_true_inquiry: true,
          confidence: 0.86,
          reason: "new wedding inquiry, no existing match",
          extraction: {
            name: "Ada",
            event_type: "wedding",
            event_date: "2026-12-12",
            place: "Miami",
            budget: "$10,000–$20,000",
            vision: "flowers for my wedding",
          },
        };
      },
    });
    assert.equal(result.candidates, 1);
    const created = state.inquiries[0];
    assert.equal(created?.origin, "detected");
    assert.equal(created?.detection_status, "candidate");
    assert.equal(created?.event_type, "wedding");
    assert.equal(created?.detection_reason, "new wedding inquiry, no existing match");
    const book = state.inquiries.filter((row) => isBookDetectionStatus(row.detection_status));
    assert.equal(book.length, 0);
  });

  it("ignores non-inquiries and logs a labeled negative", async () => {
    const { state, store } = createMemoryRoutingStore({
      inbound: [
        inbound("spam", {
          from_addr: "deals@wholesaler.com",
          subject: "50% off hydrangeas this week",
          body: "Click here to buy boxes of hydrangeas wholesale.",
        }),
      ],
    });
    const result = await routeUnprocessedInbound({
      store,
      now: () => NOW,
      classify: async () => ({
        action: "ignored",
        matched_inquiry_id: null,
        is_true_inquiry: false,
        confidence: 0.99,
        reason: "vendor blast, not a client asking for studio work",
        extraction: {},
      }),
    });
    assert.equal(result.ignored, 1);
    assert.equal(state.inquiries.length, 0);
    assert.equal(state.inbound[0]?.routing_result, "ignored");
    assert.equal(state.inbound[0]?.matched_inquiry_id, null);
    assert.equal(state.labels.length, 1);
    assert.equal(state.labels[0]?.label, "ignored");
    assert.equal(state.labels[0]?.source, "model");
    assert.match(state.labels[0]?.reason ?? "", /vendor blast/);
  });

  it("logs later-dismissed candidates as labeled negatives without learning", async () => {
    const { state, store } = createMemoryRoutingStore();
    await recordDismissedCandidate(
      { inquiryId: "inq-cand", inbound: inbound("x"), reason: "not a real lead" },
      store,
    );
    assert.equal(state.labels[0]?.label, "dismissed");
    assert.equal(state.labels[0]?.source, "human");
    assert.equal(state.labels[0]?.inquiry_id, "inq-cand");
  });

  it("is idempotent on already processed rows", async () => {
    const { state, store } = createMemoryRoutingStore({
      inbound: [inbound("fresh")],
    });
    const classify = async () => ({
      action: "candidate",
      is_true_inquiry: true,
      confidence: 0.7,
      reason: "true inquiry",
      extraction: { name: "Ada", event_type: "wedding", event_date_tbd: true },
    });
    const first = await routeUnprocessedInbound({ store, classify, now: () => NOW });
    const second = await routeUnprocessedInbound({
      store,
      classify: async () => {
        throw new Error("should not classify processed mail");
      },
      now: () => new Date("2026-09-14T21:00:00.000Z"),
    });
    assert.equal(first.candidates, 1);
    assert.equal(second.processed, 0);
    assert.equal(state.inquiries.length, 1);
    assert.equal(state.messages.length, 1);
  });

  it("leaves the row unprocessed when the classifier throws", async () => {
    const { state, store } = createMemoryRoutingStore({ inbound: [inbound("x")] });
    const result = await routeUnprocessedInbound({
      store,
      classify: async () => {
        throw new Error("Anthropic 500");
      },
    });
    assert.equal(result.errors, 1);
    assert.equal(result.processed, 0);
    assert.equal(state.inbound[0]?.processed_at, null);
    assert.equal(state.inbound[0]?.routing_result, null);
  });

  it("ignores mail with no sender without calling the model", async () => {
    let called = 0;
    const { state, store } = createMemoryRoutingStore({
      inbound: [inbound("blank", { from_addr: null, body: "mystery" })],
    });
    const result = await routeUnprocessedInbound({
      store,
      classify: async () => {
        called += 1;
        return { action: "candidate", is_true_inquiry: true };
      },
    });
    assert.equal(called, 0);
    assert.equal(result.ignored, 1);
    assert.equal(state.labels[0]?.reason, "no sender email");
  });

  it("does not skip routing when an injected classifier is provided without an API key", async () => {
    const previous = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    const { store } = createMemoryRoutingStore({ inbound: [inbound("fresh")] });
    const result = await runGmailInboundRouting({
      store,
      now: () => NOW,
      classify: async () => ({
        action: "ignored",
        is_true_inquiry: false,
        confidence: 1,
        reason: "ooo",
        extraction: {},
      }),
    });
    assert.equal(result.skipped, false);
    assert.equal(result.ignored, 1);
    if (previous) process.env["ANTHROPIC_API_KEY"] = previous;
    else delete process.env["ANTHROPIC_API_KEY"];
  });

  it("reads gmail with a heuristic when Anthropic is not configured", async () => {
    const previous = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    const { state, store } = createMemoryRoutingStore({
      inbound: [
        inbound("fresh"),
        inbound("noise", {
          from_addr: "news@shop.example",
          subject: "this week's newsletter",
          body: "unsubscribe from wholesale flowers",
        }),
        inbound("studio", {
          from_addr: "info@saysukii.com",
          subject: "Let's Connect!",
          body: "Feel free to schedule time on the calendar link.",
        }),
      ],
    });
    const result = await runGmailInboundRouting({ store, now: () => NOW });
    assert.equal(result.skipped, false);
    assert.equal(result.candidates, 1);
    assert.equal(result.ignored, 2);
    assert.equal(state.inquiries[0]?.origin, "detected");
    assert.equal(state.inquiries[0]?.detection_status, "candidate");
    assert.equal(state.inquiries[0]?.event_type, "wedding");
    const encoded = JSON.stringify(result);
    assert.equal(encoded.includes("sk-"), false);
    if (previous) process.env["ANTHROPIC_API_KEY"] = previous;
    else delete process.env["ANTHROPIC_API_KEY"];
  });

  it("attaches a reply on an open thread and leaves a new floral ask for review", () => {
    const openMatch: InquiryMatch = {
      id: "inq-open",
      client_id: "client-1",
      client_name: "Ada",
      client_email: "ada@example.com",
      event_type: "wedding",
      event_date: "2026-12-12",
      event_date_tbd: false,
      venue_text: "Vizcaya",
      status: "in_conversation",
      archived: false,
      origin: "form",
      detection_status: "na",
      active: true,
      match_via: ["thread"],
      latest_message_excerpt: null,
      received_at: "2026-08-01T00:00:00.000Z",
    };
    const attached = normalizeRoutingDecision(
      heuristicRoutingRaw({
        message: inbound("reply", { gmail_thread_id: "thread-open", subject: "re: flowers", body: "Tuesday works." }),
        matches: [openMatch],
      }),
      [openMatch],
      inbound("reply"),
    );
    assert.equal(attached.action, "attached");
    assert.equal(attached.matched_inquiry_id, "inq-open");

    const fresh = inbound("sub", {
      from_addr: "Tai <tai@example.com>",
      subject: "weekly flowers",
      body: "I would love a concierge subscription for my home.",
    });
    const candidate = normalizeRoutingDecision(heuristicRoutingRaw({ message: fresh, matches: [] }), [], fresh);
    assert.equal(candidate.action, "candidate");
    assert.equal(candidate.extraction.event_type, "subscription");
    assert.equal(candidate.extraction.name, "Tai");
  });

  it("calls Anthropic server-side with the prompt and never returns the key", async () => {
    const apiKey = "sk-ant-test-never-leak";
    const captured = { url: "", init: {} as RequestInit };
    const raw = await classifyWithAnthropic({
      apiKey,
      model: "claude-sonnet-4-5",
      message: inbound("fresh"),
      matches: [],
      fetchImpl: async (url, init) => {
        captured.url = String(url);
        captured.init = init ?? {};
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  action: "candidate",
                  is_true_inquiry: true,
                  confidence: 0.8,
                  reason: "wedding ask",
                  extraction: { name: "Ada", event_type: "wedding" },
                }),
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
    const headers = new Headers(captured.init.headers);
    assert.equal(headers.get("x-api-key"), apiKey);
    const body = JSON.parse(String(captured.init.body));
    assert.match(body.system, /TRUE INQUIRY/);
    assert.equal(body.temperature, 0);
    assert.equal(JSON.stringify(raw).includes(apiKey), false);
    assert.equal(JSON.stringify(raw).includes("sk-ant"), false);
  });
});
