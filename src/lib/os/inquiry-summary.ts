import type {
  DetectionStatus,
  EventType,
  InquiryMessageRow,
  InquiryStatus,
  MeetingMatchStatus,
  ProposalStatus,
} from "@/integrations/supabase/types";
import { STATUS_LABEL, shareNote } from "@/lib/os/inquiry-desk";
import { clientReplyText } from "@/lib/os/mail-reply";
import { STUDIO_ZONE } from "@/lib/studio-bookings";

/** The line older records were saved with. A record still showing it is re-read. */
export const NEW_LEAD_SUMMARY = "New inquiry — hasn't been contacted yet.";

export type InquirySummaryMeeting = {
  title: string;
  occurred_at: string;
  match_status: MeetingMatchStatus | string;
  summary?: string | null;
};

export type InquirySummaryProposal = {
  status: ProposalStatus | string;
  created_at: string;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  declined_reason?: string | null;
  valid_until?: string | null;
  total_cents?: number | null;
  /** when the client signed the agreement */
  signed_at?: string | null;
  /** what's been paid on it so far, and when the latest payment landed */
  paid_cents?: number | null;
  paid_at?: string | null;
};

export type InquirySummaryInvoice = { status: string; amount_cents: number };

export type InquirySummaryDetails = {
  clientName?: string | null;
  clientEmail?: string | null;
  eventType?: EventType | null;
  eventDate?: string | null;
  eventDateTbd?: boolean | null;
  venue?: string | null;
  guestCount?: number | null;
  budget?: string | null;
  receivedAt?: string | null;
  closedAt?: string | null;
  closedReason?: string | null;
  detectionStatus?: DetectionStatus | null;
};

/** Where a lead stands, in the order the founder would want to hear about it. */
export type SummarySituation =
  | "archived"
  | "review"
  | "reply_owed"
  | "new_unanswered"
  | "event_past_booked"
  | "event_past_open"
  | "booked_unpaid"
  | "event_soon"
  | "booked"
  | "proposal_declined"
  | "proposal_accepted"
  | "proposal_signed"
  | "proposal_expired"
  | "proposal_draft"
  | "proposal_unopened"
  | "proposal_opened"
  | "call_booked"
  | "call_done"
  | "connect_waiting"
  | "studio_waiting"
  | "gone_quiet"
  | "gone_cold"
  | "in_touch";

export type InquirySummaryFacts = {
  situation: SummarySituation;
  status: InquiryStatus;
  stage: string;
  contacted: boolean;
  client: string;
  event: {
    kind: string | null;
    date: string | null;
    tbd: boolean;
    venue: string | null;
    guests: number | null;
    budget: string | null;
  };
  missing: string[];
  daysSinceLastClientMessage: number | null;
  lastInboundAt: string | null;
  lastInboundFrom: string | null;
  lastInboundGist: string | null;
  lastInboundQuestion: string | null;
  lastOutboundAt: string | null;
  lastOutboundSubject: string | null;
  lastOutboundGist: string | null;
  othersOnThread: string[];
  latestNote: string | null;
  proposalStatus: string | null;
  proposalTotal: string | null;
  depositPaid: boolean | null;
  /** the agreement's signing, and the money on the proposal */
  signedAt: string | null;
  paidTotal: string | null;
  balance: string | null;
  balanceDue: string | null;
  callAt: string | null;
  meetings: Array<InquirySummaryMeeting & { when: "past" | "upcoming" }>;
  headline: string;
  nextMoveTitle: string;
  nextMoveNote: string;
};

type SummaryInput = {
  status: InquiryStatus;
  contacted_at?: string | null;
  messages: InquiryMessageRow[];
  proposals: InquirySummaryProposal[];
  meetings?: InquirySummaryMeeting[];
  details?: InquirySummaryDetails;
  calls?: Array<{ starts_at: string }>;
  invoices?: InquirySummaryInvoice[];
  now?: Date;
};

const DAY = 86_400_000;

const EVENT_PHRASE: Record<EventType, string> = {
  wedding: "a wedding",
  brand_activation: "a brand activation",
  corporate: "a corporate event",
  private: "a private event",
  photoshoot: "a photoshoot",
  subscription: "a flower subscription",
  other: "an event",
};

export function lastClientMessage(messages: InquiryMessageRow[]) {
  return (
    byTime(messages.filter((item) => item.direction === "inbound" && item.channel !== "note")).at(
      -1,
    ) ?? null
  );
}

export function isNewUncontactedLead(input: {
  status: InquiryStatus;
  contacted_at: string | null | undefined;
  messages: InquiryMessageRow[];
  proposalStatus: string | null;
}) {
  if (input.status !== "new") return false;
  if (input.contacted_at) return false;
  if (input.proposalStatus) return false;
  return !input.messages.some((item) => item.direction === "outbound");
}

export function buildInquirySummaryFacts(input: SummaryInput): InquirySummaryFacts {
  const now = input.now ?? new Date();
  const details = input.details ?? {};
  const proposal = byNewest(input.proposals)[0] ?? null;
  const inbound = lastClientMessage(input.messages);
  const outbound = lastStudioLetter(input.messages);
  const note = byTime(
    input.messages.filter((item) => item.direction === "note" || item.channel === "note"),
  ).at(-1);
  const inboundAt = inbound ? messageTime(inbound) : null;
  const outboundAt = outbound ? messageTime(outbound) : null;
  const inboundText = inbound ? inboundBody(inbound) : "";
  const meetings = (input.meetings ?? []).map((meeting) => ({
    ...meeting,
    when:
      Date.parse(meeting.occurred_at) > now.getTime() ? ("upcoming" as const) : ("past" as const),
  }));
  const calls = (input.calls ?? []).map((call) => call.starts_at).sort();
  const upcomingCall = calls.find((at) => Date.parse(at) > now.getTime()) ?? null;
  const pastCall = [...calls].reverse().find((at) => Date.parse(at) <= now.getTime()) ?? null;
  const pastMeeting = [...meetings].reverse().find((meeting) => meeting.when === "past") ?? null;
  const invoices = input.invoices;
  const paidCents = proposal?.paid_cents ?? 0;
  const left = proposal?.total_cents ? Math.max(0, proposal.total_cents - paidCents) : 0;
  const depositPaid =
    paidCents > 0
      ? true
      : invoices && invoices.length
        ? invoices.some((invoice) => invoice.status === "paid")
        : null;
  const clientEmail = details.clientEmail?.trim().toLowerCase() ?? "";

  const base = {
    status: input.status,
    stage: STATUS_LABEL[input.status],
    contacted: Boolean(input.contacted_at) || Boolean(outbound),
    client: firstName(details.clientName) || "they",
    event: {
      kind: details.eventType ? EVENT_PHRASE[details.eventType] : null,
      date: details.eventDateTbd ? null : (details.eventDate ?? null),
      tbd: Boolean(details.eventDateTbd),
      venue: details.venue?.split(",")[0]?.trim().toLowerCase() || null,
      guests: details.guestCount ?? null,
      budget: details.budget?.trim().replace(/\s*-\s*/g, "–") || null,
    },
    missing: [
      ...(details.eventDateTbd || !details.eventDate ? ["date"] : []),
      ...(!details.venue?.trim() ? ["place"] : []),
    ],
    daysSinceLastClientMessage: inboundAt ? daysBetween(inboundAt, now) : null,
    lastInboundAt: inboundAt,
    lastInboundFrom: inbound ? inboundSender(inbound, details) : null,
    lastInboundGist: gist(inboundText),
    lastInboundQuestion: question(inboundText),
    lastOutboundAt: outboundAt,
    lastOutboundSubject: outbound?.subject?.trim() || null,
    lastOutboundGist: outbound ? gist(plainText(outbound.body)) : null,
    othersOnThread: othersOnThread(input.messages, details),
    latestNote: note ? gist(note.body) : null,
    proposalStatus: proposal?.status ?? null,
    proposalTotal: proposal?.total_cents ? money(proposal.total_cents) : null,
    depositPaid,
    signedAt: proposal?.signed_at ?? null,
    paidTotal: paidCents > 0 ? money(paidCents) : null,
    balance: paidCents > 0 && left > 0 ? money(left) : null,
    balanceDue: paidCents > 0 && left > 0 ? balanceDueDay(details.eventDate) : null,
    callAt: upcomingCall,
    meetings,
  };

  const read = readSituation({
    ...base,
    now,
    details,
    proposal,
    inboundAt,
    outboundAt,
    outbound,
    upcomingCall,
    pastCall,
    pastMeeting,
    invoices,
    clientEmail,
  });
  return { ...base, ...read };
}

type ReadInput = Omit<
  InquirySummaryFacts,
  "situation" | "headline" | "nextMoveTitle" | "nextMoveNote"
> & {
  now: Date;
  details: InquirySummaryDetails;
  proposal: InquirySummaryProposal | null;
  inboundAt: string | null;
  outboundAt: string | null;
  outbound: InquiryMessageRow | null;
  upcomingCall: string | null;
  pastCall: string | null;
  pastMeeting: (InquirySummaryMeeting & { when: "past" | "upcoming" }) | null;
  invoices: InquirySummaryInvoice[] | undefined;
  clientEmail: string;
};

function readSituation(
  f: ReadInput,
): Pick<InquirySummaryFacts, "situation" | "headline" | "nextMoveTitle" | "nextMoveNote"> {
  const { now, client } = f;
  const them = client === "they" ? "them" : client;
  const day = (iso: string | null | undefined) => (iso ? dayWord(iso, now) : "");
  const on = (iso: string | null | undefined) => (iso ? `on ${dayWord(iso, now)}` : "");
  const theEvent = f.event.kind ? f.event.kind.replace(/^an? /, "the ") : "the event";
  const about = eventLine(f.event, now);
  const aboutBare = eventLine(f.event, now, false);
  const daysToEvent = f.event.date ? daysUntilDate(f.event.date, now) : null;
  const repliedAfter = Boolean(
    f.inboundAt && f.outboundAt && Date.parse(f.inboundAt) > Date.parse(f.outboundAt),
  );
  const proposal = f.proposal;
  const total = f.proposalTotal ? `${f.proposalTotal} ` : "";
  // a paid deposit books it, whether or not the stage has caught up
  const booked = f.status === "booked" || Boolean(proposal?.paid_cents);

  if (f.status === "closed") {
    const reason = f.details.closedReason?.trim();
    return {
      situation: "archived",
      headline: `archived${f.details.closedAt ? ` ${on(f.details.closedAt)}` : ""}${reason ? `: ${reason.replace(/[.\s]+$/, "")}.` : "."}`,
      nextMoveTitle: "nothing to do unless they write again",
      nextMoveNote: "an archived lead comes back if they reply on the thread.",
    };
  }

  if (f.details.detectionStatus === "candidate") {
    return {
      situation: "review",
      headline: `gmail thinks this could be an inquiry from ${f.lastInboundFrom ?? client}${f.lastInboundGist ? `: “${f.lastInboundGist}”` : "."}`,
      nextMoveTitle: "approve it if it's a real lead, or dismiss it so it stays out of the book",
      nextMoveNote: "nothing goes to them until you approve and write.",
    };
  }

  if (repliedAfter) {
    const who = f.lastInboundFrom ?? client;
    const someoneElse = who !== client;
    const after =
      proposal?.viewed_at && Date.parse(proposal.viewed_at) <= Date.parse(f.inboundAt!)
        ? ", after opening the proposal"
        : "";
    const said = f.lastInboundQuestion
      ? `${who} asked ${on(f.inboundAt)}${after}: “${f.lastInboundQuestion}”`
      : `${who} wrote ${on(f.inboundAt)}${after}${f.lastInboundGist ? `: “${f.lastInboundGist}”` : "."}`;
    const waited = f.daysSinceLastClientMessage ?? 0;
    return {
      situation: "reply_owed",
      headline: withOthers(
        said,
        f.othersOnThread.filter((name) => name !== who),
      ),
      nextMoveTitle:
        waited >= 2
          ? `reply today, they've been waiting since ${day(f.inboundAt)}`
          : someoneElse
            ? `reply to ${who} and keep ${them} on the thread`
            : f.lastInboundQuestion
              ? "answer their question while it's fresh"
              : "write back while it's warm",
      nextMoveNote: "they wrote after your last letter.",
    };
  }

  if (!f.contacted && !proposal) {
    const waited = f.daysSinceLastClientMessage ?? 0;
    const missing = f.missing.length ? ` no ${f.missing.join(" or ")} yet.` : "";
    const ask = f.missing.length ? ` and ask for the ${f.missing.join(" and ")}` : "";
    return {
      situation: "new_unanswered",
      headline: `${client} wrote in ${on(f.inboundAt ?? f.details.receivedAt)}${about ? ` about ${about}` : ""}.${missing}`,
      nextMoveTitle:
        daysToEvent != null && daysToEvent >= 0 && daysToEvent <= 45
          ? `write back today${ask}, their date is close`
          : waited >= 2
            ? `write back today${ask}, they've been waiting since ${day(f.inboundAt ?? f.details.receivedAt)}`
            : ask
              ? `write back today${ask}`
              : "write back today, a same-day reply keeps the date",
      nextMoveNote: "no one from the studio has written yet.",
    };
  }

  if (daysToEvent != null && daysToEvent < 0) {
    return booked
      ? {
          situation: "event_past_booked",
          headline: `${theEvent} was ${on(f.event.date)}${f.event.venue ? ` at ${f.event.venue}` : ""}.`,
          nextMoveTitle: "send a thank-you, ask for photos, and close it out",
          nextMoveNote: "the day is done.",
        }
      : {
          situation: "event_past_open",
          headline: `their date (${day(f.event.date)}) has passed and it never booked.`,
          nextMoveTitle: "archive it, or check in once in case plans moved",
          nextMoveNote: "the date on file is behind us.",
        };
  }

  if (booked || proposal?.status === "accepted") {
    const unpaid = f.depositPaid === false;
    if (!booked && f.signedAt) {
      return {
        situation: "proposal_signed",
        headline: `${client} accepted the ${total}proposal and signed the agreement ${on(f.signedAt)}. the deposit isn't paid yet.`,
        nextMoveTitle: "check in about the deposit, it books them the moment it's paid",
        nextMoveNote: "the invoice is waiting on their proposal link.",
      };
    }
    if (!booked) {
      return {
        situation: "proposal_accepted",
        headline: `${client} accepted the ${total}proposal${proposal?.accepted_at ? ` ${on(proposal.accepted_at)}` : ""} but hasn't signed the agreement yet.`,
        nextMoveTitle: unpaid
          ? "nudge them to sign the agreement, then the deposit"
          : "nudge them to sign the agreement so they can pay the deposit",
        nextMoveNote: "the date isn't held until they sign and pay.",
      };
    }
    if (unpaid) {
      return {
        situation: "booked_unpaid",
        headline: `booked for ${aboutBare || "their date"}, but the deposit isn't paid yet.`,
        nextMoveTitle: "check in about the deposit so the date is truly held",
        nextMoveNote: "the invoice is still open.",
      };
    }
    if (daysToEvent != null && daysToEvent <= 14) {
      return {
        situation: "event_soon",
        headline: `${theEvent} is ${on(f.event.date)}${f.event.venue ? ` at ${f.event.venue}` : ""}, under two weeks away.`,
        nextMoveTitle: "confirm the final details: timing, load-in, and final counts",
        nextMoveNote: "the day is close.",
      };
    }
    if (f.paidTotal) {
      const paidWhen = proposal?.paid_at ? ` ${on(proposal.paid_at)}` : "";
      return {
        situation: "booked",
        headline: f.balance
          ? `${client} signed and paid the ${f.paidTotal} deposit${paidWhen}. they're booked for ${aboutBare || "their date"}, with ${f.balance} due ${f.balanceDue ? day(f.balanceDue) : "before the event"}.`
          : `${client} signed and paid in full${paidWhen}. they're booked for ${aboutBare || "their date"}.`,
        nextMoveTitle:
          f.event.tbd || !f.event.date
            ? "lock in the date with them"
            : f.balance
              ? "the date is held, the balance reminders go out on their own"
              : "the date is held, production lives in the project now",
        nextMoveNote: "this is a project now.",
      };
    }
    return {
      situation: "booked",
      headline: `booked: ${aboutBare || "the date is on file"}${f.depositPaid ? ". deposit paid." : "."}`,
      nextMoveTitle:
        f.event.tbd || !f.event.date
          ? "lock in the date with them"
          : "the date is held, production lives in the project now",
      nextMoveNote: "this is a project now.",
    };
  }

  if (proposal) {
    if (proposal.status === "declined") {
      const reason = proposal.declined_reason?.trim();
      return {
        situation: "proposal_declined",
        headline: `${client} passed on the ${total}proposal${proposal.declined_at ? ` ${on(proposal.declined_at)}` : ""}${reason ? `: “${reason}”` : "."}`,
        nextMoveTitle: "ask if a smaller version would work, or archive it",
        nextMoveNote: "a declined proposal can still turn into a smaller job.",
      };
    }
    const validUntil = proposal.valid_until
      ? daysUntilDate(proposal.valid_until.slice(0, 10), now)
      : null;
    if (proposal.status !== "draft" && validUntil != null && validUntil < 0) {
      return {
        situation: "proposal_expired",
        headline: `the ${total}proposal expired ${on(proposal.valid_until)} without an answer.`,
        nextMoveTitle: "re-send it with fresh dates, or archive it",
        nextMoveNote: "the offer on the page has lapsed.",
      };
    }
    const expiring =
      validUntil != null && validUntil <= 7 ? `, it's good until ${day(proposal.valid_until)}` : "";
    if (proposal.status === "draft") {
      return {
        situation: "proposal_draft",
        headline: `a ${total}proposal is drafted for ${them} but hasn't gone out.`,
        nextMoveTitle: "finish and send it while the conversation is warm",
        nextMoveNote: "they haven't seen a number yet.",
      };
    }
    if (proposal.status === "viewed" || proposal.viewed_at) {
      const opened = proposal.viewed_at ?? proposal.sent_at ?? proposal.created_at;
      const days = daysBetween(opened, now) ?? 0;
      return {
        situation: "proposal_opened",
        headline: `${client} opened the ${total}proposal ${on(opened)} and hasn't replied.`,
        nextMoveTitle:
          days >= 4
            ? `follow up and ask what they think or what they'd change${expiring}`
            : `give them a day or two, then follow up${expiring}`,
        nextMoveNote: "they've seen the number.",
      };
    }
    const sent = proposal.sent_at ?? proposal.created_at;
    const days = daysBetween(sent, now) ?? 0;
    return {
      situation: "proposal_unopened",
      headline: `the ${total}proposal went to ${them} ${on(sent)} and hasn't been opened.`,
      nextMoveTitle:
        days >= 3
          ? `send a short note to make sure it landed${expiring}`
          : `give them a few days to look${expiring}`,
      nextMoveNote: "the link hasn't been opened yet.",
    };
  }

  if (f.upcomingCall) {
    const budget = f.event.budget ? ` (${f.event.budget})` : "";
    return {
      situation: "call_booked",
      headline: `${client} booked a call for ${callWord(f.upcomingCall)}${aboutBare ? ` about ${aboutBare}` : ""}.`,
      nextMoveTitle: `come ready with their notes, the budget${budget}, and the space`,
      nextMoveNote: "the call is on the calendar.",
    };
  }

  if (f.pastCall || f.pastMeeting) {
    const at = f.pastMeeting?.occurred_at ?? f.pastCall!;
    const takeaway = gist(f.pastMeeting?.summary ?? "", 90);
    return {
      situation: "call_done",
      headline: `you met with ${them} ${on(at)}${takeaway ? `: “${takeaway}”` : "."}`,
      nextMoveTitle: "send the proposal while the conversation is fresh",
      nextMoveNote: "the call is behind you and nothing has gone out since.",
    };
  }

  if (f.outbound && f.outboundAt) {
    const days = daysBetween(f.outboundAt, now) ?? 0;
    const text = `${f.outbound.subject ?? ""}\n${f.outbound.body ?? ""}`.toLowerCase();
    if (/let's connect|lets connect|calendar link|schedule time|\/schedule\b/.test(text)) {
      return {
        situation: days >= 14 ? "gone_cold" : "connect_waiting",
        headline: `you sent the let's connect letter ${on(f.outboundAt)}. ${client === "they" ? "they haven't" : `${client} hasn't`} booked a call or replied.`,
        nextMoveTitle:
          days >= 14
            ? "one last check-in, then archive it if it stays quiet"
            : days >= 5
              ? "send a gentle nudge with the calendar link"
              : "give them a few days to pick a time",
        nextMoveNote: "the letter asked them to book a call or send details.",
      };
    }
    const said = f.lastOutboundGist ? `: “${gist(f.lastOutboundGist, 80)}”` : ".";
    return {
      situation: days >= 21 ? "gone_cold" : days >= 7 ? "gone_quiet" : "studio_waiting",
      headline: withOthers(
        `you wrote ${on(f.outboundAt)} and haven't heard back${said}`,
        f.othersOnThread,
      ),
      nextMoveTitle:
        days >= 21
          ? "it's gone cold, send one last note or archive it"
          : days >= 7
            ? "send a gentle follow-up"
            : "wait for their reply",
      nextMoveNote: "the last letter is yours.",
    };
  }

  return {
    situation: "in_touch",
    headline: `in touch with ${them}${aboutBare ? ` about ${aboutBare}` : ""}.`,
    nextMoveTitle:
      f.status === "in_conversation"
        ? "send the proposal once the vision is clear"
        : "keep it going: scale, palette, and what the day needs",
    nextMoveNote: "the conversation is open.",
  };
}

export function inquirySummaryFingerprint(facts: InquirySummaryFacts) {
  return [
    facts.situation,
    facts.headline,
    facts.nextMoveTitle,
    facts.lastInboundGist ?? "",
    facts.lastOutboundGist ?? "",
    facts.latestNote ?? "",
  ].join("|");
}

export function inquirySummarySystemPrompt() {
  return `You write the two-line summary the founder of a floral studio reads at the top of each client record. It tells her what is happening with this client and what she should do next.

Use ONLY the facts JSON. Never invent a stage, proposal status, amount, meeting, call, date, or message. If a field is null or missing, leave it out.

facts.draft is already correct. Keep its situation, its dates, and its next move. You may make it more specific with one detail from last_inbound_gist, last_inbound_question, latest_note, or meeting summaries, for example what they asked for or what is holding them back.

Line 1: what is happening with the client, specific and concrete.
Line 2: starts with "next: " and gives the one move, with a short reason when it helps.

Write dates exactly as they appear in the facts. Never write relative times like "3 days ago" or "yesterday", because the summary is saved and read later.
If contacted is true, never say they have not been contacted.

Voice: warm, direct, plain, all lowercase, no greeting, no markdown, no quotes around the answer, no exclamation marks. At most 300 characters in total.

Return only the two lines.`;
}

export function formatInquirySummaryUserMessage(facts: InquirySummaryFacts) {
  return `FACTS (do not add anything that is not here)\n${JSON.stringify(factsToPrompt(facts), null, 2)}`;
}

export function sanitizeInquirySummary(text: string) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#]+/g, "")
    .replace(/^["“']+|["”']+$/g, "")
    .trim();
  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  let summary = lines.join("\n").trim();
  if (summary.length > 360) summary = `${summary.slice(0, 359).trim()}…`;
  return summary;
}

export function fallbackInquirySummary(facts: InquirySummaryFacts) {
  return sanitizeInquirySummary(`${facts.headline}\nnext: ${facts.nextMoveTitle}.`);
}

export function summaryTextIsStale(
  text: string | null | undefined,
  facts: InquirySummaryFacts,
  generatedAt?: string | null,
  now = new Date(),
) {
  if (!text) return false;
  if (text === NEW_LEAD_SUMMARY) return true;
  if (
    /hasn['’]t been contacted|has not been contacted|not been contacted yet/i.test(text) &&
    (facts.contacted || facts.status !== "new")
  ) {
    return true;
  }
  // a saved line goes quiet or cold with time, so it is re-read once a day
  if (generatedAt && !Number.isNaN(Date.parse(generatedAt)))
    return now.getTime() - Date.parse(generatedAt) > DAY;
  return false;
}

export function resolveInquirySummaryText(facts: InquirySummaryFacts) {
  return fallbackInquirySummary(facts);
}

function factsToPrompt(facts: InquirySummaryFacts) {
  return {
    draft: fallbackInquirySummary(facts),
    situation: facts.situation,
    stage: facts.stage,
    status: facts.status,
    contacted: facts.contacted,
    client_first_name: facts.client,
    event: facts.event,
    missing: facts.missing,
    last_inbound_from: facts.lastInboundFrom,
    last_inbound_gist: facts.lastInboundGist,
    last_inbound_question: facts.lastInboundQuestion,
    last_outbound_subject: facts.lastOutboundSubject,
    last_outbound_gist: facts.lastOutboundGist,
    others_on_thread: facts.othersOnThread,
    latest_note: facts.latestNote,
    proposal_status: facts.proposalStatus,
    proposal_total: facts.proposalTotal,
    deposit_paid: facts.depositPaid,
    agreement_signed_at: facts.signedAt,
    paid_so_far: facts.paidTotal,
    balance_left: facts.balance,
    balance_due: facts.balanceDue,
    meetings: facts.meetings.map((meeting) => ({
      title: meeting.title,
      when: meeting.when,
      summary: meeting.summary ? gist(meeting.summary, 240) : null,
    })),
    next_move: facts.nextMoveTitle,
    next_move_why: facts.nextMoveNote,
  };
}

function eventLine(event: InquirySummaryFacts["event"], now: Date, withExtras = true) {
  const parts = [
    event.kind ?? "",
    event.date ? `on ${dayWord(event.date, now)}` : "",
    event.venue ? `at ${event.venue}` : "",
  ].filter(Boolean);
  const extras = withExtras
    ? [
        event.guests ? `${event.guests} guests` : "",
        event.budget ? `budget ${event.budget}` : "",
      ].filter(Boolean)
    : [];
  const line = parts.join(" ");
  return extras.length ? `${line}${line ? ", " : ""}${extras.join(", ")}` : line;
}

function withOthers(line: string, others: string[]) {
  if (!others.length || line.length > 200) return line;
  const names =
    others.length > 2
      ? `${others.slice(0, 2).join(", ")} and ${others.length - 2} more`
      : others.join(" and ");
  return `${line} ${names} ${others.length === 1 ? "is" : "are"} on the thread too.`;
}

function othersOnThread(messages: InquiryMessageRow[], details: InquirySummaryDetails) {
  const client = details.clientEmail?.trim().toLowerCase();
  const clientName = details.clientName?.trim().toLowerCase();
  const seen = new Set<string>();
  const names: string[] = [];
  for (const message of messages) {
    if (message.direction !== "inbound" || message.channel === "form") continue;
    const email = message.from_address?.trim().toLowerCase() ?? "";
    if (!email || email === client || email.endsWith("@saysukii.com")) continue;
    const name = message.author?.trim();
    const label =
      name && !name.includes("@") && name.toLowerCase() !== clientName
        ? name.toLowerCase()
        : email.split("@")[0]!;
    if (seen.has(email)) continue;
    seen.add(email);
    names.push(label);
  }
  return names;
}

function inboundSender(message: InquiryMessageRow, details: InquirySummaryDetails) {
  const email = message.from_address?.trim().toLowerCase();
  const client = details.clientEmail?.trim().toLowerCase();
  if (!email || !client || email === client || message.channel === "form")
    return firstName(details.clientName) || null;
  const name = message.author?.trim();
  return name && !name.includes("@") ? name.toLowerCase() : (email.split("@")[0] ?? null);
}

function inboundBody(message: InquiryMessageRow) {
  if (message.channel === "form") return shareNote(message.body) || message.body;
  return clientReplyText(message.body ?? "");
}

function question(text: string) {
  const sentences = plainText(text).split(/(?<=[.?!])\s+/);
  const asked = sentences.find((sentence) => sentence.trim().endsWith("?"));
  return asked ? gist(asked, 110) : null;
}

function plainText(body: string | null | undefined) {
  return (body ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gist(body: string | null | undefined, max = 120) {
  const text = plainText(body);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function money(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function lastStudioLetter(messages: InquiryMessageRow[]) {
  return (
    byTime(messages.filter((item) => item.direction === "outbound" && item.channel !== "note")).at(
      -1,
    ) ?? null
  );
}

function byTime(messages: InquiryMessageRow[]) {
  return [...messages].sort(
    (left, right) => Date.parse(messageTime(left)) - Date.parse(messageTime(right)),
  );
}

function byNewest(proposals: InquirySummaryProposal[]) {
  return [...proposals].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );
}

function messageTime(message: Pick<InquiryMessageRow, "sent_at" | "created_at">) {
  return message.sent_at || message.created_at;
}

function daysBetween(iso: string, now: Date) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY));
}

/** Whole days from today to a calendar date, in the studio's time zone. Negative once it has passed. */
function daysUntilDate(date: string, now: Date) {
  const today = studioDate(now);
  const target = Date.parse(`${date.slice(0, 10)}T12:00:00Z`);
  const base = Date.parse(`${today}T12:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(base)) return null;
  return Math.round((target - base) / DAY);
}

function studioDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  return parts;
}

/** "oct 26", or "mar 14, 2027" outside this year. Dates only, so a saved line never goes out of date. */
function dayWord(value: string, now: Date) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = dateOnly ? "UTC" : STUDIO_ZONE;
  const year = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }).format(date);
  const thisYear = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_ZONE,
    year: "numeric",
  }).format(now);
  return date
    .toLocaleDateString("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      ...(year === thisYear ? {} : { year: "numeric" }),
    })
    .toLowerCase();
}

function callWord(value: string) {
  const date = new Date(value);
  const day = date.toLocaleDateString("en-US", {
    timeZone: STUDIO_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    timeZone: STUDIO_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} at ${time}`.toLowerCase();
}

/** the balance falls due 30 days before the event */
function balanceDueDay(eventDate: string | null | undefined) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventDate ?? "");
  if (!day) return null;
  return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) - 30))
    .toISOString()
    .slice(0, 10);
}
