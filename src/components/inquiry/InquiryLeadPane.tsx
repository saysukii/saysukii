import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { TextShimmer } from "@/components/core/text-shimmer";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StudioChip } from "@/components/portal/studio";
import type { InquiryMessageRow, InquiryStatus } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { getDevPreviewInquiryWorkspace, previewReviewDecision } from "@/lib/dev-preview";
import { formatDateNumeric, formatMoneyExact } from "@/lib/money";
import {
  EVENT_LABEL,
  PIPELINE_PATH,
  boardStageId,
  confidenceLabel,
  inquiryTime,
  nextMove,
  recordSlug,
  sourceExcerpt,
} from "@/lib/os/inquiry-desk";
import { saveClient } from "@/lib/os/clients.functions";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import {
  addInquiryMessage,
  attachInquiryFile,
  getInquiryWorkspace,
  reviewDetectedInquiry,
  setInquiryStatus,
} from "@/lib/os/inquiries.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

type Focus = "conversation" | "proposal" | "files";
export type LeadSurface = "full" | "job" | "mail" | "notes" | "activity" | "rail";

function prefersAppleMaps() {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return /Macintosh/.test(agent);
}

function mapsHref(place: string) {
  const query = encodeURIComponent(place);
  return prefersAppleMaps()
    ? `https://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function PlaceLink({ place }: { place: string }) {
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  const [href, setHref] = useState(google);
  useEffect(() => {
    setHref(mapsHref(place));
  }, [place]);
  return (
    <a className="studio-place" href={href} target="_blank" rel="noreferrer">
      {place}
    </a>
  );
}

const shimmer =
  "[--base-color:#ff4d94] [--base-gradient-color:#ff1493]";

function answeredVision(message: string | null) {
  return (message ?? "")
    .split("\n")
    .filter((line) => !/^(Size|Time|Recipient):/i.test(line.trim()))
    .join("\n")
    .trim();
}

function AnswerField({
  label,
  value,
  wide = false,
  lines = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  lines?: boolean;
}) {
  return (
    <label className={cn("studio-ask-field", wide && "studio-ask-span")}>
      <span className="studio-ask-label">{label}</span>
      {lines ? <textarea readOnly value={value} /> : <input readOnly value={value} />}
    </label>
  );
}

function ShimmerLabel({ children }: { children: string }) {
  return (
    <TextShimmer duration={1.2} className={shimmer}>
      {children}
    </TextShimmer>
  );
}

function NextMove({
  inquiryId,
  next,
  proposalId,
  onWrite,
}: {
  inquiryId: string;
  next: ReturnType<typeof nextMove>;
  proposalId?: string;
  onWrite: () => void;
}) {
  if (next.focus === "proposal") {
    return proposalId ? (
      <Link to="/proposals/$id" params={{ id: proposalId }} className="studio-next-go">
        <ShimmerLabel>{next.action}</ShimmerLabel>
      </Link>
    ) : (
      <Link to="/proposals/new" search={{ inquiry: inquiryId }} className="studio-next-go">
        <ShimmerLabel>{next.action}</ShimmerLabel>
      </Link>
    );
  }
  return (
    <button type="button" className="studio-next-go" onClick={onWrite}>
      <ShimmerLabel>{next.action}</ShimmerLabel>
    </button>
  );
}

function outgoingChannel(
  surface: LeadSurface,
  activityTab: "messages" | "notes",
  channel: "email" | "note",
): "email" | "note" {
  if (surface === "notes" || surface === "rail") return "note";
  if (surface === "mail") return "email";
  if (surface === "activity") return activityTab === "notes" ? "note" : "email";
  return channel;
}

function RecordHello({
  title,
  note,
  actions,
}: {
  title: string;
  note: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="studio-home-hello">
      <div>
        <Link to="/pipeline" activeOptions={{ exact: true }} className="studio-record-back" aria-label="back to the book">
          <ArrowLeft aria-hidden="true" strokeWidth={1.5} />
        </Link>
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
      {actions ? <div className="studio-home-hello-go">{actions}</div> : null}
    </header>
  );
}

export function InquiryLeadPane({
  id,
  surface = "full",
}: {
  id: string;
  surface?: LeadSurface;
}) {
  const devPreview = useDevPreview();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getInquiryWorkspace);
  const sendMessage = useServerFn(addInquiryMessage);
  const saveFile = useServerFn(attachInquiryFile);
  const updateStatus = useServerFn(setInquiryStatus);
  const reviewCandidate = useServerFn(reviewDetectedInquiry);
  const submitClient = useServerFn(saveClient);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "" });
  const [focus, setFocus] = useState<Focus>("conversation");
  const [channel, setChannel] = useState<"email" | "note">(surface === "notes" || surface === "rail" ? "note" : "email");
  const [activityTab, setActivityTab] = useState<"messages" | "notes">("messages");
  const [draft, setDraft] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [localMessages, setLocalMessages] = useState<InquiryMessageRow[]>([]);
  const [localFiles, setLocalFiles] = useState<Array<{ id: string; name: string }>>([]);

  const { data, isPending, isError } = useQuery({
    queryKey: ["os", "inquiry-workspace", id, devPreview],
    queryFn: () => (devPreview ? getDevPreviewInquiryWorkspace(id) : fetchWorkspace({ data: { id } })),
  });
  const inquiryId = data?.inquiry.id ?? id;

  useEffect(() => {
    if (!data?.slug || data.slug === id) return;
    void navigate({ to: "/pipeline/$id", params: { id: data.slug }, replace: true });
  }, [data?.slug, id, navigate]);

  const move = useMutation({
    mutationFn: (args: { status: InquiryStatus; closed_reason?: string }) => {
      if (devPreview) {
        toast.message("preview mode — status not saved");
        return Promise.resolve({ ok: true as const });
      }
      return updateStatus({
        data: { id: inquiryId, status: args.status, closed_reason: args.closed_reason ?? "" },
      });
    },
    onSuccess: () => {
      toast.success("lead updated");
      setClosing(false);
      setCloseReason("");
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const review = useMutation({
    mutationFn: async (decision: "approve" | "dismiss") => {
      if (devPreview) {
        previewReviewDecision(inquiryId, decision);
        return { ok: true as const, decision };
      }
      return reviewCandidate({ data: { id: inquiryId, decision } });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
      if (result.decision === "dismiss") {
        toast.success("left off the book");
        void navigate({ to: "/pipeline" });
        return;
      }
      toast.success("in the book — waiting");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const keepClient = useMutation({
    mutationFn: async () => {
      const current = data?.client;
      if (!current) throw new Error("this client could not be opened.");
      const name = clientForm.name.trim();
      const email = clientForm.email.trim();
      if (!name || !email) throw new Error("name and email hold the record.");
      if (devPreview) {
        toast.message("preview mode — client not saved");
        return current;
      }
      return submitClient({
        data: {
          id: current.id,
          name,
          email,
          phone: clientForm.phone,
          organization: current.organization,
          type: current.type,
          source: current.source,
          notes: current.notes,
        },
      });
    },
    onSuccess: () => {
      if (!devPreview) toast.success("client updated");
      setClientFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const post = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body) throw new Error("write a note first");
      const sendAs = outgoingChannel(surface, activityTab, channel);
      if (devPreview) {
        const lastMail = [...(data?.messages ?? [])].reverse().find((item) => item.channel === "email" || item.channel === "form");
        const threadId = [...(data?.messages ?? [])].reverse().find((item) => item.gmail_thread_id)?.gmail_thread_id ?? "preview-thread";
        setLocalMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            inquiry_id: inquiryId,
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
      return sendMessage({ data: { inquiry_id: inquiryId, channel: sendAs, body } });
    },
    onSuccess: (result) => {
      setDraft("");
      if (result.channel === "email") toast.success("sent");
      else toast.success("note kept on the lead");
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const messages = useMemo(
    () => [...(data?.messages ?? []), ...localMessages],
    [data?.messages, localMessages],
  );
  const sendAs = outgoingChannel(surface, activityTab, channel);
  const visibleMessages = messages.filter((item) => {
    if (surface === "notes" || surface === "rail" || (surface === "activity" && activityTab === "notes")) {
      return item.channel === "note";
    }
    if (surface === "mail" || (surface === "activity" && activityTab === "messages")) {
      return item.channel !== "note";
    }
    return true;
  });

  if (isPending) {
    return (
      <>
        <RecordHello title="client record" note="opening the job…" />
        <p className="studio-empty">opening the job…</p>
      </>
    );
  }

  if (isError || !data?.inquiry) {
    return (
      <>
        <RecordHello title="client record" note="this lead could not be opened." />
        <p className="studio-pearl-note">this lead could not be opened.</p>
      </>
    );
  }

  const { inquiry, client, proposals, files, gmailConnected, source_message } = data;
  const time = inquiryTime(inquiry.message);
  const next = nextMove(inquiry.status);
  const latestProposal = proposals[0];
  const allFiles = [...files, ...localFiles.map((file) => ({ ...file, signed_url: null, created_at: "" }))];
  const candidate = isReviewCandidate(inquiry);
  const peek = sourceExcerpt(source_message?.subject, source_message?.body ?? inquiry.message, 280);
  const confidence = confidenceLabel(inquiry.detection_confidence);
  const stage = boardStageId(inquiry);
  const eventWhen = inquiry.event_date_tbd
    ? "tbd"
    : [formatDateNumeric(inquiry.event_date), time].filter(Boolean).join(" · ");
  const when = inquiry.event_date_tbd
    ? "date tbd"
    : [formatDateNumeric(inquiry.event_date), time].filter(Boolean).join(" · ");
  const place = inquiry.venue_text?.split(",")[0]?.trim() ?? "";
  const helloNote = [when, place].filter(Boolean).join(" · ") || "the job, the thread, and the next move.";

  function chooseStatus(status: InquiryStatus) {
    if (status === "closed") {
      setClosing(true);
      return;
    }
    setClosing(false);
    move.mutate({ status });
  }

  const showJob = surface === "full" || surface === "job";
  const showStack = surface === "full";
  const showSideThread = surface === "mail" || surface === "notes" || surface === "activity" || surface === "rail";

  const threadOpen = showSideThread || (showStack && focus === "conversation");
  const offerOpen = showStack && focus === "proposal";
  const filesOpen = showStack && focus === "files";

  return (
    <div className={cn("studio-lead", `is-${stage}`, "is-layout-workflow", showSideThread && "is-side")}>
      {showJob ? (
      <>
      <div className="studio-lead-top is-mast">
      <RecordHello
        title={client?.name ?? "client"}
        note={<ShimmerLabel>{helloNote}</ShimmerLabel>}
        actions={
          candidate ? null : (
            <Link to="/proposals/new" search={{ inquiry: inquiry.id }} className="studio-today-go">
              create proposal
            </Link>
          )
        }
      />

      <div className="studio-lead-tags">
        <span className="studio-tag">{EVENT_LABEL[inquiry.event_type]}</span>
        {candidate ? <span className="studio-tag">needs review</span> : null}
        {inquiry.source ? <span className="studio-tag">{inquiry.source}</span> : null}
      </div>

      {candidate ? null : (
      <ol className="studio-steps" aria-label="job path">
        {PIPELINE_PATH.map((step) => {
          const on = step.statuses.includes(inquiry.status);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={cn(`is-${step.id}`, on && "is-on", inquiry.status === "closed" && "is-dim")}
                disabled={move.isPending || on}
                onClick={() => chooseStatus(step.apply(inquiry.status))}
              >
                {on ? <i className="studio-pill-dot" aria-hidden="true" /> : null}
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
      )}
      </div>

      {inquiry.status === "closed" ? (
        <p className="studio-muted">{inquiry.closed_reason || "this inquiry is archived."}</p>
      ) : null}

      {closing ? (
        <div className="studio-module studio-lead-close">
          <p className="studio-home-label">archive</p>
          <h3>why this one is ending</h3>
          <label className="studio-field">
            <span>reason</span>
            <textarea
              className="studio-textarea"
              value={closeReason}
              onChange={(event) => setCloseReason(event.target.value)}
              maxLength={1000}
              placeholder="declined, went quiet, timing, budget…"
            />
          </label>
          <div className="studio-views">
            <button
              type="button"
              className="studio-today-go"
              disabled={move.isPending || !closeReason.trim()}
              onClick={() => move.mutate({ status: "closed", closed_reason: closeReason.trim() })}
            >
              archive
            </button>
            <button type="button" className="studio-ghost" onClick={() => setClosing(false)}>
              keep in motion
            </button>
          </div>
        </div>
      ) : null}

      {!candidate && inquiry.summary_text ? (
        <section className="studio-module is-summary">
          <p className="studio-home-label" title="written by studio intelligence">
            <span className="studio-summary-mark" aria-hidden="true" />
            <span>summary</span>
            <span className="sr-only">written by studio intelligence</span>
          </p>
          <p>{inquiry.summary_text}</p>
        </section>
      ) : null}

      {candidate ? (
        <section className="studio-module is-next">
          <p className="studio-home-label">needs review</p>
          <h3>is this a true inquiry?</h3>
          <p>
            {inquiry.detection_reason || "gmail thinks this is a lead. it stays out of the book until you say so."}
            {confidence ? ` · ${confidence} confident` : ""}
          </p>
          {peek ? <p className="studio-muted">{peek}</p> : null}
          <div className="studio-views">
            <button
              type="button"
              className="studio-today-go"
              disabled={review.isPending}
              onClick={() => review.mutate("approve")}
            >
              approve
            </button>
            <button
              type="button"
              className="studio-ghost"
              disabled={review.isPending}
              onClick={() => review.mutate("dismiss")}
            >
              dismiss
            </button>
          </div>
        </section>
      ) : (
      <section className="studio-module is-next is-focus">
        <p className="studio-home-label">
          <span className="studio-next-mark" aria-hidden="true" />
          up next
        </p>
        <h3>{next.title}</h3>
        <p>{next.note}</p>
        <NextMove
          inquiryId={inquiry.id}
          next={next}
          proposalId={latestProposal?.id}
          onWrite={() => setFocus("conversation")}
        />
      </section>
      )}

      <div className="studio-lead-grid">
        <section className="studio-module is-rows studio-event">
          <p className="studio-home-label">the moment</p>
          <dl className="studio-facts">
            <div>
              <dt>date</dt>
              <dd>{eventWhen || "—"}</dd>
            </div>
            <div>
              <dt>place</dt>
              <dd>{inquiry.venue_text ? <PlaceLink place={inquiry.venue_text} /> : "—"}</dd>
            </div>
            <div>
              <dt>investment</dt>
              <dd>{inquiry.budget_range || "—"}</dd>
            </div>
          </dl>
          {client ? (
            <div className="studio-row-action">
              <button
                type="button"
                className="studio-ghost"
                aria-expanded={clientFormOpen}
                onClick={() => {
                  setClientForm({
                    name: client.name,
                    email: client.email ?? "",
                    phone: client.phone ?? "",
                  });
                  setClientFormOpen(true);
                }}
              >
                <ShimmerLabel>client form</ShimmerLabel>
              </button>
            </div>
          ) : null}
          {client ? (
            <Dialog open={clientFormOpen} onOpenChange={setClientFormOpen}>
              <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask" hideClose>
                <div className="studio-task-head">
                  <DialogClose className="studio-task-close" aria-label="Close">
                    <X aria-hidden="true" />
                  </DialogClose>
                </div>
                <DialogTitle className="sr-only">client form</DialogTitle>
                <DialogDescription className="sr-only">their details, and what they answered.</DialogDescription>
                <form
                  className="studio-task-form"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    keepClient.mutate();
                  }}
                >
                  <label className="studio-task-composer-title">
                    <span className="sr-only">name</span>
                    <input
                      autoFocus
                      value={clientForm.name}
                      maxLength={160}
                      autoComplete="name"
                      placeholder="who is this…"
                      onChange={(event) => setClientForm({ ...clientForm, name: event.target.value })}
                    />
                  </label>
                  <div className="studio-ask-grid is-two">
                    <label className="studio-ask-field">
                      <span className="studio-ask-label">email</span>
                      <input
                        type="email"
                        value={clientForm.email}
                        maxLength={320}
                        autoComplete="email"
                        required
                        onChange={(event) => setClientForm({ ...clientForm, email: event.target.value })}
                      />
                    </label>
                    <label className="studio-ask-field">
                      <span className="studio-ask-label">phone</span>
                      <input
                        type="tel"
                        value={clientForm.phone}
                        maxLength={40}
                        autoComplete="tel"
                        onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })}
                      />
                    </label>
                    <span className="studio-ask-label studio-ask-span">they answered</span>
                    <AnswerField label="interest" value={EVENT_LABEL[inquiry.event_type]} />
                    <AnswerField label="date" value={eventWhen || "tbd"} />
                    {inquiry.venue_text ? <AnswerField label="venue" value={inquiry.venue_text} wide /> : null}
                    {inquiry.budget_range ? <AnswerField label="budget" value={inquiry.budget_range} /> : null}
                    {inquiry.guest_count ? <AnswerField label="guests" value={String(inquiry.guest_count)} /> : null}
                    {inquiry.source ? <AnswerField label="source" value={inquiry.source} /> : null}
                    {answeredVision(inquiry.message) ? (
                      <AnswerField label="vision" value={answeredVision(inquiry.message)} wide lines />
                    ) : null}
                  </div>
                  <div className="studio-ask-foot">
                    <button
                      type="submit"
                      className="studio-today-go"
                      disabled={keepClient.isPending || !clientForm.name.trim() || !clientForm.email.trim()}
                    >
                      {keepClient.isPending ? "saving…" : "keep"}
                    </button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>

        <section className="studio-module is-rows studio-client">
          <p className="studio-home-label">client details</p>
          <dl className="studio-facts">
            <div>
              <dt>name</dt>
              <dd>{client?.name ?? "client"}</dd>
            </div>
            <div>
              <dt>email</dt>
              <dd>{client?.email}</dd>
            </div>
            {client?.phone ? (
              <div>
                <dt>phone</dt>
                <dd>{client.phone}</dd>
              </div>
            ) : null}
          </dl>
          {client ? (
            <div className="studio-row-action">
              <Link to="/clients/$id" params={{ id: recordSlug(client.name) }} className="studio-ghost">
                <ShimmerLabel>client file</ShimmerLabel>
              </Link>
            </div>
          ) : null}
        </section>
      </div>
      </>
      ) : null}

      {showStack ? (
      <div className="studio-tabs" role="tablist" aria-label="job sections">
        {(["conversation", "proposal", "files"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={focus === item}
            className={focus === item ? "is-on" : undefined}
            onClick={() => setFocus(item)}
          >
            {item === "files" ? "studio files" : item}
          </button>
        ))}
      </div>
      ) : null}

      {threadOpen ? (
        <section className={cn("studio-module studio-lead-thread", showSideThread && "studio-activity")}>
          <p className="studio-home-label">{sendAs === "note" ? "studio" : "thread"}</p>
          <h3>{sendAs === "note" ? "notes" : "conversation"}</h3>
          {surface === "activity" ? (
            <div className="studio-tabs">
              <button type="button" className={activityTab === "messages" ? "is-on" : undefined} onClick={() => setActivityTab("messages")}>
                messages
              </button>
              <button type="button" className={activityTab === "notes" ? "is-on" : undefined} onClick={() => setActivityTab("notes")}>
                notes
              </button>
            </div>
          ) : null}
          {showSideThread ? (
          <form
            className="studio-composer"
            onSubmit={(event) => {
              event.preventDefault();
              post.mutate();
            }}
          >
            {surface === "full" ? (
            <div className="studio-tabs">
              <button type="button" className={channel === "email" ? "is-on" : undefined} onClick={() => setChannel("email")}>
                email
              </button>
              <button type="button" className={channel === "note" ? "is-on" : undefined} onClick={() => setChannel("note")}>
                internal note
              </button>
            </div>
            ) : null}
            <textarea
              className="studio-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                sendAs === "email"
                  ? `write to ${client?.name ?? "them"}`
                  : "a note only the studio will see."
              }
            />
            <div className="studio-composer-bar">
              <p>
                {sendAs === "note"
                  ? "stays on this lead. never emailed."
                  : gmailConnected || devPreview
                    ? "sends from the studio inbox onto this thread."
                    : "connect gmail in settings to send."}
              </p>
              <button
                type="submit"
                className="studio-today-go"
                disabled={
                  post.isPending ||
                  !draft.trim() ||
                  (sendAs === "email" && !gmailConnected && !devPreview)
                }
              >
                {sendAs === "email" ? "send" : "keep note"}
              </button>
            </div>
          </form>
          ) : null}
          <div className="studio-thread">
            {visibleMessages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "studio-thread-msg",
                  message.direction === "outbound" && "is-out",
                  message.direction === "note" && "is-note",
                )}
              >
                <header>
                  <span>
                    {message.channel === "form"
                      ? "inquiry form"
                      : message.channel === "note"
                        ? "studio note"
                        : message.author
                          ? message.author
                          : message.direction === "outbound"
                            ? "you"
                            : client?.name ?? "client"}
                  </span>
                  <span>
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(message.sent_at || message.created_at),
                    )}
                  </span>
                </header>
                {message.subject ? <em>{message.subject}</em> : null}
                <p>{message.body}</p>
                {message.status === "queued" ? <small>waiting for gmail</small> : null}
              </article>
            ))}
          </div>

          {showSideThread ? null : (
          <form
            className="studio-composer"
            onSubmit={(event) => {
              event.preventDefault();
              post.mutate();
            }}
          >
            <div className="studio-tabs">
              <button type="button" className={channel === "email" ? "is-on" : undefined} onClick={() => setChannel("email")}>
                email
              </button>
              <button type="button" className={channel === "note" ? "is-on" : undefined} onClick={() => setChannel("note")}>
                internal note
              </button>
            </div>
            <textarea
              className="studio-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                channel === "email"
                  ? `write to ${client?.name ?? "them"}`
                  : "a note only the studio will see."
              }
            />
            <div className="studio-composer-bar">
              <p>
                {channel === "note"
                  ? "stays on this lead. never emailed."
                  : gmailConnected || devPreview
                    ? "sends from the studio inbox onto this thread."
                    : "connect gmail in settings to send."}
              </p>
              <button
                type="submit"
                className="studio-today-go"
                disabled={
                  post.isPending ||
                  !draft.trim() ||
                  (channel === "email" && !gmailConnected && !devPreview)
                }
              >
                {channel === "email" ? "send" : "keep note"}
              </button>
            </div>
          </form>
          )}
        </section>
      ) : null}

      {surface === "rail" ? (
        <section className="studio-module">
          <p className="studio-home-label">the moment</p>
          <h3>what we’re designing</h3>
          <dl className="studio-facts">
            <div>
              <dt>date</dt>
              <dd>
                {inquiry.event_date_tbd ? "tbd" : [formatDateNumeric(inquiry.event_date), time].filter(Boolean).join(" · ")}
              </dd>
            </div>
            {inquiry.venue_text ? (
              <div>
                <dt>place</dt>
                <dd>
                  <PlaceLink place={inquiry.venue_text} />
                </dd>
              </div>
            ) : null}
            {inquiry.budget_range ? (
              <div>
                <dt>investment</dt>
                <dd>{inquiry.budget_range}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {offerOpen ? (
        <section className="studio-module studio-lead-offer">
          <p className="studio-home-label">the offer</p>
          <h3>proposal</h3>
          {proposals.length === 0 ? (
            <p className="studio-empty">no proposal yet. when the vision is clear, write one from here.</p>
          ) : null}
          <div className="studio-stack">
            {proposals.map((proposal) => (
              <Link key={proposal.id} to="/proposals/$id" params={{ id: proposal.id }} className="studio-ledger-row">
                <div>
                  <b>{proposal.number}</b>
                  <p>{formatDateNumeric(proposal.event_date)}</p>
                </div>
                <div className="text-right">
                  <StudioChip>{proposal.status}</StudioChip>
                  <p>
                    <strong>{formatMoneyExact(proposal.total_cents)}</strong>
                  </p>
                </div>
              </Link>
            ))}
            {candidate ? null : (
              <Link to="/proposals/new" search={{ inquiry: inquiry.id }} className="studio-today-go">
                create proposal
              </Link>
            )}
          </div>
        </section>
      ) : null}

      {filesOpen ? (
        <section className="studio-module studio-lead-files">
          <p className="studio-home-label">internal</p>
          <h3>studio files</h3>
          <p className="studio-muted">floor plans, palettes, contracts — for the job, not the client.</p>
          <label className="studio-file-drop">
            add a file
            <input
              type="file"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (devPreview) {
                  setLocalFiles((current) => [...current, { id: crypto.randomUUID(), name: file.name }]);
                  toast.message("file kept on this lead in preview.");
                  return;
                }
                const path = `inquiries/${inquiryId}/${Date.now()}-${file.name}`;
                const upload = await supabase.storage.from("project-files").upload(path, file);
                if (upload.error) {
                  toast.error(upload.error.message);
                  return;
                }
                try {
                  await saveFile({
                    data: { inquiry_id: inquiryId, file_path: path, file_type: file.type || "" },
                  });
                  toast.success("file added");
                  void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "could not keep this file");
                }
              }}
            />
          </label>
          {allFiles.length === 0 ? <p className="studio-empty">no files on this lead yet.</p> : null}
          {allFiles.map((file) => (
            <div key={file.id} className="studio-ledger-row">
              <b>{file.name ?? file.file_path}</b>
              {"signed_url" in file && file.signed_url ? (
                <a href={file.signed_url} target="_blank" rel="noreferrer" className="auth-text-action">
                  open
                </a>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {showJob && !candidate && inquiry.status !== "closed" ? (
        <button type="button" className="studio-ghost studio-lead-archive" onClick={() => setClosing(true)}>
          archive this inquiry
        </button>
      ) : null}
    </div>
  );
}
