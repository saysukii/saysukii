import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { InquiryMessageRow } from "@/integrations/supabase/types";
import { getDevPreviewInquiryWorkspace, getDevPreviewPipeline } from "@/lib/dev-preview";
import { formatDate } from "@/lib/money";
import {
  BOARD_COLUMNS,
  BOARD_REVIEW,
  EVENT_LABEL,
  STATUS_LABEL,
  confidenceLabel,
  deskLane,
  daysWaiting,
  initials,
  inquiryTime,
  nextMove,
  sourceExcerpt,
  visionNote,
  waitingLabel,
  waitingTone,
} from "@/lib/os/inquiry-desk";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import {
  addInquiryMessage,
  getInquiryWorkspace,
  listInquiryPipeline,
  type InquiryPipelineItem,
} from "@/lib/os/inquiries.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

export const LAYOUT_STUDIES = [
  { id: "overview", label: "1 · overview" },
  { id: "correspondence", label: "2 · correspondence" },
  { id: "atelier", label: "3 · atelier" },
  { id: "board", label: "4 · board" },
] as const;

export type LayoutStudy = (typeof LAYOUT_STUDIES)[number]["id"];

export function InquiryLayoutExplore({
  layout,
  selectedId,
}: {
  layout: LayoutStudy;
  selectedId?: string;
}) {
  const devPreview = useDevPreview();
  const fetchInquiries = useServerFn(listInquiryPipeline);
  const { data: inquiries = [] } = useQuery({
    queryKey: ["inquiry-pipeline", devPreview],
    queryFn: () => (devPreview ? getDevPreviewPipeline() : fetchInquiries()),
  });

  const ordered = useMemo(
    () =>
      [...inquiries].sort((left, right) => daysWaiting(right.received_at) - daysWaiting(left.received_at)),
    [inquiries],
  );
  const fallbackId = ordered.find((item) => deskLane(item) === "waiting")?.id ?? ordered[0]?.id;
  const boardRecord = layout === "board" && Boolean(selectedId);
  const activeId = layout === "board" ? selectedId : (selectedId ?? fallbackId);

  const copy =
    layout === "overview"
      ? "record page: summary and activity in the center, details and notes on the right."
      : layout === "correspondence"
        ? "same chrome, but the center is the mail thread. notes stay on the details rail."
        : layout === "atelier"
          ? "same chrome, but the center is the studio journal. mail lives on the right with the facts."
          : boardRecord
            ? "atelier record. the board is one step back."
            : "kanban by stage. open a card for the client record; the board stays one step behind.";

  return (
    <div className={cn("studio-desk is-study", `is-${layout}`, boardRecord && "is-record")}>
      <header className="studio-desk-hello">
        <div>
          <p className="studio-home-label">
            {boardRecord ? (
              <Link to="/pipeline/explore" search={{ v: "board" }} className="studio-board-crumb">
                the board
              </Link>
            ) : (
              "layout study"
            )}
          </p>
          <h1>{boardRecord ? "client record" : "inquiries"}</h1>
          <p>{copy}</p>
        </div>
        <div className="studio-layout-switch">
          {boardRecord ? (
            <Link to="/pipeline/explore" search={{ v: "board" }} className="studio-today-go is-pearl">
              the board
            </Link>
          ) : null}
          {LAYOUT_STUDIES.map((item) => (
            <Link
              key={item.id}
              to="/pipeline/explore"
              search={{
                v: item.id,
                ...(item.id === "board" ? {} : { id: selectedId ?? fallbackId }),
              }}
              className={layout === item.id ? "is-on" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <Link to="/pipeline" activeOptions={{ exact: true }} className="studio-ghost">
            the board
          </Link>
        </div>
      </header>

      {layout === "board" && !boardRecord ? <InquiryBoard inquiries={ordered} /> : null}

      {layout !== "board" ? (
        <aside className="studio-record-names" aria-label="the book">
          {ordered.map((inquiry) => (
            <Link
              key={inquiry.id}
              to="/pipeline/explore"
              search={{ v: layout, id: inquiry.id }}
              className={cn("studio-record-name", inquiry.id === activeId && "is-on")}
            >
              <span className="studio-desk-avatar" aria-hidden="true">
                {initials(inquiry.client?.name)}
              </span>
              <span>
                <b>{inquiry.client?.name ?? "client"}</b>
                <em>{EVENT_LABEL[inquiry.event_type]}</em>
              </span>
              <small>{waitingLabel(daysWaiting(inquiry.received_at))}</small>
            </Link>
          ))}
        </aside>
      ) : null}

      {boardRecord && selectedId ? (
        <InquiryRecordCanvas key={`${selectedId}-atelier`} id={selectedId} layout="atelier" />
      ) : null}

      {layout !== "board" && activeId ? (
        <InquiryRecordCanvas key={`${layout}-${activeId}`} id={activeId} layout={layout} />
      ) : null}
    </div>
  );
}

function InquiryBoard({ inquiries }: { inquiries: InquiryPipelineItem[] }) {
  const columns = [BOARD_REVIEW, ...BOARD_COLUMNS].map((column) => ({
    ...column,
    items: inquiries.filter(column.match),
  }));

  return (
    <>
      <div className="studio-kanban-tally" aria-label="pipeline counts">
        {columns.map((column) => (
          <span key={column.id}>
            <b>{column.items.length}</b>
            {column.label}
          </span>
        ))}
      </div>
      <div className="studio-kanban">
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
    </>
  );
}

function BoardCard({ inquiry }: { inquiry: InquiryPipelineItem }) {
  const review = isReviewCandidate(inquiry);
  const days = daysWaiting(inquiry.received_at);
  const next = nextMove(inquiry.status);
  const confidence = confidenceLabel(inquiry.detection_confidence);
  const peek = sourceExcerpt(inquiry.source_peek?.subject, inquiry.source_peek?.body ?? inquiry.message, 96);
  const facts: Array<{ label: string; value: string }> = [
    {
      label: "date",
      value: inquiry.event_date_tbd ? "tbd" : formatDate(inquiry.event_date),
    },
    ...(inquiry.venue_text ? [{ label: "place", value: inquiry.venue_text }] : []),
    ...(inquiry.budget_range ? [{ label: "figure", value: inquiry.budget_range }] : []),
    {
      label: "source",
      value: inquiry.source?.trim() || (inquiry.origin === "detected" ? "gmail" : inquiry.origin),
    },
    {
      label: review ? "why" : "next",
      value: review ? inquiry.detection_reason || "needs a human look" : next.title,
    },
  ];

  return (
    <Link
      to="/pipeline/explore"
      search={{ v: "board", id: inquiry.id }}
      className={cn("studio-kanban-card", review && "is-review")}
    >
      <header>
        <span className="studio-desk-avatar" aria-hidden="true">
          {initials(inquiry.client?.name)}
        </span>
        <span>
          <b>{inquiry.client?.name ?? "client"}</b>
          <em>{EVENT_LABEL[inquiry.event_type]}</em>
        </span>
        <small className={cn("studio-desk-wait", !review && `is-${waitingTone(days)}`)}>
          {review ? confidence ?? waitingLabel(days) : waitingLabel(days)}
        </small>
      </header>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {review && peek ? <p>{peek}</p> : null}
    </Link>
  );
}

function InquiryRecordCanvas({ id, layout }: { id: string; layout: LayoutStudy }) {
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getInquiryWorkspace);
  const sendMessage = useServerFn(addInquiryMessage);
  const [channel, setChannel] = useState<"email" | "note">(layout === "atelier" ? "note" : "email");
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<InquiryMessageRow[]>([]);

  const { data, isPending } = useQuery({
    queryKey: ["os", "inquiry-workspace", id, devPreview],
    queryFn: () => (devPreview ? getDevPreviewInquiryWorkspace(id) : fetchWorkspace({ data: { id } })),
  });

  const post = useMutation({
    mutationFn: async (sendAs: "email" | "note") => {
      const body = draft.trim();
      if (!body) throw new Error("write something first");
      if (devPreview) {
        const lastMail = [...(data?.messages ?? [])]
          .reverse()
          .find((item) => item.channel === "email" || item.channel === "form");
        const threadId =
          [...(data?.messages ?? [])].reverse().find((item) => item.gmail_thread_id)?.gmail_thread_id ??
          "preview-thread";
        setLocalMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            inquiry_id: id,
            direction: sendAs === "email" ? "outbound" : "note",
            channel: sendAs,
            subject: sendAs === "email" ? (lastMail?.subject ? `Re: ${lastMail.subject.replace(/^re\s*:/i, "").trim()}` : "from say sukii") : null,
            body,
            from_address: sendAs === "email" ? "info@saysukii.com" : null,
            to_address: data?.client?.email ?? null,
            gmail_message_id: sendAs === "email" ? `preview-out-${Date.now()}` : null,
            gmail_thread_id: sendAs === "email" ? threadId : null,
            author: sendAs === "email" ? "say sukii" : "studio",
            sent_at: new Date().toISOString(),
            status: "sent",
            created_by: null,
            created_at: new Date().toISOString(),
          },
        ]);
        return { ok: true as const, channel: sendAs };
      }
      return sendMessage({ data: { inquiry_id: id, channel: sendAs, body } });
    },
    onSuccess: (result) => {
      setDraft("");
      toast.success(result.channel === "email" ? "sent" : "note kept on the lead");
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const messages = useMemo(
    () => [...(data?.messages ?? []), ...localMessages],
    [data?.messages, localMessages],
  );
  const mail = messages.filter((item) => item.channel !== "note");
  const notes = messages.filter((item) => item.channel === "note");

  if (isPending || !data?.inquiry) {
    return <p className="studio-empty">opening the job…</p>;
  }

  const { inquiry, client, gmailConnected } = data;
  const next = nextMove(inquiry.status);
  const candidate = isReviewCandidate(inquiry);
  const vision = visionNote(inquiry.message);
  const time = inquiryTime(inquiry.message);
  const canSendEmail = gmailConnected || devPreview;
  const askChannel = layout === "atelier" ? "note" : layout === "correspondence" ? "email" : channel;

  const fields: Array<{ label: string; value: string }> = [
    { label: "event", value: EVENT_LABEL[inquiry.event_type] },
    {
      label: "date",
      value: inquiry.event_date_tbd ? "tbd" : [formatDate(inquiry.event_date), time].filter(Boolean).join(" · "),
    },
    ...(inquiry.venue_text ? [{ label: "place", value: inquiry.venue_text }] : []),
    ...(inquiry.budget_range ? [{ label: "figure", value: inquiry.budget_range }] : []),
    ...(inquiry.guest_count ? [{ label: "guests", value: String(inquiry.guest_count) }] : []),
    { label: "stage", value: STATUS_LABEL[inquiry.status] },
    ...(client?.email ? [{ label: "email", value: client.email }] : []),
    ...(client?.phone ? [{ label: "phone", value: client.phone }] : []),
  ];

  function submit(sendAs: "email" | "note") {
    post.mutate(sendAs);
  }

  return (
    <>
      <section className="studio-record-main" aria-label="record">
        <header className="studio-record-hero">
          <span className="studio-desk-avatar is-lg" aria-hidden="true">
            {initials(client?.name)}
          </span>
          <div>
            <p className="studio-home-label">{EVENT_LABEL[inquiry.event_type]}</p>
            <h2>{client?.name ?? "client"}</h2>
            <p>
              {inquiry.event_date_tbd ? "date tbd" : [formatDate(inquiry.event_date), time].filter(Boolean).join(" · ")}
              {inquiry.venue_text ? ` · ${inquiry.venue_text}` : ""}
            </p>
          </div>
        </header>

        {layout === "overview" ? (
          <>
            <div className="studio-record-task">
              <p className="studio-home-label">{candidate ? "needs review" : "suggested task"}</p>
              <label>
                <input type="checkbox" disabled />
                <span>
                  <b>{candidate ? "is this a true inquiry?" : next.title}</b>
                  <em>{candidate ? inquiry.detection_reason : next.note}</em>
                </span>
              </label>
            </div>
            {vision ? (
              <section className="studio-record-copy">
                <p className="studio-home-label">the day</p>
                <p>{vision}</p>
              </section>
            ) : null}
            <section className="studio-record-activity">
              <p className="studio-home-label">activity</p>
              {messages.length === 0 ? <p className="studio-empty">nothing on this lead yet.</p> : null}
              {messages.map((item) => (
                <ActivityRow key={item.id} item={item} clientName={client?.name} />
              ))}
            </section>
            <AskBar
              channel={askChannel}
              onChannel={setChannel}
              draft={draft}
              onDraft={setDraft}
              pending={post.isPending}
              canSendEmail={canSendEmail}
              name={client?.name}
              showToggle
              onSubmit={() => submit(askChannel)}
            />
          </>
        ) : null}

        {layout === "correspondence" ? (
          <>
            <section className="studio-record-activity is-mail">
              <p className="studio-home-label">conversation</p>
              {mail.map((item) => (
                <MailBlock key={item.id} item={item} clientName={client?.name} />
              ))}
            </section>
            <AskBar
              channel="email"
              onChannel={setChannel}
              draft={draft}
              onDraft={setDraft}
              pending={post.isPending}
              canSendEmail={canSendEmail}
              name={client?.name}
              onSubmit={() => submit("email")}
            />
          </>
        ) : null}

        {layout === "atelier" ? (
          <>
            <section className="studio-record-activity is-notes">
              <p className="studio-home-label">studio journal</p>
              {notes.length === 0 ? (
                <p className="studio-empty">notes stay on the lead. they are never emailed.</p>
              ) : null}
              {notes.map((item) => (
                <ActivityRow key={item.id} item={item} clientName={client?.name} />
              ))}
            </section>
            <AskBar
              channel="note"
              onChannel={setChannel}
              draft={draft}
              onDraft={setDraft}
              pending={post.isPending}
              canSendEmail={canSendEmail}
              name={client?.name}
              onSubmit={() => submit("note")}
            />
          </>
        ) : null}
      </section>

      <aside className="studio-record-side" aria-label="details">
        <p className="studio-home-label">lead details</p>
        <dl className="studio-record-fields">
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>

        {layout === "atelier" ? (
          <section>
            <p className="studio-home-label">messages</p>
            <div className="studio-record-side-thread">
              {mail.map((item) => (
                <p key={item.id}>
                  <b>{item.channel === "form" ? "form" : item.direction === "outbound" ? "you" : client?.name}</b>
                  <span>{item.body}</span>
                </p>
              ))}
            </div>
          </section>
        ) : (
          <section>
            <p className="studio-home-label">notes</p>
            {notes.length === 0 ? <p className="studio-muted">no studio notes yet.</p> : null}
            {notes.map((item) => (
              <p key={item.id} className="studio-record-note">
                {item.body}
              </p>
            ))}
          </section>
        )}
      </aside>
    </>
  );
}

function AskBar({
  channel,
  onChannel,
  draft,
  onDraft,
  pending,
  canSendEmail,
  name,
  showToggle,
  onSubmit,
}: {
  channel: "email" | "note";
  onChannel: (value: "email" | "note") => void;
  draft: string;
  onDraft: (value: string) => void;
  pending: boolean;
  canSendEmail: boolean;
  name?: string | null;
  showToggle?: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      className="studio-record-ask"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {showToggle ? (
        <div className="studio-tabs">
          <button type="button" className={channel === "email" ? "is-on" : undefined} onClick={() => onChannel("email")}>
            email
          </button>
          <button type="button" className={channel === "note" ? "is-on" : undefined} onClick={() => onChannel("note")}>
            note
          </button>
        </div>
      ) : null}
      <textarea
        className="studio-textarea"
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        placeholder={channel === "email" ? `write to ${name ?? "them"}` : "a note only the studio will see."}
      />
      <div className="studio-composer-bar">
        <p>
          {channel === "note"
            ? "stays on this lead. never emailed."
            : "sends from the studio inbox onto this thread."}
        </p>
        <button
          type="submit"
          className="studio-today-go"
          disabled={pending || !draft.trim() || (channel === "email" && !canSendEmail)}
        >
          {channel === "email" ? "send" : "keep note"}
        </button>
      </div>
    </form>
  );
}

function ActivityRow({ item, clientName }: { item: InquiryMessageRow; clientName?: string | null }) {
  const who =
    item.channel === "form"
      ? "inquiry form"
      : item.channel === "note"
        ? "studio note"
        : item.direction === "outbound"
          ? "say sukii"
          : item.author || clientName || "client";
  return (
    <article className={cn("studio-record-row", item.channel === "note" && "is-note")}>
      <header>
        <b>{who}</b>
        <time>{formatWhen(item.sent_at || item.created_at)}</time>
      </header>
      {item.subject ? <em>{item.subject}</em> : null}
      <p>{item.body}</p>
    </article>
  );
}

function MailBlock({ item, clientName }: { item: InquiryMessageRow; clientName?: string | null }) {
  return <ActivityRow item={item} clientName={clientName} />;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
