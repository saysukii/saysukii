import type { DetectionStatus, EventType, InquiryStatus } from "@/integrations/supabase/types";
import { isReviewCandidate } from "./inquiry-detection";

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "new",
  contacted: "in touch",
  in_conversation: "in touch",
  proposal_sent: "proposal sent",
  booked: "booked",
  closed: "archived",
};

export const EVENT_LABEL: Record<EventType, string> = {
  wedding: "wedding",
  brand_activation: "brand activation",
  corporate: "corporate",
  private: "private",
  photoshoot: "photoshoot",
  subscription: "subscription",
  other: "other",
};

export const PIPELINE_PATH: Array<{
  id: string;
  label: string;
  statuses: InquiryStatus[];
  apply: (current: InquiryStatus) => InquiryStatus;
}> = [
  { id: "new", label: "new", statuses: ["new"], apply: () => "new" },
  {
    id: "touch",
    label: "in touch",
    statuses: ["contacted", "in_conversation"],
    apply: (current) => (current === "new" ? "contacted" : "in_conversation"),
  },
  { id: "proposal", label: "proposal sent", statuses: ["proposal_sent"], apply: () => "proposal_sent" },
  { id: "booked", label: "booked", statuses: ["booked"], apply: () => "booked" },
];

export const PIPELINE_STEPS: InquiryStatus[] = PIPELINE_PATH.flatMap((step) => step.statuses);

export type BoardInquiry = { status: InquiryStatus; detection_status: DetectionStatus };

export const BOARD_REVIEW = {
  id: "review",
  label: "needs review",
  match: (inquiry: BoardInquiry) => isReviewCandidate(inquiry),
} as const;

export const BOARD_COLUMNS: Array<{
  id: string;
  label: string;
  match: (inquiry: BoardInquiry) => boolean;
}> = [
  {
    id: "new",
    label: "new",
    match: (inquiry) => !isReviewCandidate(inquiry) && inquiry.status === "new",
  },
  {
    id: "touch",
    label: "in touch",
    match: (inquiry) => inquiry.status === "contacted" || inquiry.status === "in_conversation",
  },
  {
    id: "proposal",
    label: "proposal sent",
    match: (inquiry) => inquiry.status === "proposal_sent",
  },
  {
    id: "booked",
    label: "booked",
    match: (inquiry) => inquiry.status === "booked",
  },
  {
    id: "archived",
    label: "archived",
    match: (inquiry) => inquiry.status === "closed",
  },
];

export function boardStageId(inquiry: BoardInquiry) {
  if (isReviewCandidate(inquiry)) return "new";
  return BOARD_COLUMNS.find((column) => column.match(inquiry))?.id ?? "new";
}

export type DeskGroup = "waiting" | "proposal" | "booked" | "closed";
export type DeskLane = "review" | DeskGroup;
export type DeskLaneFilter = "all" | DeskLane;

export const DESK_GROUPS: Array<{ id: DeskGroup; label: string }> = [
  { id: "waiting", label: "waiting" },
  { id: "proposal", label: "proposal sent" },
  { id: "booked", label: "booked" },
  { id: "closed", label: "archived" },
];

export const DESK_LANES: Array<{ id: DeskLane; label: string }> = [
  { id: "review", label: "needs review" },
  ...DESK_GROUPS,
];

export function deskGroup(status: InquiryStatus): DeskGroup {
  if (status === "proposal_sent") return "proposal";
  if (status === "booked") return "booked";
  if (status === "closed") return "closed";
  return "waiting";
}

export function deskLane(inquiry: { status: InquiryStatus; detection_status: string }): DeskLane {
  if (inquiry.detection_status === "candidate") return "review";
  return deskGroup(inquiry.status);
}

export function confidenceLabel(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Math.round(Number(value) * 100)}%`;
}

export function sourceExcerpt(subject: string | null | undefined, body: string | null | undefined, limit = 140) {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  const clipped = text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
  if (subject?.trim() && clipped) return `${subject.trim()} — ${clipped}`;
  return subject?.trim() || clipped;
}

export function daysWaiting(receivedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(receivedAt).getTime()) / 86_400_000));
}

export function waitingTone(days: number): "soft" | "due" | "late" {
  if (days >= 4) return "late";
  if (days >= 2) return "due";
  return "soft";
}

export function waitingLabel(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "s").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "s") + (parts[1]?.[0] ?? "")).toLowerCase();
}

export function visionNote(message: string | null | undefined) {
  if (!message) return "";
  return message
    .split("\n")
    .filter((line) => !/^(Size|Time|Recipient):/i.test(line.trim()))
    .join(" ")
    .trim();
}

export function inquiryTime(message: string | null | undefined) {
  return message?.match(/^Time:\s*(.+)$/m)?.[1]?.trim() ?? "";
}

const RECORD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecordUuid(value: string) {
  return RECORD_UUID.test(value);
}

export function recordSlug(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return slug || "client";
}

export function inquirySlugs(
  rows: Array<{ id: string; received_at: string; client: { name: string } | null }>,
) {
  const sorted = [...rows].sort(
    (left, right) => left.received_at.localeCompare(right.received_at) || left.id.localeCompare(right.id),
  );
  const taken = new Set<string>();
  const byId = new Map<string, string>();
  for (const row of sorted) {
    const base = recordSlug(row.client?.name ?? "client");
    let slug = base;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${base}${n}`;
      n += 1;
    }
    taken.add(slug);
    byId.set(row.id, slug);
  }
  return byId;
}

export function clientSlugs(rows: Array<{ id: string; name: string; created_at?: string }>) {
  const sorted = [...rows].sort(
    (left, right) =>
      (left.created_at ?? "").localeCompare(right.created_at ?? "") || left.id.localeCompare(right.id),
  );
  const taken = new Set<string>();
  const byId = new Map<string, string>();
  for (const row of sorted) {
    const base = recordSlug(row.name);
    let slug = base;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${base}${n}`;
      n += 1;
    }
    taken.add(slug);
    byId.set(row.id, slug);
  }
  return byId;
}

export function nextMove(status: InquiryStatus) {
  switch (status) {
    case "new":
      return {
        title: "reply first",
        note: "they wrote through the form. a same-day note keeps the date.",
        action: "write them",
        focus: "conversation" as const,
      };
    case "contacted":
      return {
        title: "stay in touch",
        note: "sit with scale, palette, and what the day needs to hold.",
        action: "add a note",
        focus: "conversation" as const,
      };
    case "in_conversation":
      return {
        title: "send proposal",
        note: "the vision is clear enough to price from the library.",
        action: "create proposal",
        focus: "proposal" as const,
      };
    case "proposal_sent":
      return {
        title: "waiting on them",
        note: "the proposal is out. follow up if the thread goes quiet.",
        action: "open proposal",
        focus: "proposal" as const,
      };
    case "booked":
      return {
        title: "the date is held",
        note: "this is a project now. production will live in its own space.",
        action: "see the work",
        focus: "proposal" as const,
      };
    case "closed":
      return {
        title: "archived",
        note: "they declined, went quiet, or this job is no longer moving.",
        action: "keep a note",
        focus: "conversation" as const,
      };
  }
}
