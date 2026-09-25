import type { InquiryRow, InquiryStatus, TaskRow } from "@/integrations/supabase/types";

/** Follow-ups open at the start of the 5–7 day quiet window. */
export const FOLLOW_UP_AFTER_DAYS = 5;

export type InquiryAutoKind = "reply" | "follow_up" | "write_proposal" | "proposal_follow_up";

export type InquiryAutoDraft = {
  kind: InquiryAutoKind;
  title: string;
  linked_type: "inquiry";
  linked_id: string;
  source: "auto";
  trigger_stage: InquiryStatus;
  due_at: string | null;
};

const TITLES: Record<InquiryAutoKind, string> = {
  reply: "send intake",
  follow_up: "follow up",
  write_proposal: "send proposal",
  proposal_follow_up: "follow up on proposal",
};

export function replyTaskTitle(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return TITLES.reply;
  return `reply to ${trimmed.toLowerCase()}`;
}

export function inquiryAutoKind(task: Pick<TaskRow, "title" | "trigger_stage">): InquiryAutoKind | null {
  if (task.trigger_stage === "new") return "reply";
  if (task.trigger_stage === "contacted") return "follow_up";
  if (task.trigger_stage === "in_conversation") return "write_proposal";
  if (task.trigger_stage === "proposal_sent") {
    if (task.title === "waiting on them") return null;
    return "proposal_follow_up";
  }
  return null;
}

export function daysSince(iso: string | null | undefined, now = new Date()) {
  if (!iso) return 0;
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(elapsed) || elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

function quietLongEnough(since: string | null | undefined, now: Date) {
  return daysSince(since, now) >= FOLLOW_UP_AFTER_DAYS;
}

function dueAt(from: string | null | undefined, now: Date) {
  if (!from) return now.toISOString();
  const due = new Date(from);
  due.setUTCDate(due.getUTCDate() + FOLLOW_UP_AFTER_DAYS);
  return due.toISOString();
}

function hasReplySinceContact(contactedAt: string | null, lastInboundAt: string | null | undefined) {
  if (!contactedAt || !lastInboundAt) return false;
  return new Date(lastInboundAt).getTime() > new Date(contactedAt).getTime();
}

export function desiredInquiryAutoTask(input: {
  inquiry: Pick<InquiryRow, "id" | "status" | "received_at" | "contacted_at" | "proposal_sent_at">;
  clientName?: string | null;
  lastInboundAt?: string | null;
  now?: Date;
}): InquiryAutoDraft | null {
  const now = input.now ?? new Date();
  const { inquiry } = input;

  if (inquiry.status === "new") {
    return {
      kind: "reply",
      title: replyTaskTitle(input.clientName),
      linked_type: "inquiry",
      linked_id: inquiry.id,
      source: "auto",
      trigger_stage: "new",
      due_at: inquiry.received_at,
    };
  }

  if (inquiry.status === "contacted") {
    if (hasReplySinceContact(inquiry.contacted_at, input.lastInboundAt)) return null;
    if (!quietLongEnough(inquiry.contacted_at, now)) return null;
    return {
      kind: "follow_up",
      title: TITLES.follow_up,
      linked_type: "inquiry",
      linked_id: inquiry.id,
      source: "auto",
      trigger_stage: "contacted",
      due_at: dueAt(inquiry.contacted_at, now),
    };
  }

  if (inquiry.status === "in_conversation") {
    return {
      kind: "write_proposal",
      title: TITLES.write_proposal,
      linked_type: "inquiry",
      linked_id: inquiry.id,
      source: "auto",
      trigger_stage: "in_conversation",
      due_at: inquiry.contacted_at ?? inquiry.received_at,
    };
  }

  if (inquiry.status === "proposal_sent") {
    if (!quietLongEnough(inquiry.proposal_sent_at, now)) return null;
    return {
      kind: "proposal_follow_up",
      title: TITLES.proposal_follow_up,
      linked_type: "inquiry",
      linked_id: inquiry.id,
      source: "auto",
      trigger_stage: "proposal_sent",
      due_at: dueAt(inquiry.proposal_sent_at, now),
    };
  }

  return null;
}

export function shouldSpawnInquiryAutoTask(
  desired: InquiryAutoDraft,
  existing: Array<Pick<TaskRow, "source" | "status" | "title" | "trigger_stage">>,
) {
  return !existing.some(
    (task) =>
      task.source === "auto" &&
      task.status === "done" &&
      inquiryAutoKind(task) === desired.kind,
  );
}

export function openInquiryAutoTasks(tasks: TaskRow[], inquiryId: string) {
  return tasks.filter(
    (task) =>
      task.source === "auto" &&
      task.status === "open" &&
      task.linked_type === "inquiry" &&
      task.linked_id === inquiryId,
  );
}
