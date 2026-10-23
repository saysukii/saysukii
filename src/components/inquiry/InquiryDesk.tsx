import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InquiryLeadPane } from "@/components/inquiry/InquiryLeadPane";
import { AddInquiry } from "@/components/portal/TodayHome";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDevPreviewPipeline, previewReviewDecision } from "@/lib/dev-preview";
import { formatDateNumeric } from "@/lib/money";
import {
  BOARD_COLUMNS,
  BOARD_REVIEW,
  EVENT_LABEL,
  confidenceLabel,
  daysWaiting,
  waitingLabel,
  waitingTone,
} from "@/lib/os/inquiry-desk";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import {
  createAdminInquiry,
  listInquiryPipeline,
  reviewDetectedInquiry,
  type InquiryPipelineItem,
} from "@/lib/os/inquiries.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

export function InquiryDesk({ selectedId }: { selectedId?: string }) {
  const devPreview = useDevPreview();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchInquiries = useServerFn(listInquiryPipeline);
  const saveInquiry = useServerFn(createAdminInquiry);
  const reviewInquiry = useServerFn(reviewDetectedInquiry);
  const [adding, setAdding] = useState(false);
  const [reading, setReading] = useState<InquiryPipelineItem | null>(null);

  const {
    data: inquiries = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["inquiry-pipeline", devPreview],
    queryFn: () => (devPreview ? getDevPreviewPipeline() : fetchInquiries()),
  });

  const review = useMemo(
    () =>
      inquiries
        .filter(BOARD_REVIEW.match)
        .sort((left, right) => daysWaiting(right.received_at) - daysWaiting(left.received_at)),
    [inquiries],
  );
  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((column) => ({
        ...column,
        items: inquiries
          .filter(column.match)
          .sort((left, right) => daysWaiting(right.received_at) - daysWaiting(left.received_at)),
      })),
    [inquiries],
  );
  const calendarMarks = useMemo(
    () =>
      [
        ...new Set(
          inquiries
            .filter((inquiry) => inquiry.event_date && !inquiry.event_date_tbd)
            .map((inquiry) => inquiry.event_date as string),
        ),
      ],
    [inquiries],
  );

  const createInquiry = useMutation({
    mutationFn: (values: InquiryFormValues) => {
      if (devPreview) {
        toast.message("Preview mode — inquiry not saved");
        return Promise.resolve({ id: "preview" });
      }
      return saveInquiry({ data: values });
    },
    onSuccess: async (result) => {
      toast.success("inquiry added");
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      if (result.id && result.id !== "preview") {
        await navigate({ to: "/pipeline/$id", params: { id: result.id } });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decide = useMutation({
    mutationFn: async (decision: "approve" | "dismiss") => {
      if (!reading) throw new Error("nothing to review");
      if (devPreview) {
        previewReviewDecision(reading.id, decision);
        return { ok: true as const, decision };
      }
      return reviewInquiry({ data: { id: reading.id, decision } });
    },
    onSuccess: async (result) => {
      setReading(null);
      toast.success(result.decision === "approve" ? "in the book — waiting" : "left off the book");
      await queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const waitingCount = inquiries.filter(
    (inquiry) => !isReviewCandidate(inquiry) && ["new", "contacted", "in_conversation"].includes(inquiry.status),
  ).length;
  const proposalCount = inquiries.filter((inquiry) => inquiry.status === "proposal_sent").length;

  const note =
    inquiries.length === 0
      ? "nobody is waiting. good place to be."
      : `${waitingCount} waiting · ${proposalCount} proposal sent`;

  if (selectedId) {
    return (
      <div className="studio-home is-book is-record">
        <InquiryLeadPane key={selectedId} id={selectedId} />
      </div>
    );
  }

  return (
    <div className="studio-home is-book">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">the book</p>
          <h1>inquiries</h1>
          <p>{isPending ? "gathering the book…" : note}</p>
        </div>
        <div className="studio-home-hello-go">
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add inquiry
          </button>
        </div>
      </header>

      {isError ? <p className="studio-pearl-note">the inquiry board is for studio admins.</p> : null}
      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {!isPending && inquiries.length === 0 ? <p className="studio-empty">nobody is waiting. good place to be.</p> : null}

      {!isPending && inquiries.length > 0 ? (
        <div className="studio-book-body">
          {review.length > 0 ? <ReviewStrip items={review} onOpen={setReading} /> : null}
          <div className="studio-kanban is-glass">
            <div className="studio-kanban-lanes">
              {columns.map((column) => (
                <section key={column.id} className={cn("studio-kanban-lane", `is-${column.id}`)}>
                  <h2>
                    {column.label}
                    <span>{column.items.length}</span>
                  </h2>
                  <div className="studio-kanban-cards">
                    {column.items.length === 0 ? <p className="studio-kanban-empty">none here yet</p> : null}
                    {column.items.map((inquiry) => (
                      <BoardCard key={inquiry.id} inquiry={inquiry} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <AddInquiry
        open={adding}
        busy={createInquiry.isPending}
        marks={calendarMarks}
        onOpenChange={setAdding}
        onCreate={async (values) => {
          await createInquiry.mutateAsync(values);
        }}
      />
      <ReviewMessage
        inquiry={reading}
        busy={decide.isPending}
        onOpenChange={(open) => {
          if (!open) setReading(null);
        }}
        onDecide={(decision) => decide.mutate(decision)}
      />
    </div>
  );
}

function ReviewStrip({
  items,
  onOpen,
}: {
  items: InquiryPipelineItem[];
  onOpen: (inquiry: InquiryPipelineItem) => void;
}) {
  return (
    <section className="studio-book-review" aria-label="needs review">
      <p className="studio-home-label" title="flagged by studio intelligence">
        <span className="studio-summary-mark" aria-hidden="true" />
        needs review
        <span>{items.length}</span>
        <span className="sr-only">flagged by studio intelligence</span>
      </p>
      <div className="studio-book-review-rows">
        {items.map((inquiry) => (
            <button key={inquiry.id} type="button" className="studio-book-row" onClick={() => onOpen(inquiry)}>
              <span>
                <b>{inquiry.client?.name ?? "client"}</b>
                <em>{messagePreview(inquiry)}</em>
              </span>
              <small>{confidenceLabel(inquiry.detection_confidence) ?? "look"}</small>
            </button>
        ))}
      </div>
    </section>
  );
}

function ReviewMessage({
  inquiry,
  busy,
  onOpenChange,
  onDecide,
}: {
  inquiry: InquiryPipelineItem | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onDecide: (decision: "approve" | "dismiss") => void;
}) {
  const [pending, setPending] = useState<"approve" | "dismiss" | null>(null);
  const choice = useRef<"approve" | "dismiss" | null>(null);
  if (pending) choice.current = pending;
  const peek = inquiry?.source_peek;
  const when = messageWhen(inquiry?.received_at);
  const from = peek?.from_addr?.trim() || inquiry?.client?.email || "";
  const body = peek?.body?.trim() || inquiry?.message?.trim() || "the message isn't here yet.";
  const decision = pending ?? choice.current;
  const confirm =
    decision === "approve"
      ? "add this inquiry? it goes in as waiting."
      : decision === "dismiss"
        ? "skip this inquiry? it stays off the book."
        : "";

  useEffect(() => {
    setPending(null);
  }, [inquiry?.id]);

  return (
    <Dialog open={Boolean(inquiry)} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask is-soft" hideClose>
        <div className="studio-task-head">
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogTitle className="sr-only">{when || "a note from gmail"}</DialogTitle>
        <DialogDescription className="sr-only">the gmail message. add it to the book, or skip it.</DialogDescription>
        <div className="studio-task-form">
          <div className="studio-review-stack">
            {when ? <p className="studio-ask-hint is-when">{when}</p> : null}
            {from ? <p className="studio-ask-hint">from: {from}</p> : null}
          </div>
          <p className="studio-review-mail">{body}</p>
          <div className="studio-ask-foot is-pair is-spread">
            <button type="button" className="studio-ghost" disabled={busy} onClick={() => setPending("dismiss")}>
              skip this inquiry
            </button>
            <button type="button" className="studio-today-go" disabled={busy} onClick={() => setPending("approve")}>
              add this inquiry
            </button>
          </div>
        </div>
        <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
          <DialogContent
            overlayClassName="studio-task-veil z-[60]"
            className="studio-task-modal is-ask is-confirm is-soft z-[60]"
            hideClose
          >
            <div className="studio-task-head">
              <DialogClose className="studio-task-close" aria-label="Close">
                <X aria-hidden="true" />
              </DialogClose>
            </div>
            <DialogTitle className="sr-only">{confirm || "confirm"}</DialogTitle>
            <DialogDescription className="sr-only">confirm before the book changes.</DialogDescription>
            <div className="studio-task-form">
              <p className="studio-review-confirm">{confirm}</p>
              <div className="studio-ask-foot is-pair is-spread">
                <button type="button" className="studio-ghost" disabled={busy} onClick={() => setPending(null)}>
                  back
                </button>
                <button
                  type="button"
                  className="studio-today-go"
                  disabled={busy}
                  onClick={() => decision && onDecide(decision)}
                >
                  {busy ? "saving…" : decision === "approve" ? "yes, add it" : "yes, skip it"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function messagePreview(inquiry: InquiryPipelineItem) {
  const raw = inquiry.source_peek?.body?.trim() || inquiry.message?.trim() || "";
  return raw.replace(/\s+/g, " ");
}

function messageWhen(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${month}/${day}/${year} · ${time}`;
}

function glance(inquiry: InquiryPipelineItem) {
  const days = daysWaiting(inquiry.received_at);
  return {
    name: inquiry.client?.name ?? "client",
    event: EVENT_LABEL[inquiry.event_type],
    date: inquiry.event_date_tbd ? "tbd" : formatDateNumeric(inquiry.event_date),
    place: inquiry.venue_text?.split(",")[0]?.trim() ?? "",
    source: inquiry.source?.trim() || (inquiry.origin === "detected" ? "gmail" : inquiry.origin),
    wait: waitingLabel(days),
    tone: waitingTone(days),
  };
}

function BoardCard({ inquiry }: { inquiry: InquiryPipelineItem }) {
  const item = glance(inquiry);

  return (
    <Link to="/pipeline/$id" params={{ id: inquiry.slug }} className="studio-kanban-card is-glass is-labels">
      <header>
        <b>{item.name}</b>
        <small className={cn("studio-desk-wait", `is-${item.tone}`)}>{item.wait}</small>
      </header>
      <dl>
        <div>
          <dt>date</dt>
          <dd>{item.date}</dd>
        </div>
        {item.place ? (
          <div>
            <dt>place</dt>
            <dd>{item.place}</dd>
          </div>
        ) : null}
        <div>
          <dt>kind</dt>
          <dd>{item.event}</dd>
        </div>
      </dl>
      <em>{item.source}</em>
    </Link>
  );
}
