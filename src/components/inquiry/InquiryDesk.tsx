import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { InquiryLeadPane } from "@/components/inquiry/InquiryLeadPane";
import { AddInquiry } from "@/components/portal/TodayHome";
import { getDevPreviewPipeline } from "@/lib/dev-preview";
import { formatDateNumeric } from "@/lib/money";
import {
  BOARD_COLUMNS,
  BOARD_REVIEW,
  EVENT_LABEL,
  confidenceLabel,
  daysWaiting,
  initials,
  waitingLabel,
  waitingTone,
} from "@/lib/os/inquiry-desk";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { createAdminInquiry, listInquiryPipeline, type InquiryPipelineItem } from "@/lib/os/inquiries.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

export function InquiryDesk({ selectedId }: { selectedId?: string }) {
  const devPreview = useDevPreview();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchInquiries = useServerFn(listInquiryPipeline);
  const saveInquiry = useServerFn(createAdminInquiry);
  const [adding, setAdding] = useState(false);

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
          {review.length > 0 ? <ReviewStrip items={review} /> : null}
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
    </div>
  );
}

function ReviewStrip({ items }: { items: InquiryPipelineItem[] }) {
  return (
    <section className="studio-book-review" aria-label="needs review">
      <p className="studio-home-label">
        needs review
        <span>{items.length}</span>
      </p>
      <div className="studio-book-review-rows">
        {items.map((inquiry) => {
          const event = EVENT_LABEL[inquiry.event_type];
          const date = inquiry.event_date_tbd ? "tbd" : formatDateNumeric(inquiry.event_date);
          const place = inquiry.venue_text?.split(",")[0]?.trim() ?? "";
          return (
            <Link key={inquiry.id} to="/pipeline/$id" params={{ id: inquiry.slug }} className="studio-book-row">
              <span className="studio-desk-avatar is-sm" aria-hidden="true">
                {initials(inquiry.client?.name)}
              </span>
              <span>
                <b>{inquiry.client?.name ?? "client"}</b>
                <em>{[event, place, date].filter(Boolean).join(" · ")}</em>
              </span>
              <small>{confidenceLabel(inquiry.detection_confidence) ?? "look"}</small>
            </Link>
          );
        })}
      </div>
    </section>
  );
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
