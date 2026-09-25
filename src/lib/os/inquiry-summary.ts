import type {
  InquiryMessageRow,
  InquiryStatus,
  MeetingMatchStatus,
  ProposalStatus,
} from "@/integrations/supabase/types";
import { STATUS_LABEL, nextMove } from "@/lib/os/inquiry-desk";

export const NEW_LEAD_SUMMARY = "New inquiry — hasn't been contacted yet.";

export type InquirySummaryMeeting = {
  title: string;
  occurred_at: string;
  match_status: MeetingMatchStatus | string;
};

export type InquirySummaryProposal = {
  status: ProposalStatus | string;
  created_at: string;
};

export type InquirySummaryFacts = {
  status: InquiryStatus;
  stage: string;
  contacted: boolean;
  daysSinceLastClientMessage: number | null;
  lastInboundAt: string | null;
  lastInboundGist: string | null;
  proposalStatus: string | null;
  meetings: Array<InquirySummaryMeeting & { when: "past" | "upcoming" }>;
  nextMoveTitle: string;
  nextMoveNote: string;
};

export function lastClientMessage(messages: InquiryMessageRow[]) {
  return [...messages]
    .filter((item) => item.direction === "inbound" && item.channel !== "note")
    .sort(
      (left, right) =>
        Date.parse(messageTime(left)) - Date.parse(messageTime(right)),
    )
    .at(-1) ?? null;
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

export function buildInquirySummaryFacts(input: {
  status: InquiryStatus;
  contacted_at?: string | null;
  messages: InquiryMessageRow[];
  proposals: InquirySummaryProposal[];
  meetings?: InquirySummaryMeeting[];
  now?: Date;
}): InquirySummaryFacts {
  const now = input.now ?? new Date();
  const proposal = [...input.proposals].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  )[0];
  const inbound = lastClientMessage(input.messages);
  const inboundAt = inbound ? messageTime(inbound) : null;
  const next = nextMove(input.status);
  return {
    status: input.status,
    stage: STATUS_LABEL[input.status],
    contacted: Boolean(input.contacted_at) || input.messages.some((item) => item.direction === "outbound"),
    daysSinceLastClientMessage: inboundAt ? daysSince(inboundAt, now) : null,
    lastInboundAt: inboundAt,
    lastInboundGist: inbound ? gist(inbound.body) : null,
    proposalStatus: proposal?.status ?? null,
    meetings: (input.meetings ?? []).map((meeting) => ({
      ...meeting,
      when: Date.parse(meeting.occurred_at) > now.getTime() ? "upcoming" : "past",
    })),
    nextMoveTitle: next.title,
    nextMoveNote: next.note,
  };
}

export function inquirySummaryFingerprint(facts: InquirySummaryFacts) {
  return [
    facts.status,
    facts.contacted ? "1" : "0",
    facts.daysSinceLastClientMessage ?? "",
    facts.lastInboundAt ?? "",
    facts.lastInboundGist ?? "",
    facts.proposalStatus ?? "",
    facts.meetings.map((meeting) => `${meeting.occurred_at}:${meeting.title}:${meeting.match_status}`).join(","),
    facts.nextMoveTitle,
  ].join("|");
}

export function inquirySummarySystemPrompt() {
  return `You write a 1–2 line plain-language summary of one floral-studio engagement record for the founder.

Use ONLY the facts JSON. Ground the summary in known state. Never invent a stage, proposal status, meeting, or message. If a field is null or missing, omit it — do not guess.

State where they are on the path to booked and the single next move from facts.nextMoveTitle.

Voice: warm, specific, studio lowercase, no greeting, no markdown, no quotes around the answer.

Return only the summary text.`;
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
  if (isNewUncontactedLeadFromFacts(facts)) return NEW_LEAD_SUMMARY;

  const clauses = [facts.stage];
  if (facts.daysSinceLastClientMessage === 0) clauses.push("they wrote today");
  else if (facts.daysSinceLastClientMessage === 1) clauses.push("they wrote yesterday");
  else if (facts.daysSinceLastClientMessage != null) {
    clauses.push(`they last wrote ${facts.daysSinceLastClientMessage} days ago`);
  }
  if (facts.proposalStatus) clauses.push(`proposal ${proposalPhrase(facts.proposalStatus)}`);

  const upcoming = facts.meetings.find((meeting) => meeting.when === "upcoming");
  const recent = facts.meetings.find((meeting) => meeting.when === "past");
  if (upcoming) clauses.push(`upcoming ${upcoming.title}`);
  else if (recent) clauses.push(`last meeting: ${recent.title}`);

  const line1 = `${clauses.join(" — ")}.`;
  const shortGist =
    facts.lastInboundGist && facts.lastInboundGist.length <= 72 ? `they wrote: ${facts.lastInboundGist}. ` : "";
  const line2 = `${shortGist}next: ${facts.nextMoveTitle}.`;
  return sanitizeInquirySummary(`${line1}\n${line2}`);
}

export function resolveInquirySummaryText(facts: InquirySummaryFacts) {
  if (isNewUncontactedLeadFromFacts(facts)) return NEW_LEAD_SUMMARY;
  return fallbackInquirySummary(facts);
}

function isNewUncontactedLeadFromFacts(facts: InquirySummaryFacts) {
  return facts.status === "new" && !facts.contacted && !facts.proposalStatus;
}

function factsToPrompt(facts: InquirySummaryFacts) {
  return {
    stage: facts.stage,
    status: facts.status,
    days_since_last_client_message: facts.daysSinceLastClientMessage,
    proposal_status: facts.proposalStatus,
    last_inbound_gist: facts.lastInboundGist,
    meetings: facts.meetings.map((meeting) => ({
      title: meeting.title,
      occurred_at: meeting.occurred_at,
      when: meeting.when,
      match_status: meeting.match_status,
    })),
    next_move: facts.nextMoveTitle,
    next_move_note: facts.nextMoveNote,
  };
}

function proposalPhrase(status: string) {
  if (status === "proposal_sent" || status === "sent") return "sent";
  return status.replaceAll("_", " ");
}

function gist(body: string | null | undefined) {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 120 ? `${text.slice(0, 119).trim()}…` : text;
}

function messageTime(message: Pick<InquiryMessageRow, "sent_at" | "created_at">) {
  return message.sent_at || message.created_at;
}

function daysSince(iso: string, now: Date) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}
