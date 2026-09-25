/**
 * Editable brain for inbound Gmail routing (V1).
 *
 * This is the only file to edit when tuning:
 *   - what counts as a true inquiry
 *   - how mail is matched to existing inquiries
 *   - how the model must answer
 *
 * Labels on ignored / dismissed mail are stored for later tuning.
 * There is no real-time learning in V1 — changing this file is the tuning loop.
 */

export const ROUTING_EVENT_TYPES = [
  "wedding",
  "brand_activation",
  "corporate",
  "private",
  "photoshoot",
  "subscription",
  "other",
] as const;

export type RoutingEventType = (typeof ROUTING_EVENT_TYPES)[number];

/** What Say Sukii counts as a true inquiry. Edit this definition first. */
export const TRUE_INQUIRY_DEFINITION = `TRUE INQUIRY — Say Sukii (Miami floral + experiential design studio)

A true inquiry is a real person or brand asking Say Sukii to design, make, install, or deliver flowers or a floral experience for an occasion or an ongoing need.

It is a true inquiry when there is enough signal of a booking conversation:
- a person or brand (name and/or email is enough), AND
- a clear ask for floral / experiential work, OR a named occasion that implies that work.

Occasions in scope:
- wedding (ceremony, reception, rehearsal, elopement, welcome party)
- private event (dinner, birthday, celebration at home or a venue)
- corporate event
- brand activation / launch / pop-up
- photoshoot, film/set, editorial, or styling
- flower subscription or standing weekly/monthly order
- delivery of an arrangement to someone (the sender is still the client)

Extract when present, but do not require them to count as a true inquiry:
- name, event type, date, place, budget, vision / notes

NOT a true inquiry:
- vendor / wholesaler / rental pitches, cold sales, SEO, "partnerships" that are ads
- newsletters, marketing blasts, social notifications, calendar invites with no ask
- receipts, invoices, shipping, tracking, payment processors, banks
- bounces, out-of-office, unsubscribe, mailer-daemon
- job applications, internships, press kits with no floral booking ask
- personal mail to Sukii that is not asking for studio work
- logistics-only noise with no tie to an active booking (spam, wrong inbox)
- a past client writing about something that is clearly not a new or continuing floral job
  (e.g. "are you free for coffee", forwarding a meme)

A reply that continues an active booking (venue details, guest count, "yes please send a proposal",
moodboard, "can we add ceremony chairs") is relevant to that inquiry even if it is not a *new* lead.`;

export const INQUIRY_ROUTING_RULES = `ROUTING RULES — run in this order

You are given one inbound email plus zero or more existing inquiries that already match
the Gmail thread id and/or the sender email. Matches are labeled:
- match_via: "thread" and/or "sender"
- active: true when the inquiry is still in the book as live work (not closed, archived, or dismissed)

1. MATCHED + RELEVANT TO THAT ACTIVE INQUIRY
   Same thread, or same sender clearly writing about the same event / booking already on file.
   action = "attach"
   matched_inquiry_id = that inquiry's id
   Do not create a new candidate.

2. MATCHED SENDER, BUT THIS IS A NEW / DIFFERENT INQUIRY
   Past or current client writing about a different event, a new date, a different place,
   or a new kind of work (e.g. they booked a wedding last year and now want a brand dinner).
   Never bury this in the old thread.
   action = "candidate"
   matched_inquiry_id = null
   Extract fields for the NEW job.

3. NO MATCH
   Classify against the true-inquiry definition.
   - True inquiry → action = "candidate", extract fields.
   - Not an inquiry → action = "ignored".

4. NEVER
   - Never attach to a closed, archived, or dismissed inquiry. If the mail is a true inquiry,
     create a candidate instead.
   - Never invent a matched_inquiry_id that is not in the provided match list.
   - Never mark a true inquiry ignored because extraction is incomplete.
   - The AI never puts a lead in the book. Candidates are proposals for a human.`;

export const INQUIRY_ROUTING_OUTPUT = `OUTPUT — JSON only, no markdown, no preamble.

{
  "action": "attach" | "candidate" | "ignored",
  "matched_inquiry_id": "<uuid from the match list, or null>",
  "is_true_inquiry": true | false,
  "confidence": 0.0,
  "reason": "<one or two sentences, concrete>",
  "extraction": {
    "name": "<string or null>",
    "email": "<string or null>",
    "event_type": "wedding" | "brand_activation" | "corporate" | "private" | "photoshoot" | "subscription" | "other" | null,
    "event_date": "<YYYY-MM-DD or null>",
    "event_date_tbd": true | false,
    "place": "<venue / city or null>",
    "budget": "<as written or null>",
    "vision": "<notes / ask, or null>"
  }
}

confidence is 0..1. event_date_tbd is true when no usable date is present.
For attach, fill extraction only when the mail adds facts; matched_inquiry_id is required.
For ignored, matched_inquiry_id must be null.
For candidate, matched_inquiry_id must be null.`;

export function inquiryRoutingSystemPrompt() {
  return [TRUE_INQUIRY_DEFINITION, INQUIRY_ROUTING_RULES, INQUIRY_ROUTING_OUTPUT].join("\n\n");
}

export type RoutingPromptMessage = {
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
  gmail_thread_id: string | null;
};

export type RoutingPromptMatch = {
  id: string;
  client_name: string;
  client_email: string;
  event_type: string;
  event_date: string | null;
  event_date_tbd: boolean;
  venue_text: string | null;
  status: string;
  archived: boolean;
  origin: string;
  detection_status: string;
  active: boolean;
  match_via: Array<"thread" | "sender">;
  latest_message_excerpt: string | null;
};

const BODY_LIMIT = 8000;

export function formatRoutingUserMessage(message: RoutingPromptMessage, matches: RoutingPromptMatch[]) {
  const body = (message.body ?? "").slice(0, BODY_LIMIT);
  return JSON.stringify(
    {
      inbound: {
        from: message.from_addr,
        to: message.to_addr,
        subject: message.subject,
        received_at: message.received_at,
        gmail_thread_id: message.gmail_thread_id,
        body,
      },
      existing_matches: matches.map((match) => ({
        id: match.id,
        client_name: match.client_name,
        client_email: match.client_email,
        event_type: match.event_type,
        event_date: match.event_date,
        event_date_tbd: match.event_date_tbd,
        place: match.venue_text,
        status: match.status,
        archived: match.archived,
        origin: match.origin,
        detection_status: match.detection_status,
        active: match.active,
        match_via: match.match_via,
        latest_message_excerpt: match.latest_message_excerpt,
      })),
    },
    null,
    2,
  );
}
