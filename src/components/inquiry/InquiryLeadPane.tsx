import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Folder,
  MessageCircle,
  NotebookPen,
  Upload,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { TextShimmer } from "@/components/core/text-shimmer";
import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonName, isPersonType } from "@/components/studio/PersonName";
import { PlaceLink } from "@/components/studio/PlaceLink";
import {
  fileContentType,
  inquiryHoldDates,
  isVenueTbd,
  studioFileKey,
} from "@/lib/os/inquiry-holds";
import { mailRecord, replyAllPeople, uniqueMails } from "@/lib/os/mail-people";
import { noteWriter, signatureName } from "@/lib/os/mail-signature";
import { applyTemplate, BUILT_IN_TEMPLATES } from "@/lib/os/mail-templates";
import type { InquiryMessageRow, InquiryStatus } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import {
  getDevPreviewInquiryWorkspace,
  previewArchiveInquiry,
  previewReviewDecision,
  previewSetInquiryStatus,
} from "@/lib/dev-preview";
import {
  markPreviewProposalSent,
  previewProposalForInquiry,
  previewTokenFor,
  readPreviewProposal,
  clearPreviewProposal,
  savePreviewProposal,
  updatePreviewProposalTerms,
} from "@/lib/preview-proposals";
import {
  STATEMENT_FIELDS,
  courtesyFromNotes,
  fileNameFromNotes,
  floralPackageName,
  invoiceBookingLine,
  invoiceDateLabel,
  statementFromNotes,
  statementOfWork,
  type StatementOfWork,
} from "@/lib/floral-agreement";
import { invoiceTitle } from "@/lib/invoice-title";
import {
  dollarsToCents,
  ensureProposalLink,
  formatDollarInput,
  proposalCards,
  PROPOSAL_ORIGIN,
  proposalLink,
  proposalOrigin,
  proposalSlug,
  readFileDataUrl,
} from "@/lib/proposal-link";
import { formatDateNumeric, formatMoneyExact } from "@/lib/money";
import {
  EMPTY_INVOICE_DRAFT,
  PREVIEW_CATALOG,
  invoiceItemsTotal,
  keepInvoiceDraft,
  loadInvoiceDraft,
  type InvoiceDraft,
} from "@/lib/invoice-items";
import { sendInquiryInvoice } from "@/lib/os/invoices.functions";
import { listSquareItems } from "@/lib/os/square-catalog.functions";
import {
  EVENT_LABEL,
  PIPELINE_PATH,
  boardStageId,
  confidenceLabel,
  formLine,
  inquiryAnswers,
  inquiryTime,
  recordSlug,
  sourceExcerpt,
} from "@/lib/os/inquiry-desk";
import { saveClient } from "@/lib/os/clients.functions";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import {
  addInquiryMessage,
  attachInquiryFile,
  cancelScheduledLetter,
  deleteInquiryNote,
  removeInquiryFile,
  getInquiryWorkspace,
  reviewDetectedInquiry,
  setInquiryStatus,
  updateInquiryMoment,
  updateInquiryNote,
} from "@/lib/os/inquiries.functions";
import { clearProposal, importProposalPdf, shareProposal } from "@/lib/os/proposals.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";
import {
  type LetterFile,
  LetterPreview,
  ThreadComposer,
  MailPeople,
} from "@/components/inquiry/lead/composer";
import { NoteList, MailFace } from "@/components/inquiry/lead/thread";
import {
  type ItemCatalog,
  type SentInvoice,
  InvoicePreview,
  PacketPreview,
} from "@/components/inquiry/lead/invoice";
import {
  PROPOSAL_THREAD,
  formatSendAt,
  PORTAL_FILES,
  latestMailThread,
  threadBase,
  firstName,
  problemText,
  copyText,
  writeClipboard,
  mailStamp,
  INVOICE_STATUS,
} from "@/components/inquiry/lead/helpers";

type Focus = "conversation" | "proposal" | "invoice" | "files" | "note";
export type LeadSurface = "full" | "job" | "mail" | "notes" | "activity" | "rail";

function MomentEdit({
  label,
  value,
  placeholder,
  onSave,
  map = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (next: string) => void;
  map?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <dt>{label}</dt>
      <dd className="studio-fact-edit">
        <input
          className="studio-fact-input"
          value={draft}
          placeholder={placeholder}
          aria-label={label}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.trim() !== value.trim()) onSave(draft.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {map && value ? <PlaceLink place={value}>map</PlaceLink> : null}
      </dd>
    </div>
  );
}

const shimmer = "[--base-color:#ff4d94] [--base-gradient-color:#ff1493]";

function AnswerField({
  label,
  value,
  wide = false,
  lines = false,
}: {
  label: string;
  value: string;
  wide?: boolean | undefined;
  lines?: boolean | undefined;
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
        <Link
          to="/pipeline"
          activeOptions={{ exact: true }}
          className="studio-record-back"
          aria-label="back to the book"
        >
          <ArrowLeft aria-hidden="true" strokeWidth={1.5} />
        </Link>
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
      {actions ? <div className="studio-home-hello-go">{actions}</div> : null}
    </header>
  );
}

function RecordMast({
  title,
  date,
  time,
  place,
}: {
  title: ReactNode;
  date: string;
  time: string;
  place: string;
}) {
  const when = [date, time].filter(Boolean).join(" · ");
  return (
    <header className="studio-home-hello is-beside">
      <div>
        <RecordBack />
        <h1>{title}</h1>
      </div>
      {when || place ? (
        <p className="studio-hello-meta">
          {when ? <span>{when}</span> : null}
          {place ? <span>{place}</span> : null}
        </p>
      ) : null}
    </header>
  );
}

function RecordBack() {
  return (
    <Link
      to="/pipeline"
      activeOptions={{ exact: true }}
      className="studio-record-back"
      aria-label="back to the book"
    >
      <ArrowLeft aria-hidden="true" strokeWidth={1.5} />
    </Link>
  );
}

export function InquiryLeadPane({ id, surface = "full" }: { id: string; surface?: LeadSurface }) {
  const devPreview = useDevPreview();
  const navigate = useNavigate();
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getInquiryWorkspace);
  const sendMessage = useServerFn(addInquiryMessage);
  const unscheduleLetter = useServerFn(cancelScheduledLetter);
  const reviseNote = useServerFn(updateInquiryNote);
  const dropNote = useServerFn(deleteInquiryNote);
  const importProposal = useServerFn(importProposalPdf);
  const shareProposalLink = useServerFn(shareProposal);
  const clearProposalFn = useServerFn(clearProposal);
  const [confirmClear, setConfirmClear] = useState(false);
  const saveFile = useServerFn(attachInquiryFile);
  const dropFile = useServerFn(removeInquiryFile);
  const updateStatus = useServerFn(setInquiryStatus);
  const saveMomentFields = useServerFn(updateInquiryMoment);
  const reviewCandidate = useServerFn(reviewDetectedInquiry);
  const submitClient = useServerFn(saveClient);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "" });
  const mailScroll = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus>("conversation");
  const channel: "email" | "note" = surface === "notes" || surface === "rail" ? "note" : "email";
  const [activityTab, setActivityTab] = useState<"messages" | "notes">("messages");
  const [draft, setDraft] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [localMessages, setLocalMessages] = useState<InquiryMessageRow[]>([]);
  const [moreTo, setMoreTo] = useState<string[]>([]);
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [noteBodies, setNoteBodies] = useState<Record<string, string>>({});
  const [removedNotes, setRemovedNotes] = useState<string[]>([]);
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [placeDraft, setPlaceDraft] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState<{
    event_date: string | null;
    event_date_tbd: boolean;
  } | null>(null);
  const [startingThread, setStartingThread] = useState(false);
  const [namingThread, setNamingThread] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const threadRef = useRef({
    fresh: false,
    subject: "",
    threadId: null as string | null,
    base: "",
  });
  const [localFiles, setLocalFiles] = useState<Array<{ id: string; name: string; file: File }>>([]);
  const [fileToRemove, setFileToRemove] = useState<{ id: string; name: string } | null>(null);
  const [removingFile, setRemovingFile] = useState<string | null>(null);
  const [openable, setOpenable] = useState<Record<string, string>>({});
  const [fileOver, setFileOver] = useState(false);
  const [proposalHref, setProposalHref] = useState<string | null>(null);
  // the proposal's own token; the link the client sees carries their name
  const proposalKey = useRef<string | null>(null);
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const importedFile = useRef<File | null>(null);
  const localProposalUrl = useMemo(
    () => (proposalFile ? URL.createObjectURL(proposalFile) : ""),
    [proposalFile],
  );
  useEffect(() => {
    if (!localProposalUrl) return;
    return () => URL.revokeObjectURL(localProposalUrl);
  }, [localProposalUrl]);
  const [keptPdfUrl, setKeptPdfUrl] = useState("");
  const [proposalName, setProposalName] = useState("");
  const [proposalOver, setProposalOver] = useState(false);
  const [proposalAmount, setProposalAmount] = useState("");
  const [proposalCourtesy, setProposalCourtesy] = useState("");
  const [proposalPay, setProposalPay] = useState<"deposit" | "full">("deposit");
  const [work, setWork] = useState<StatementOfWork>(() => statementOfWork());
  const [proposalError, setProposalError] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalShare, setProposalShare] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const [packetOpen, setPacketOpen] = useState(false);
  const [invoiceShare, setInvoiceShare] = useState(false);
  const [packetKind, setPacketKind] = useState<"proposal" | "agreement" | "invoice">("proposal");
  const [copiedLink, setCopiedLink] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const proposalSeeded = useRef(false);
  const workSeeded = useRef(false);
  const proposalDirty = useRef(false);
  const savingProposal = useRef(false);
  const keptPdfPath = useRef("");
  const keepProposal = useRef<() => void>(() => {});

  const { data, isPending, isError } = useQuery({
    queryKey: ["os", "inquiry-workspace", id, devPreview],
    queryFn: () =>
      devPreview ? getDevPreviewInquiryWorkspace(id) : fetchWorkspace({ data: { id } }),
  });
  const inquiryId = data?.inquiry.id ?? id;

  useEffect(() => {
    setThreadKey(null);
    setStartingThread(false);
    proposalSeeded.current = false;
    workSeeded.current = false;
    proposalDirty.current = false;
    emptyProposal();
    setMoreTo([]);
    setCopyTo([]);
  }, [data?.inquiry.id]);

  /** The proposal panel back to its first, empty state. */
  function emptyProposal() {
    importedFile.current = null;
    keptPdfPath.current = "";
    setKeptPdfUrl("");
    setProposalFile(null);
    setProposalName("");
    setProposalHref(null);
    proposalKey.current = null;
    setProposalAmount("");
    setProposalCourtesy("");
    setProposalPay("deposit");
    setProposalError("");
  }

  const clearOffer = useMutation({
    mutationFn: async () => {
      if (devPreview) {
        clearPreviewProposal(inquiryId);
        return { cleared: true };
      }
      return clearProposalFn({ data: { inquiry_id: inquiryId } });
    },
    onSuccess: () => {
      setConfirmClear(false);
      emptyProposal();
      proposalSeeded.current = true;
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      toast.success("proposal cleared");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!proposalDirty.current) return;
    const freshFile = Boolean(proposalFile && proposalFile !== importedFile.current);
    const timer = window.setTimeout(() => keepProposal.current(), freshFile ? 0 : 400);
    return () => window.clearTimeout(timer);
  }, [proposalAmount, proposalCourtesy, proposalPay, work, proposalFile]);

  useEffect(() => {
    const flush = () => {
      if (proposalDirty.current) keepProposal.current();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (!data?.slug || data.slug === id) return;
    void navigate({ to: "/pipeline/$id", params: { id: data.slug }, replace: true });
  }, [data?.slug, id, navigate]);

  useEffect(() => {
    if (!data || typeof window === "undefined") return;
    const stored =
      data.proposals.find((item) => ("pdf_path" in item && item.pdf_path) || item.total_cents) ??
      data.proposals[0];
    const preview = previewProposalForInquiry(data.inquiry.id);
    const token =
      (stored && "access_token" in stored && typeof stored.access_token === "string"
        ? stored.access_token
        : null) ??
      preview?.token ??
      null;
    const slug =
      (stored && "slug" in stored && typeof stored.slug === "string" ? stored.slug : null) ??
      (preview && preview.token === token ? proposalSlug(preview.clientName) : null);
    if (token) {
      proposalKey.current = token;
      setProposalHref(
        slug
          ? proposalLink(proposalOrigin(), slug)
          : `${proposalOrigin()}/proposal/${encodeURIComponent(token)}`,
      );
    }
    const pdfUrl =
      stored && "pdf_url" in stored && typeof stored.pdf_url === "string" ? stored.pdf_url : "";
    const pdfPath =
      stored && "pdf_path" in stored && typeof stored.pdf_path === "string" ? stored.pdf_path : "";
    if (pdfUrl) setKeptPdfUrl((current) => current || pdfUrl);
    if (pdfPath) keptPdfPath.current = pdfPath;
    if (proposalSeeded.current) return;
    const notes =
      stored && "notes" in stored && typeof stored.notes === "string" ? stored.notes : null;
    const savedWork = preview?.work ?? statementFromNotes(notes);
    const total = preview?.totalCents ?? stored?.total_cents ?? 0;
    const fileName =
      fileNameFromNotes(notes) ||
      preview?.fileName ||
      (preview?.pdfDataUrl || stored?.pdf_path ? "proposal.pdf" : "");
    if (!fileName && !total && !savedWork) return;
    const courtesy = preview?.courtesyCents ?? courtesyFromNotes(notes);
    const depositCents = preview?.depositCents ?? stored?.deposit_amount_cents;
    proposalSeeded.current = true;
    if (fileName) setProposalName(fileName);
    if (total > 0) {
      setProposalAmount(formatDollarInput(String((total + courtesy) / 100)));
      setProposalCourtesy(courtesy > 0 ? formatDollarInput(String(courtesy / 100)) : "");
      setProposalPay(depositCents != null && depositCents >= total ? "full" : "deposit");
    }
  }, [data]);

  useEffect(() => {
    if (!data || workSeeded.current) return;
    workSeeded.current = true;
    const preview = previewProposalForInquiry(data.inquiry.id);
    const stored = data.proposals.find((item) => "notes" in item && item.notes);
    const saved =
      preview?.work ?? statementFromNotes(stored && "notes" in stored ? stored.notes : null);
    const occasion = EVENT_LABEL[data.inquiry.event_type];
    const when = data.inquiry.event_date_tbd
      ? "tbd"
      : [formatDateNumeric(data.inquiry.event_date), inquiryTime(data.inquiry.message)]
          .filter(Boolean)
          .join(" · ");
    setWork(
      saved
        ? statementOfWork(saved)
        : statementOfWork({
            flowers: occasion,
            eventWhen: when,
            occasion,
            venue: data.inquiry.venue_text ?? "",
          }),
    );
  }, [data]);

  useEffect(() => {
    if (!workSeeded.current) return;
    const token = proposalKey.current ?? "";
    if (!token.startsWith("preview_")) return;
    const cents = dollarsToCents(proposalAmount);
    const courtesy = dollarsToCents(proposalCourtesy) ?? 0;
    if (!cents) return;
    const net = Math.max(0, cents - courtesy);
    updatePreviewProposalTerms(token, net, proposalPay === "full" ? 100 : 50, work, courtesy);
  }, [proposalHref, proposalAmount, proposalCourtesy, proposalPay, work]);

  const viewedAtByToken = useMemo(() => {
    const views: Record<string, string> = {};
    for (const item of data?.proposals ?? []) {
      const token =
        "access_token" in item && typeof item.access_token === "string" ? item.access_token : "";
      const viewed =
        "viewed_at" in item && typeof item.viewed_at === "string" ? item.viewed_at : "";
      const slug = "slug" in item && typeof item.slug === "string" ? item.slug : "";
      if (token && viewed) views[token] = viewed;
      if (slug && viewed) views[slug] = viewed;
    }
    if (data && typeof window !== "undefined") {
      const preview = previewProposalForInquiry(data.inquiry.id);
      if (preview?.token && preview.viewedAt) {
        views[preview.token] = preview.viewedAt;
        views[proposalSlug(preview.clientName)] = preview.viewedAt;
      }
    }
    return views;
  }, [data]);

  const saveMoment = useMutation({
    mutationFn: async (patch: {
      venue_text?: string;
      budget_range?: string;
      event_date?: string | null;
      event_date_tbd?: boolean;
    }) => {
      const inquiryId = data?.inquiry.id;
      if (!inquiryId) return;
      if (patch.event_date !== undefined || patch.event_date_tbd !== undefined) {
        setDateDraft({
          event_date: patch.event_date_tbd ? null : (patch.event_date ?? null),
          event_date_tbd: Boolean(patch.event_date_tbd),
        });
      }
      if (devPreview) return;
      await saveMomentFields({ data: { id: inquiryId, ...patch } });
    },
    onSuccess: () => {
      if (!devPreview)
        void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const move = useMutation({
    mutationFn: (args: { status: InquiryStatus; closed_reason?: string }) => {
      if (devPreview) {
        if (args.status === "closed") {
          previewArchiveInquiry(inquiryId);
          return Promise.resolve({ ok: true as const });
        }
        previewSetInquiryStatus(inquiryId, args.status);
        return Promise.resolve({ ok: true as const });
      }
      return updateStatus({
        data: { id: inquiryId, status: args.status, closed_reason: args.closed_reason ?? "" },
      });
    },
    onSuccess: async (_result, args) => {
      setConfirmArchive(false);
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
      if (args.status === "closed") {
        toast.success("inquiry archived");
        await navigate({ to: "/pipeline" });
        return;
      }
      toast.success("lead updated");
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
    mutationFn: async ({
      body,
      sendAt,
      fresh,
      subject,
      attachments = [],
    }: {
      body: string;
      sendAt?: string;
      fresh?: boolean;
      subject?: string;
      attachments?: LetterFile[];
    }) => {
      const text = body.trim();
      if (!text) throw new Error("write a note first");
      const asChannel =
        surface === "full"
          ? focus === "note" && !fresh
            ? "note"
            : "email"
          : outgoingChannel(surface, activityTab, channel);
      const when = sendAt ? new Date(sendAt) : new Date();
      if (sendAt && Number.isNaN(when.getTime())) throw new Error("pick a time to send");
      const people = mailRecord(uniqueMails([data?.client?.email, ...moreTo]), copyTo);
      const thread = fresh
        ? { fresh: true, subject: subject?.trim() ?? "", threadId: null as string | null, base: "" }
        : threadRef.current;
      if (asChannel === "email" && !people.to.length) throw new Error("add an email.");
      if (devPreview) {
        for (const card of proposalCards(text).cards) {
          const token = previewTokenFor(card.key);
          if (token) markPreviewProposalSent(token);
        }
        if (asChannel === "email" && thread.fresh && !thread.subject) {
          throw new Error("add a subject for the new conversation.");
        }
        const subject =
          asChannel === "email"
            ? thread.fresh
              ? thread.subject
              : thread.base && thread.base !== "conversation"
                ? `Re: ${thread.base}`
                : "from say sukii"
            : null;
        setLocalMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            inquiry_id: inquiryId,
            direction: asChannel === "email" ? "outbound" : "note",
            channel: asChannel,
            subject,
            body: text,
            from_address: asChannel === "email" ? "info@saysukii.com" : null,
            to_address:
              people.cc.length || people.to.length > 1
                ? people.line
                : (data?.client?.email ?? people.to[0] ?? null),
            gmail_message_id: asChannel === "email" ? `preview-out-${Date.now()}` : null,
            gmail_thread_id:
              asChannel === "email"
                ? thread.fresh
                  ? `thread-${crypto.randomUUID()}`
                  : (thread.threadId ?? "preview-thread")
                : null,
            author: asChannel === "email" ? signatureName(profile.full_name) : noteWriter(profile),
            sent_at: when.toISOString(),
            status: sendAt ? "queued" : "sent",
            created_by: profile.id,
            created_at: new Date().toISOString(),
          },
        ]);
        return {
          ok: true as const,
          channel: asChannel,
          scheduled: Boolean(sendAt),
          when: sendAt ?? "",
          opened: thread.fresh ? thread.subject : "",
        };
      }
      if (asChannel === "email" && thread.fresh && !thread.subject) {
        throw new Error("add a subject for the new conversation.");
      }
      const sent = await sendMessage({
        data: {
          inquiry_id: inquiryId,
          channel: asChannel,
          body: text,
          subject: thread.fresh ? thread.subject : "",
          fresh: thread.fresh,
          thread_id: thread.fresh ? null : thread.threadId,
          ...(asChannel === "email" ? { to: people.to, cc: people.cc, attachments } : {}),
          ...(asChannel === "email" && sendAt ? { send_at: when.toISOString() } : {}),
        },
      });
      const scheduled = "scheduled" in sent && sent.scheduled === true;
      return {
        ...sent,
        channel: asChannel,
        scheduled,
        when: sendAt ?? "",
        opened: thread.fresh ? thread.subject : "",
      };
    },
    onSuccess: (result) => {
      setDraft("");
      if (result.opened) {
        setFocus("conversation");
        setThreadKey(result.opened.toLowerCase());
        setStartingThread(false);
        setNamingThread(false);
        setNewSubject("");
      } else if (threadRef.current.fresh) {
        setThreadKey(threadRef.current.subject.toLowerCase());
        setStartingThread(false);
        setNamingThread(false);
        setNewSubject("");
      }
      if (result.scheduled) toast.message(`scheduled for ${formatSendAt(result.when)}`);
      else if (result.channel === "email") toast.success("sent");
      else toast.success("note kept on the lead");
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendHold = useRef<{ timer: number; run: () => void; undo: () => void } | null>(null);
  const [holding, setHolding] = useState<{ id: number; line: string } | null>(null);

  /** Every letter waits ten seconds under the ribbon, so a slip can be caught before it leaves. */
  function queueLetter(run: () => void, restore?: () => void, who?: string | null) {
    if (sendHold.current) {
      window.clearTimeout(sendHold.current.timer);
      sendHold.current.run();
    }
    const timer = window.setTimeout(() => {
      if (sendHold.current?.timer !== timer) return;
      sendHold.current = null;
      setHolding(null);
      run();
    }, SEND_HOLD_MS);
    const undo = () => {
      if (sendHold.current?.timer !== timer) return;
      window.clearTimeout(timer);
      sendHold.current = null;
      setHolding(null);
      restore?.();
    };
    sendHold.current = { timer, run, undo };
    const line =
      sendAs === "note" ? "keeping the note" : who ? `sending to ${firstName(who)}` : "sending";
    setHolding({ id: timer, line });
  }

  useEffect(() => {
    return () => {
      const hold = sendHold.current;
      if (!hold) return;
      window.clearTimeout(hold.timer);
      sendHold.current = null;
      hold.run();
    };
  }, []);

  const messages = useMemo(() => {
    const removed = new Set(removedNotes);
    return [...(data?.messages ?? []), ...localMessages]
      .filter((item) => !removed.has(item.id))
      .map((item) => {
        const edited = noteBodies[item.id];
        return edited !== undefined ? { ...item, body: edited } : item;
      });
  }, [data?.messages, localMessages, noteBodies, removedNotes]);
  const sendAs =
    surface === "full"
      ? focus === "note"
        ? "note"
        : "email"
      : outgoingChannel(surface, activityTab, channel);
  const visibleMessages = messages
    .filter((item) => {
      const note = item.channel === "note" || item.direction === "note";
      if (surface === "full") return focus === "note" ? note : !note;
      if (
        surface === "notes" ||
        surface === "rail" ||
        (surface === "activity" && activityTab === "notes")
      )
        return note;
      if (surface === "mail" || (surface === "activity" && activityTab === "messages"))
        return !note;
      return true;
    })
    .sort((a, b) =>
      (a.sent_at || a.created_at || "").localeCompare(b.sent_at || b.created_at || ""),
    );

  const mailThreads: string[] = [];
  if (sendAs === "email") {
    for (const item of visibleMessages) {
      const key = threadBase(item.subject).toLowerCase();
      if (!mailThreads.includes(key)) mailThreads.push(key);
    }
  }
  const pendingSubject =
    !namingThread && newSubject.trim() && !mailThreads.includes(newSubject.trim().toLowerCase())
      ? newSubject.trim()
      : "";
  const shownThreads = mailThreads.filter((key) => key !== "conversation");
  const newestThread = latestMailThread(visibleMessages);
  const activeThread =
    sendAs === "email" && !startingThread
      ? threadKey && mailThreads.includes(threadKey)
        ? threadKey
        : newestThread && mailThreads.includes(newestThread)
          ? newestThread
          : (mailThreads.at(-1) ?? null)
      : null;
  const threadedMessages =
    sendAs === "note" || startingThread
      ? sendAs === "note"
        ? visibleMessages
        : []
      : visibleMessages.filter(
          (item) => threadBase(item.subject).toLowerCase() === (activeThread ?? "conversation"),
        );
  const activeGmailThread =
    [...threadedMessages].reverse().find((item) => item.gmail_thread_id)?.gmail_thread_id ?? null;
  threadRef.current = {
    fresh: sendAs === "email" && startingThread,
    subject: newSubject.trim(),
    threadId: activeGmailThread,
    base: activeThread ?? "",
  };

  useEffect(() => {
    const node = mailScroll.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [focus, id, threadedMessages.length, activeThread, startingThread]);

  const fetchSquareItems = useServerFn(listSquareItems);
  const squareItems = useQuery({
    queryKey: ["os", "square-items", devPreview],
    enabled: focus === "invoice",
    staleTime: 5 * 60_000,
    queryFn: async () =>
      devPreview ? { items: PREVIEW_CATALOG, problem: null } : fetchSquareItems(),
  });
  const catalog: ItemCatalog = {
    items: squareItems.data?.items ?? [],
    problem:
      squareItems.data?.problem ??
      (squareItems.isError ? "square didn't answer. you can still add a custom item." : null),
    loading: squareItems.isPending && focus === "invoice",
  };
  const sendInvoice = useServerFn(sendInquiryInvoice);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(() => loadInvoiceDraft(id));
  const [previewInvoices, setPreviewInvoices] = useState<SentInvoice[]>([]);
  useEffect(() => {
    setInvoiceDraft(loadInvoiceDraft(id));
  }, [id]);

  function editInvoice(patch: Partial<InvoiceDraft>) {
    setInvoiceDraft((current) => {
      const next = { ...current, ...patch };
      keepInvoiceDraft(id, next);
      return next;
    });
  }

  const invoiceItems = invoiceDraft.items;
  const invoiceListCents = invoiceItems.length
    ? invoiceItemsTotal(invoiceItems)
    : (dollarsToCents(invoiceDraft.amount) ?? 0);
  const invoiceCourtesyCents = dollarsToCents(invoiceDraft.courtesy) ?? 0;
  const invoiceTotalCents = Math.max(0, invoiceListCents - invoiceCourtesyCents);
  const invoiceDueCents =
    invoiceDraft.pay === "full" ? invoiceTotalCents : Math.round(invoiceTotalCents / 2);

  const replyAll = replyAllPeople(threadedMessages, data?.client?.email);
  const replyKey = `${replyAll.to.join(",")}|${replyAll.cc.join(",")}`;
  useEffect(() => {
    const [to = "", cc = ""] = replyKey.split("|");
    setMoreTo(to ? to.split(",") : []);
    setCopyTo(cc ? cc.split(",") : []);
  }, [replyKey]);

  if (isPending) {
    const rows =
      queryClient.getQueryData<
        Array<{
          id: string;
          slug: string;
          event_date: string | null;
          event_date_tbd: boolean;
          venue_text: string | null;
          client: { name: string; type: string } | null;
        }>
      >(["inquiry-pipeline", devPreview]) ?? [];
    const known = rows.find((item) => item.slug === id || item.id === id);
    const who = known?.client;
    if (!known || !who) return null;
    return (
      <div className="studio-lead is-new is-layout-workflow">
        <div className="studio-lead-top is-mast">
          <RecordMast
            title={isPersonType(who.type) ? <PersonName name={who.name} /> : who.name}
            date={known.event_date_tbd ? "date tbd" : formatDateNumeric(known.event_date)}
            time=""
            place={known.venue_text?.split(",")[0]?.trim() ?? ""}
          />
        </div>
      </div>
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

  const { inquiry, client, files, gmailConnected, source_message } = data;
  const sentInvoices: SentInvoice[] = [
    ...previewInvoices,
    ...("invoices" in data && Array.isArray(data.invoices) ? (data.invoices as SentInvoice[]) : []),
  ];
  const time = inquiryTime(inquiry.message);
  const allFiles = [
    ...files,
    ...localFiles.map((file) => ({
      id: file.id,
      name: file.name,
      file: file.file,
      file_path: file.name,
      file_type: file.file.type || "",
      signed_url: null as string | null,
      created_at: "",
    })),
  ];
  const fileHrefs = {
    ...PORTAL_FILES,
    ...Object.fromEntries(
      allFiles.flatMap((file) => {
        const name = file.name ?? "";
        return name && file.signed_url ? [[name, file.signed_url]] : [];
      }),
    ),
    ...openable,
  };

  async function cancelLetter(messageId: string) {
    if (devPreview) {
      setLocalMessages((current) => current.filter((item) => item.id !== messageId));
      toast.message("letter cancelled");
      return;
    }
    try {
      await unscheduleLetter({ data: { id: messageId } });
      toast.message("letter cancelled");
      await queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "could not cancel the letter");
    }
  }

  async function removeStudioFile(target: { id: string; name: string }) {
    setFileToRemove(null);
    if (localFiles.some((file) => file.id === target.id)) {
      setLocalFiles((current) => current.filter((file) => file.id !== target.id));
      toast.success("file removed");
      return;
    }
    setRemovingFile(target.id);
    try {
      await dropFile({ data: { id: target.id } });
      toast.success("file removed");
      await queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "could not remove this file");
    } finally {
      setRemovingFile(null);
    }
  }

  async function keepStudioFile(file: File): Promise<string | null> {
    if (devPreview) {
      setLocalFiles((current) => [...current, { id: crypto.randomUUID(), name: file.name, file }]);
      toast.message("file kept on this lead in preview.");
      return null;
    }
    const path = studioFileKey(`inquiries/${inquiryId}`, file.name);
    const upload = await supabase.storage.from("project-files").upload(path, file, {
      contentType: fileContentType(file),
      upsert: false,
    });
    if (upload.error) {
      toast.error(upload.error.message);
      return null;
    }
    try {
      await saveFile({
        data: { inquiry_id: inquiryId, file_path: path, file_type: fileContentType(file) },
      });
      toast.success("file added");
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      return path;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "could not keep this file");
      return null;
    }
  }
  const candidate = isReviewCandidate(inquiry);
  const peek = sourceExcerpt(source_message?.subject, source_message?.body ?? inquiry.message, 280);
  const confidence = confidenceLabel(inquiry.detection_confidence);
  const stage = boardStageId(inquiry);
  const dateTbd = dateDraft?.event_date_tbd ?? inquiry.event_date_tbd;
  const dateValue = dateDraft ? dateDraft.event_date : inquiry.event_date;
  const eventWhen = dateDraft
    ? dateTbd
      ? "tbd"
      : formatDateNumeric(dateValue)
    : inquiry.event_date_tbd
      ? "tbd"
      : [
          inquiryHoldDates(inquiry)
            .map((date) => formatDateNumeric(date))
            .filter(Boolean)
            .join(" · "),
          inquiryHoldDates(inquiry).length > 1 ? "" : time,
        ]
          .filter(Boolean)
          .join(" · ");
  const formBlob = [
    inquiry.message,
    ...messages
      .filter(
        (item) => item.channel === "form" || /^new inquiry$/i.test(item.subject?.trim() ?? ""),
      )
      .map((item) => item.body),
  ]
    .filter(Boolean)
    .join("\n");
  const space = formLine(formBlob, "space");
  const cadence = formLine(formBlob, "cadence");
  const placeText = placeDraft ?? inquiry.venue_text ?? "";
  const answers = inquiryAnswers({
    event_type: inquiry.event_type,
    message: formBlob,
    venue_text: inquiry.venue_text,
    budget_range: inquiry.budget_range,
    guest_count: inquiry.guest_count,
    source: inquiry.source,
    eventWhen,
  });
  const place = isVenueTbd(placeText) ? "venue tbd" : (placeText.split(",")[0]?.trim() ?? "");
  const holdDates = inquiryHoldDates(inquiry);
  const holdLabel = holdDates
    .map((date) => formatDateNumeric(date))
    .filter(Boolean)
    .join(" · ");

  function keepPlace(next: string) {
    setPlaceDraft(next);
    if (next === (inquiry.venue_text ?? "")) return;
    saveMoment.mutate({ venue_text: next });
  }

  function chooseStatus(status: InquiryStatus) {
    if (status === "closed") {
      setConfirmArchive(true);
      return;
    }
    setConfirmArchive(false);
    move.mutate({ status });
  }

  const showJob = surface === "full" || surface === "job";
  const showStack = surface === "full";
  const showSideThread =
    surface === "mail" || surface === "notes" || surface === "activity" || surface === "rail";

  const threadOpen =
    showSideThread || (showStack && (focus === "conversation" || focus === "note"));
  const offerOpen = showStack && focus === "proposal";
  const invoiceOpen = showStack && focus === "invoice";
  const filesOpen = showStack && focus === "files";
  const replyFacts = {
    eventDate: inquiry.event_date,
    dateTbd: inquiry.event_date_tbd,
    place: inquiry.venue_text,
    job: EVENT_LABEL[inquiry.event_type],
  };
  async function importProposalFile(
    file: File,
    totalCents: number,
    depositPercent: number,
    statement: StatementOfWork,
    courtesyCents = 0,
  ) {
    const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!pdf) throw new Error("drop the proposal pdf.");
    if (file.size > 50 * 1024 * 1024) throw new Error("that pdf is larger than 50mb.");
    if (devPreview) {
      const pdfDataUrl = await readFileDataUrl(file);
      if (pdfDataUrl.length > 4_500_000)
        throw new Error("this preview keeps the pdf under about 3mb.");
      const saved = savePreviewProposal({
        inquiryId,
        clientName: client?.name ?? "Client",
        eventDate: inquiry.event_date,
        venueText: inquiry.venue_text,
        eventLabel: EVENT_LABEL[inquiry.event_type],
        totalCents,
        courtesyCents,
        depositPercent,
        pdfDataUrl,
        fileName: file.name,
        work: statement,
      });
      const href = proposalLink(proposalOrigin(), proposalSlug(saved.clientName));
      proposalKey.current = saved.token;
      setProposalHref(href);
      importedFile.current = file;
      return href;
    }
    const incoming = `${inquiryId}/${crypto.randomUUID()}.pdf`;
    const upload = await supabase.storage.from("documents").upload(incoming, file, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);
    const result = await importProposal({
      data: {
        inquiry_id: inquiryId,
        total_cents: totalCents,
        courtesy_cents: courtesyCents,
        deposit_percent: depositPercent,
        statement,
        file_name: file.name,
        pdf_path: incoming,
      },
    });
    const href = proposalLink(proposalOrigin(), result.slug);
    proposalKey.current = result.token;
    setProposalHref(href);
    importedFile.current = file;
    if (result.pdf_path) keptPdfPath.current = result.pdf_path;
    void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
    return href;
  }

  keepProposal.current = () => {
    if (savingProposal.current) return;
    const stored = data?.proposals.find(
      (item) => "pdf_path" in item && typeof item.pdf_path === "string" && item.pdf_path,
    );
    const pdfPath =
      (stored && typeof stored.pdf_path === "string" ? stored.pdf_path : "") || keptPdfPath.current;
    if (!proposalFile && !pdfPath) return;
    if (stored?.status === "accepted") return;
    const typed = dollarsToCents(proposalAmount);
    const courtesy = dollarsToCents(proposalCourtesy) ?? 0;
    const net = typed == null ? (stored?.total_cents ?? 0) : Math.max(0, typed - courtesy);
    if (typed != null && courtesy >= typed) return;
    const deposit = proposalPay === "full" ? 100 : 50;
    savingProposal.current = true;
    proposalDirty.current = false;
    void (async () => {
      try {
        if (proposalFile && proposalFile !== importedFile.current) {
          await importProposalFile(proposalFile, net, deposit, work, courtesy);
          return;
        }
        if (devPreview) {
          const token = proposalKey.current ?? "";
          if (token.startsWith("preview_"))
            updatePreviewProposalTerms(token, net, deposit, work, courtesy);
          return;
        }
        if (!pdfPath) return;
        const saved = await importProposal({
          data: {
            inquiry_id: inquiryId,
            total_cents: net,
            courtesy_cents: courtesy,
            deposit_percent: deposit,
            statement: work,
            file_name: proposalName || "proposal.pdf",
            pdf_path: pdfPath,
          },
        });
        if (saved.pdf_path) keptPdfPath.current = saved.pdf_path;
        void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      } catch (error) {
        proposalDirty.current = true;
        setProposalError(problemText(error, "could not keep the proposal"));
      } finally {
        savingProposal.current = false;
        if (proposalDirty.current) keepProposal.current();
      }
    })();
  };

  function takeProposal(file: File | undefined) {
    if (!file) return;
    const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!pdf) {
      setProposalError("drop the proposal pdf.");
      return;
    }
    setProposalError("");
    proposalDirty.current = true;
    setProposalFile(file);
    setProposalName(file.name);
  }

  function proposalProblem() {
    if (!proposalFile && !proposalHref) return "drop the proposal.";
    const list = dollarsToCents(proposalAmount);
    const courtesy = dollarsToCents(proposalCourtesy) ?? 0;
    if (!list) return "add the amount.";
    if (courtesy >= list) return "the courtesy discount has to stay under the amount.";
    return null;
  }

  async function readyProposalHref() {
    const problem = proposalProblem();
    if (problem) throw new Error(problem);
    const list = dollarsToCents(proposalAmount) ?? 0;
    const courtesy = dollarsToCents(proposalCourtesy) ?? 0;
    const cents = Math.max(0, list - courtesy);
    const deposit = proposalPay === "full" ? 100 : 50;
    const fileChanged = Boolean(proposalFile && proposalFile !== importedFile.current);
    const stored = data?.proposals.find(
      (item) => "pdf_path" in item && typeof item.pdf_path === "string" && item.pdf_path,
    );
    const accepted = stored?.status === "accepted";
    const href =
      fileChanged && proposalFile && !accepted
        ? await importProposalFile(proposalFile, cents, deposit, work, courtesy)
        : proposalHref;
    if (!href) throw new Error("drop the proposal.");
    if (!devPreview && !fileChanged && stored?.pdf_path && !accepted) {
      await importProposal({
        data: {
          inquiry_id: inquiryId,
          total_cents: cents,
          courtesy_cents: courtesy,
          deposit_percent: deposit,
          statement: work,
          file_name: proposalName || "proposal.pdf",
          pdf_path: stored.pdf_path,
        },
      });
    }
    const key = proposalKey.current ?? "";
    if (!proposalFile && key.startsWith("preview_")) {
      updatePreviewProposalTerms(key, cents, deposit, work, courtesy);
    }
    return href;
  }

  function markCopied() {
    setCopiedLink(true);
    toast.success("copied");
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => {
      setCopiedLink(false);
      setShareMenu(false);
      copiedTimer.current = null;
    }, 2200);
  }

  /** A copied link is a shared one: the client can approve it or ask for changes. */
  function markShared() {
    const key = proposalKey.current ?? "";
    if (key.startsWith("preview_")) {
      markPreviewProposalSent(key);
      return;
    }
    if (devPreview || !key) return;
    void shareProposalLink({ data: { inquiry_id: inquiryId } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] }))
      .catch((error: unknown) =>
        setProposalError(problemText(error, "the link copied, but the proposal isn't marked sent")),
      );
  }

  async function copyProposal() {
    setProposalError("");
    const fileChanged = Boolean(proposalFile && proposalFile !== importedFile.current);
    if (proposalHref && !fileChanged) {
      const copied = await writeClipboard(proposalHref);
      if (!copied) {
        setProposalError("could not copy the link");
        return;
      }
      markShared();
      markCopied();
      proposalDirty.current = true;
      keepProposal.current();
      return;
    }
    const pending = readyProposalHref();
    setProposalBusy(true);
    try {
      const href = await pending;
      const copied = await writeClipboard(href);
      if (!copied) throw new Error("could not copy the link");
      markShared();
      markCopied();
    } catch (error) {
      setProposalError(problemText(error, "could not copy the link"));
    } finally {
      setProposalBusy(false);
    }
  }

  function downloadProposal() {
    if (proposalFile) {
      const url = URL.createObjectURL(proposalFile);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = proposalFile.name || "proposal.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    const token = proposalKey.current ?? "";
    const stored = token ? readPreviewProposal(token) : null;
    if (stored?.pdfDataUrl) {
      const anchor = document.createElement("a");
      anchor.href = stored.pdfDataUrl;
      anchor.download = proposalName || "proposal.pdf";
      anchor.click();
      return;
    }
    setProposalError("drop the proposal.");
  }

  async function emailProposal() {
    const template = BUILT_IN_TEMPLATES.find((item) => item.id === "proposal");
    if (!template) return;
    setProposalBusy(true);
    setProposalError("");
    try {
      const href = await readyProposalHref();
      const body = ensureProposalLink(
        applyTemplate(template.body, client?.name, EVENT_LABEL[inquiry.event_type]),
        href,
      );
      await post.mutateAsync({ body, fresh: true, subject: template.subject || PROPOSAL_THREAD });
      setProposalShare(false);
    } catch (error) {
      setProposalError(problemText(error, "could not send the proposal"));
    } finally {
      setProposalBusy(false);
    }
  }

  function invoiceLetter() {
    const first = firstName(client?.name);
    const dueLabel = invoiceDraft.pay === "full" ? "due in full" : "deposit due";
    const lines = [
      `hi ${first},`,
      "",
      "your invoice is ready.",
      ...(invoiceItems.length
        ? [
            "",
            ...invoiceItems.map(
              (item) =>
                `${item.name.trim() || "custom item"}${item.note?.trim() ? ` (${item.note.trim()})` : ""} × ${item.quantity} · ${formatMoneyExact(item.unitCents * item.quantity)}`,
            ),
          ]
        : []),
      ...(invoiceCourtesyCents
        ? ["", `courtesy discount: −${formatMoneyExact(invoiceCourtesyCents)}`]
        : []),
      "",
      `${dueLabel}: ${formatMoneyExact(invoiceDueCents)}`,
    ];
    return { subject: "your invoice", text: lines.join("\n") };
  }

  function invoiceProblem() {
    if (invoiceTotalCents <= 0)
      return invoiceItems.length ? "add a price to the items." : "add the amount or an item.";
    if (invoiceCourtesyCents >= invoiceListCents)
      return "the courtesy discount has to stay under the total.";
    if (!client?.email) return "this client needs an email address before you can invoice them.";
    return null;
  }

  function previewInvoice() {
    const problem = invoiceProblem();
    setProposalError(problem ?? "");
    if (problem) return;
    setInvoiceShare(true);
  }

  async function emailInvoice() {
    const problem = invoiceProblem();
    if (problem) {
      setProposalError(problem);
      return;
    }
    const lines = invoiceItems.length
      ? invoiceItems
      : [
          {
            key: "base",
            name: floralPackageName(work.occasion || work.flowers),
            note:
              invoiceBookingLine(work.occasion || work.flowers, invoiceDateLabel(work.eventWhen)) ||
              null,
            unitCents: invoiceListCents,
            quantity: 1,
            squareId: null,
          },
        ];
    setProposalBusy(true);
    setProposalError("");
    try {
      const letter = invoiceLetter().text;
      if (devPreview) {
        const number = `SS${String(100 + previewInvoices.length + 1)}`;
        setPreviewInvoices((current) => [
          {
            id: crypto.randomUUID(),
            number,
            total_cents: invoiceTotalCents,
            due_now_cents: invoiceDueCents,
            pay_in_full: invoiceDraft.pay === "full",
            status: "sent",
            public_url: null,
            sent_at: new Date().toISOString(),
            paid_cents: 0,
          },
          ...current,
        ]);
        await post.mutateAsync({
          body: `${letter}\n\n[pay your invoice](https://squareup.com/pay-invoice/preview)\n\n<3`,
          fresh: true,
          subject: number,
        });
        toast.success(`${number} sent`);
      } else {
        const sent = await sendInvoice({
          data: {
            inquiry_id: inquiryId,
            items: lines.map((line) => ({
              name: line.name.trim(),
              note: line.note?.trim() || null,
              quantity: line.quantity,
              unit_cents: line.unitCents,
              square_id: line.squareId,
              catalog_cents: "catalogCents" in line ? (line.catalogCents ?? null) : null,
            })),
            courtesy_cents: invoiceCourtesyCents,
            pay_in_full: invoiceDraft.pay === "full",
            letter,
            to: uniqueMails([client?.email, ...moreTo]),
            cc: copyTo,
          },
        });
        toast.success(`${sent.number} sent`);
        void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
      }
      editInvoice(EMPTY_INVOICE_DRAFT);
      setInvoiceShare(false);
    } catch (error) {
      setProposalError(problemText(error, "could not send the invoice"));
    } finally {
      setProposalBusy(false);
    }
  }

  const listCents = dollarsToCents(proposalAmount);
  const courtesyCents = dollarsToCents(proposalCourtesy) ?? 0;
  const proposalCents = listCents == null ? null : Math.max(0, listCents - courtesyCents);
  const depositCents = proposalCents
    ? proposalPay === "full"
      ? proposalCents
      : Math.round(proposalCents / 2)
    : 0;
  const savedInvoice = data.proposals.find(
    (item) =>
      "invoice_number" in item && typeof item.invoice_number === "string" && item.invoice_number,
  );
  const savedInvoiceTitle =
    savedInvoice && typeof savedInvoice.invoice_number === "string"
      ? invoiceTitle(savedInvoice.invoice_number)
      : "";
  const proposalTemplate = BUILT_IN_TEMPLATES.find((item) => item.id === "proposal");
  const proposalLetterBody = proposalTemplate
    ? ensureProposalLink(
        applyTemplate(proposalTemplate.body, client?.name, EVENT_LABEL[inquiry.event_type]),
        proposalHref || `${PROPOSAL_ORIGIN}/${proposalSlug(client?.name ?? "")}`,
      )
    : "";

  const composer = (
    <ThreadComposer
      sendAs={sendAs}
      draft={draft}
      setDraft={setDraft}
      pending={post.isPending}
      canSend={sendAs === "note" || gmailConnected || devPreview}
      clientName={client?.name}
      facts={replyFacts}
      messages={visibleMessages}
      blockedNote={
        sendAs === "email" && !gmailConnected && !devPreview
          ? "connect gmail in settings to send."
          : null
      }
      clientEmail={client?.email}
      moreTo={moreTo}
      copyTo={copyTo}
      onMoreTo={setMoreTo}
      onCopyTo={setCopyTo}
      onSend={(body, sendAt, attachments) =>
        queueLetter(
          () =>
            post.mutate({
              body,
              ...(sendAt ? { sendAt } : {}),
              ...(attachments?.length ? { attachments } : {}),
            }),
          () => setDraft(body),
          client?.name ?? null,
        )
      }
      onUseSubject={(subject) => {
        setNewSubject(subject);
        setNamingThread(false);
        setStartingThread(true);
        setThreadKey(subject.toLowerCase());
      }}
      onOpenable={(files) => setOpenable((current) => ({ ...current, ...files }))}
      onKeep={(files) => Promise.all(files.map((file) => keepStudioFile(file)))}
    />
  );
  const sendRibbon = holding ? (
    <SendRibbon key={holding.id} line={holding.line} onUndo={() => sendHold.current?.undo()} />
  ) : null;

  return (
    <div
      className={cn(
        "studio-lead",
        `is-${stage}`,
        "is-layout-workflow",
        showSideThread && "is-side",
      )}
    >
      {showJob ? (
        <>
          <div className="studio-lead-top is-mast">
            <RecordMast
              title={
                isPersonType(client?.type) && client?.name ? (
                  <PersonName name={client.name} />
                ) : (
                  (client?.name ?? "client")
                )
              }
              date={
                dateTbd
                  ? "date tbd"
                  : dateDraft
                    ? formatDateNumeric(dateValue)
                    : holdLabel || formatDateNumeric(inquiry.event_date)
              }
              time={dateTbd ? "" : time}
              place={place}
            />

            <div className="studio-lead-tags">
              <span className="studio-tag">{EVENT_LABEL[inquiry.event_type]}</span>
              {candidate ? <span className="studio-tag">needs review</span> : null}
              {inquiry.source ? <span className="studio-tag">{inquiry.source}</span> : null}
            </div>

            {candidate ? null : (
              <div className="studio-lead-path">
                <ol className="studio-steps" aria-label="job path">
                  {PIPELINE_PATH.map((step) => {
                    const on = step.statuses.includes(inquiry.status);
                    return (
                      <li key={step.id}>
                        <button
                          type="button"
                          className={cn(
                            `is-${step.id}`,
                            on && "is-on",
                            inquiry.status === "closed" && "is-dim",
                          )}
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
              </div>
            )}
          </div>

          {inquiry.status === "closed" ? (
            <p className="studio-muted">{inquiry.closed_reason || "this inquiry is archived."}</p>
          ) : null}

          <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
            <DialogContent
              overlayClassName="studio-task-veil"
              className="studio-task-modal is-ask is-confirm is-soft"
              hideClose
            >
              <div className="studio-task-head">
                <DialogClose className="studio-task-close" aria-label="Close">
                  <X aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogTitle className="sr-only">archive this inquiry</DialogTitle>
              <DialogDescription className="sr-only">
                confirm before this inquiry leaves the book.
              </DialogDescription>
              <div className="studio-task-form">
                <p className="studio-review-confirm">archive this inquiry? it leaves the book.</p>
                <div className="studio-ask-foot is-pair is-spread">
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={move.isPending}
                    onClick={() => setConfirmArchive(false)}
                  >
                    keep it
                  </button>
                  <button
                    type="button"
                    className="studio-today-go"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ status: "closed" })}
                  >
                    archive
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {!candidate && inquiry.summary_text ? (
            <section className="studio-module is-summary">
              <p className="studio-home-label" title="written by studio intelligence">
                <span className="studio-summary-mark" aria-hidden="true" />
                <span>summary</span>
                <span className="sr-only">written by studio intelligence</span>
              </p>
              {(() => {
                const lines = inquiry.summary_text
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean);
                const nextLine = lines.find((line) => /^next:/i.test(line));
                const story = lines.filter((line) => line !== nextLine).join(" ");
                return (
                  <>
                    {story ? <p>{story}</p> : null}
                    {nextLine ? (
                      <p className="studio-summary-next">
                        <span>next</span>
                        {nextLine.replace(/^next:\s*/i, "")}
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </section>
          ) : null}

          {candidate ? (
            <section className="studio-module is-next">
              <p className="studio-home-label">needs review</p>
              <h3>is this a true inquiry?</h3>
              <p>
                {inquiry.detection_reason ||
                  "gmail thinks this is a lead. it stays out of the book until you say so."}
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
          ) : null}

          <div className="studio-lead-grid">
            <section className="studio-module is-rows studio-event">
              <p className="studio-home-label">
                <Calendar aria-hidden="true" strokeWidth={1.5} />
                the moment
              </p>
              <dl className="studio-facts">
                <div>
                  <dt>date</dt>
                  <dd className="studio-fact-date">
                    <InquiryDatePicker
                      compact
                      allowPast
                      withTime={false}
                      value={dateTbd ? null : dateValue}
                      placeholder={dateTbd ? "tbd" : "add a date"}
                      disabled={dateTbd}
                      onChange={(next) => {
                        saveMoment.mutate(
                          next
                            ? { event_date: next, event_date_tbd: false }
                            : { event_date: null, event_date_tbd: true },
                        );
                      }}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={dateTbd}
                        onChange={(event) =>
                          saveMoment.mutate({
                            event_date: null,
                            event_date_tbd: event.target.checked,
                          })
                        }
                      />
                      tbd
                    </label>
                  </dd>
                </div>
                {space ? (
                  <div>
                    <dt>space</dt>
                    <dd>{space}</dd>
                  </div>
                ) : null}
                {cadence ? (
                  <div>
                    <dt>cadence</dt>
                    <dd>{cadence}</dd>
                  </div>
                ) : null}
                <div className="studio-facts-place">
                  <dt>place</dt>
                  <dd>
                    <FloridaAddressPicker
                      line
                      label="place"
                      value={placeText}
                      placeholder="add a place"
                      onChange={setPlaceDraft}
                      onCommit={keepPlace}
                    />
                  </dd>
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
                  <DialogContent
                    overlayClassName="studio-task-veil"
                    className="studio-task-modal is-ask"
                    hideClose
                  >
                    <div className="studio-task-head">
                      <DialogClose className="studio-task-close" aria-label="Close">
                        <X aria-hidden="true" />
                      </DialogClose>
                    </div>
                    <DialogTitle className="sr-only">client form</DialogTitle>
                    <DialogDescription className="sr-only">
                      their details, and what they answered.
                    </DialogDescription>
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
                          onChange={(event) =>
                            setClientForm({ ...clientForm, name: event.target.value })
                          }
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
                            onChange={(event) =>
                              setClientForm({ ...clientForm, email: event.target.value })
                            }
                          />
                        </label>
                        <label className="studio-ask-field">
                          <span className="studio-ask-label">phone</span>
                          <input
                            type="tel"
                            value={clientForm.phone}
                            maxLength={40}
                            autoComplete="tel"
                            onChange={(event) =>
                              setClientForm({ ...clientForm, phone: event.target.value })
                            }
                          />
                        </label>
                        <span className="studio-ask-label studio-ask-span">they answered</span>
                        {answers.map((field) => (
                          <AnswerField
                            key={field.label}
                            label={field.label}
                            value={field.value}
                            wide={field.wide}
                            lines={field.lines}
                          />
                        ))}
                      </div>
                      <div className="studio-ask-foot">
                        <button
                          type="submit"
                          className="studio-today-go"
                          disabled={
                            keepClient.isPending ||
                            !clientForm.name.trim() ||
                            !clientForm.email.trim()
                          }
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
              <p className="studio-home-label">
                <User aria-hidden="true" strokeWidth={1.5} />
                client details
              </p>
              <dl className="studio-facts">
                <div>
                  <dt>name</dt>
                  <dd>
                    {isPersonType(client?.type) && client?.name ? (
                      <PersonName name={client.name} />
                    ) : (
                      (client?.name ?? "client")
                    )}
                  </dd>
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
                  <Link
                    to="/clients/$id"
                    params={{ id: recordSlug(client.name) }}
                    className="studio-ghost"
                  >
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
          {(["conversation", "proposal", "invoice", "files", "note"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={focus === item}
              className={focus === item ? "is-on" : undefined}
              onClick={() => setFocus(item)}
            >
              {focus === item ? <i className="studio-pill-dot" aria-hidden="true" /> : null}
              {item === "note" ? "internal note" : item}
            </button>
          ))}
        </div>
      ) : null}

      {threadOpen ? (
        <section
          className={cn("studio-module studio-lead-thread", showSideThread && "studio-activity")}
        >
          <p className="studio-home-label">
            {sendAs === "note" ? (
              <NotebookPen aria-hidden="true" strokeWidth={1.5} />
            ) : (
              <MessageCircle aria-hidden="true" strokeWidth={1.5} />
            )}
            {sendAs === "note" ? "internal note" : "conversation"}
          </p>
          {surface === "activity" ? (
            <div className="studio-tabs">
              <button
                type="button"
                className={activityTab === "messages" ? "is-on" : undefined}
                onClick={() => setActivityTab("messages")}
              >
                messages
              </button>
              <button
                type="button"
                className={activityTab === "notes" ? "is-on" : undefined}
                onClick={() => setActivityTab("notes")}
              >
                notes
              </button>
            </div>
          ) : null}
          {sendAs === "email" ? (
            <div className="studio-threads" role="tablist" aria-label="conversations">
              {shownThreads.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={!startingThread && activeThread === key}
                  className={!startingThread && activeThread === key ? "is-on" : undefined}
                  onClick={() => {
                    setStartingThread(false);
                    setThreadKey(key);
                  }}
                >
                  {key}
                </button>
              ))}
              {pendingSubject ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={startingThread}
                  className={startingThread ? "is-on" : undefined}
                  onClick={() => {
                    setNamingThread(false);
                    setStartingThread(true);
                    setThreadKey(pendingSubject.toLowerCase());
                  }}
                >
                  {pendingSubject}
                </button>
              ) : null}
              {namingThread ? (
                <input
                  className="studio-thread-name"
                  value={newSubject}
                  autoFocus
                  placeholder="subject"
                  aria-label="new conversation subject"
                  onChange={(event) => setNewSubject(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const subject = newSubject.trim();
                      if (!subject) return;
                      setNewSubject(subject);
                      setNamingThread(false);
                      setStartingThread(true);
                      setThreadKey(subject.toLowerCase());
                    }
                    if (event.key === "Escape") {
                      setNamingThread(false);
                      setStartingThread(false);
                      setNewSubject("");
                    }
                  }}
                  onBlur={() => {
                    const subject = newSubject.trim();
                    if (!subject) {
                      setNamingThread(false);
                      setStartingThread(false);
                      setNewSubject("");
                      return;
                    }
                    setNewSubject(subject);
                    setNamingThread(false);
                    setStartingThread(true);
                    setThreadKey(subject.toLowerCase());
                  }}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  onClick={() => {
                    setNewSubject("");
                    setNamingThread(true);
                    setStartingThread(true);
                  }}
                >
                  new
                </button>
              )}
            </div>
          ) : null}
          {showSideThread ? (
            <>
              {composer}
              {sendRibbon}
            </>
          ) : null}
          <div className="studio-mail-scroll" ref={mailScroll}>
            {sendAs === "note" ? (
              <NoteList
                messages={visibleMessages}
                profile={profile}
                onSave={async (noteId, body) => {
                  if (!devPreview) await reviseNote({ data: { id: noteId, body } });
                  setNoteBodies((current) => ({ ...current, [noteId]: body }));
                  if (!devPreview)
                    void queryClient.invalidateQueries({
                      queryKey: ["os", "inquiry-workspace", id],
                    });
                }}
                onDelete={async (noteId) => {
                  if (!devPreview) await dropNote({ data: { id: noteId } });
                  setRemovedNotes((current) => [...current, noteId]);
                  if (!devPreview)
                    void queryClient.invalidateQueries({
                      queryKey: ["os", "inquiry-workspace", id],
                    });
                }}
              />
            ) : (
              <MailFace
                messages={threadedMessages}
                clientName={client?.name}
                person={isPersonType(client?.type)}
                fileHrefs={fileHrefs}
                viewedAtByToken={viewedAtByToken}
                onCancel={(messageId) => void cancelLetter(messageId)}
              />
            )}
          </div>
          {showSideThread ? null : (
            <>
              {composer}
              {sendRibbon}
            </>
          )}
        </section>
      ) : null}

      {surface === "rail" ? (
        <section className="studio-module">
          <p className="studio-home-label">
            <Calendar aria-hidden="true" strokeWidth={1.5} />
            the moment
          </p>
          <h3>what we’re designing</h3>
          <dl className="studio-facts">
            <div>
              <dt>date</dt>
              <dd className="studio-fact-date">
                <InquiryDatePicker
                  compact
                  allowPast
                  withTime={false}
                  value={dateTbd ? null : dateValue}
                  placeholder={dateTbd ? "tbd" : "add a date"}
                  disabled={dateTbd}
                  onChange={(next) => {
                    saveMoment.mutate(
                      next
                        ? { event_date: next, event_date_tbd: false }
                        : { event_date: null, event_date_tbd: true },
                    );
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={dateTbd}
                    onChange={(event) =>
                      saveMoment.mutate({ event_date: null, event_date_tbd: event.target.checked })
                    }
                  />
                  tbd
                </label>
              </dd>
            </div>
            {space ? (
              <div>
                <dt>space</dt>
                <dd>{space}</dd>
              </div>
            ) : null}
            {cadence ? (
              <div>
                <dt>cadence</dt>
                <dd>{cadence}</dd>
              </div>
            ) : null}
            <div className="studio-facts-place">
              <dt>place</dt>
              <dd>
                <FloridaAddressPicker
                  line
                  label="place"
                  value={placeText}
                  placeholder="add a place"
                  onChange={setPlaceDraft}
                  onCommit={keepPlace}
                />
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {offerOpen ? (
        <section className="studio-module studio-lead-offer">
          <p className="studio-home-label">
            <FileText aria-hidden="true" strokeWidth={1.5} />
            proposal
          </p>
          <div className="studio-proposal-desk">
            <label
              className={cn(
                "studio-file-drop",
                proposalOver && "is-over",
                (proposalFile || proposalName) && "is-set",
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setProposalOver(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setProposalOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                takeProposal(event.dataTransfer.files[0]);
              }}
            >
              <Upload aria-hidden="true" strokeWidth={1.5} />
              <small>{proposalName ? "replace" : "or browse"}</small>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => {
                  takeProposal(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <div className="studio-proposal-terms is-cards">
              <div className="studio-proposal-money">
                <label className="studio-ask-field">
                  <span className="studio-ask-label">amount</span>
                  <span className="studio-money">
                    <span aria-hidden="true">$</span>
                    <input
                      className="studio-textarea"
                      value={proposalAmount}
                      onChange={(event) => {
                        setProposalAmount(formatDollarInput(event.target.value));
                      }}
                      placeholder="12,000"
                      inputMode="decimal"
                    />
                  </span>
                </label>
                <label className="studio-ask-field">
                  <span className="studio-ask-label">courtesy discount</span>
                  <span className="studio-money">
                    <span aria-hidden="true">$</span>
                    <input
                      className="studio-textarea"
                      value={proposalCourtesy}
                      onChange={(event) => {
                        setProposalCourtesy(formatDollarInput(event.target.value));
                      }}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </span>
                </label>
              </div>
              <div className="studio-proposal-cards" role="group" aria-label="payment method">
                <div
                  className={cn("studio-proposal-card", proposalPay === "deposit" && "is-on")}
                  onClick={() => {
                    proposalDirty.current = true;
                    setProposalPay("deposit");
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={proposalPay === "deposit"}
                    onClick={() => {
                      proposalDirty.current = true;
                      setProposalPay("deposit");
                    }}
                  >
                    {proposalPay === "deposit" ? (
                      <i className="studio-pill-dot" aria-hidden="true" />
                    ) : null}
                    deposit
                  </button>
                  <small>
                    {proposalCents
                      ? formatMoneyExact(Math.round(proposalCents / 2))
                      : "half the amount"}
                  </small>
                </div>
                <div
                  className={cn("studio-proposal-card", proposalPay === "full" && "is-on")}
                  onClick={() => {
                    proposalDirty.current = true;
                    setProposalPay("full");
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={proposalPay === "full"}
                    onClick={() => {
                      proposalDirty.current = true;
                      setProposalPay("full");
                    }}
                  >
                    {proposalPay === "full" ? (
                      <i className="studio-pill-dot" aria-hidden="true" />
                    ) : null}
                    pay in full
                  </button>
                  <small>
                    {proposalCents ? formatMoneyExact(proposalCents) : "the whole amount"}
                  </small>
                </div>
              </div>
              <div className="studio-proposal-work">
                <p className="studio-home-label">statement of work</p>
                <div className="studio-ask-grid is-two">
                  {STATEMENT_FIELDS.map((field) => (
                    <label key={field.key} className="studio-ask-field">
                      <span className="studio-ask-label">{field.label}</span>
                      <input
                        className="studio-textarea"
                        value={work[field.key]}
                        onChange={(event) => {
                          proposalDirty.current = true;
                          setWork((current) => ({ ...current, [field.key]: event.target.value }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {proposalError && !proposalShare ? (
              <p className="studio-composer-note">{proposalError}</p>
            ) : null}
            <div className={cn("studio-ask-foot", profile.role === "admin" && "is-spread")}>
              {profile.role === "admin" ? (
                <span className="studio-proposal-tools">
                  <button
                    type="button"
                    className="studio-proposal-preview"
                    onClick={() => setPacketOpen(true)}
                  >
                    preview
                  </button>
                  {proposalName || proposalHref ? (
                    <button
                      type="button"
                      className="studio-proposal-preview"
                      disabled={clearOffer.isPending}
                      onClick={() => setConfirmClear(true)}
                    >
                      clear
                    </button>
                  ) : null}
                </span>
              ) : null}
              <Popover open={shareMenu} onOpenChange={setShareMenu}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="studio-today-go"
                    aria-expanded={shareMenu}
                    disabled={proposalBusy || post.isPending}
                  >
                    {copiedLink ? "copied" : "share"}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="top"
                  sideOffset={8}
                  collisionPadding={16}
                  className="studio-proposal-share w-44 border-0 shadow-none data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  onFocusOutside={(event) => event.preventDefault()}
                >
                  <button
                    type="button"
                    disabled={proposalBusy}
                    onClick={() => {
                      if (!proposalHref) {
                        void copyProposal();
                        return;
                      }
                      const href = proposalHref;
                      const write = navigator.clipboard?.writeText?.(href);
                      setProposalError("");
                      markShared();
                      if (!write) {
                        if (copyText(href)) markCopied();
                        else setProposalError("could not copy the link");
                        return;
                      }
                      void write.then(
                        () => markCopied(),
                        () => {
                          setProposalError("could not copy the link");
                          toast.error("could not copy the link");
                        },
                      );
                    }}
                  >
                    {copiedLink ? "copied" : "copy link"}
                  </button>
                  <button
                    type="button"
                    disabled={proposalBusy}
                    onClick={() => {
                      setShareMenu(false);
                      downloadProposal();
                    }}
                  >
                    download
                  </button>
                  <button
                    type="button"
                    disabled={proposalBusy || post.isPending}
                    onClick={() => {
                      const problem = proposalProblem();
                      setShareMenu(false);
                      if (problem) {
                        setProposalError(problem);
                        return;
                      }
                      setProposalError("");
                      setProposalShare(true);
                    }}
                  >
                    email
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
            <DialogContent
              overlayClassName="studio-task-veil"
              className="studio-task-modal is-ask is-confirm is-soft"
              hideClose
            >
              <div className="studio-task-head">
                <DialogClose className="studio-task-close" aria-label="Close">
                  <X aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogTitle className="sr-only">clear this proposal</DialogTitle>
              <DialogDescription className="sr-only">
                confirm before the proposal comes off this inquiry.
              </DialogDescription>
              <div className="studio-task-form">
                <p className="studio-review-confirm">
                  clear this proposal? its link stops working, and you can start a new one.
                </p>
                <div className="studio-ask-foot is-pair is-spread">
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={clearOffer.isPending}
                    onClick={() => setConfirmClear(false)}
                  >
                    keep it
                  </button>
                  <button
                    type="button"
                    className="studio-today-go"
                    disabled={clearOffer.isPending}
                    onClick={() => clearOffer.mutate()}
                  >
                    {clearOffer.isPending ? "clearing…" : "clear"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={packetOpen} onOpenChange={setPacketOpen}>
            <DialogContent
              overlayClassName="studio-task-veil"
              className="studio-task-modal is-packet is-soft"
              hideClose
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <div className="studio-task-head is-ask studio-packet-nav">
                <div className="studio-proposal-preview-nav" role="tablist" aria-label="preview">
                  {(
                    [
                      ["proposal", "proposal"],
                      ["agreement", "service agreement"],
                      ["invoice", "invoice"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={packetKind === kind}
                      className={packetKind === kind ? "is-on" : undefined}
                      onClick={() => setPacketKind(kind)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <DialogClose className="studio-task-close" aria-label="Close">
                  <X aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogTitle className="sr-only">preview the packet</DialogTitle>
              <DialogDescription className="sr-only">
                proposal, service agreement, and invoice.
              </DialogDescription>
              <PacketPreview
                kind={packetKind}
                clientName={client?.name ?? ""}
                clientEmail={client?.email ?? ""}
                work={work}
                totalCents={proposalCents ?? 0}
                courtesyCents={courtesyCents}
                depositCents={depositCents}
                fileUrl={localProposalUrl || keptPdfUrl}
                invoiceNumber={savedInvoiceTitle}
                stored={
                  proposalKey.current?.startsWith("preview_")
                    ? readPreviewProposal(proposalKey.current)
                    : null
                }
              />
            </DialogContent>
          </Dialog>
          <Dialog open={proposalShare} onOpenChange={setProposalShare}>
            <DialogContent
              overlayClassName="studio-task-veil"
              className="studio-task-modal is-ask is-soft"
              hideClose
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <div className="studio-task-head">
                <DialogClose className="studio-task-close" aria-label="Close">
                  <X aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogTitle className="sr-only">email the proposal</DialogTitle>
              <DialogDescription className="sr-only">
                this is the letter they will receive.
              </DialogDescription>
              <div className="studio-task-form">
                <LetterPreview
                  body={proposalLetterBody}
                  href={proposalHref}
                  sender={signatureName(profile.full_name)}
                />
                {proposalError ? <p className="studio-composer-note">{proposalError}</p> : null}
                <div className="studio-ask-foot">
                  <button
                    type="button"
                    className="studio-today-go"
                    disabled={proposalBusy || post.isPending}
                    onClick={() => void emailProposal()}
                  >
                    {proposalBusy || post.isPending ? "sending" : "send"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}

      {invoiceOpen ? (
        <section className="studio-module studio-lead-offer">
          <p className="studio-home-label">
            <FileText aria-hidden="true" strokeWidth={1.5} />
            invoice
          </p>
          <div className="studio-proposal-terms is-cards">
            <div className="studio-proposal-money">
              <label className="studio-ask-field">
                <span className="studio-ask-label">amount</span>
                <span className="studio-money">
                  <span aria-hidden="true">$</span>
                  <input
                    className="studio-textarea"
                    value={
                      invoiceItems.length
                        ? formatDollarInput(String(invoiceListCents / 100))
                        : invoiceDraft.amount
                    }
                    readOnly={invoiceItems.length > 0}
                    title={invoiceItems.length > 0 ? "set by the items below" : undefined}
                    onChange={(event) =>
                      editInvoice({ amount: formatDollarInput(event.target.value) })
                    }
                    placeholder="250"
                    inputMode="decimal"
                  />
                </span>
              </label>
              <label className="studio-ask-field">
                <span className="studio-ask-label">courtesy discount</span>
                <span className="studio-money">
                  <span aria-hidden="true">$</span>
                  <input
                    className="studio-textarea"
                    value={invoiceDraft.courtesy}
                    onChange={(event) =>
                      editInvoice({ courtesy: formatDollarInput(event.target.value) })
                    }
                    placeholder="0"
                    inputMode="decimal"
                  />
                </span>
              </label>
            </div>
            <div className="studio-proposal-cards" role="group" aria-label="payment">
              {(
                [
                  [
                    "full",
                    "pay in full",
                    invoiceTotalCents ? formatMoneyExact(invoiceTotalCents) : "the whole amount",
                  ],
                  [
                    "deposit",
                    "deposit",
                    invoiceTotalCents
                      ? formatMoneyExact(Math.round(invoiceTotalCents / 2))
                      : "half the amount",
                  ],
                ] as const
              ).map(([pay, label, hint]) => (
                <div
                  key={pay}
                  className={cn("studio-proposal-card", invoiceDraft.pay === pay && "is-on")}
                  onClick={() => editInvoice({ pay })}
                >
                  <button
                    type="button"
                    aria-pressed={invoiceDraft.pay === pay}
                    onClick={() => editInvoice({ pay })}
                  >
                    {invoiceDraft.pay === pay ? (
                      <i className="studio-pill-dot" aria-hidden="true" />
                    ) : null}
                    {label}
                  </button>
                  <small>{hint}</small>
                </div>
              ))}
            </div>
          </div>
          {proposalError ? <p className="studio-composer-note">{proposalError}</p> : null}
          <InvoicePreview
            clientName={client?.name || "client"}
            clientEmail={client?.email ?? ""}
            number="new invoice"
            service={floralPackageName(work.occasion || work.flowers)}
            bookingLine={invoiceBookingLine(
              work.occasion || work.flowers,
              invoiceDateLabel(work.eventWhen),
            )}
            listCents={invoiceListCents}
            courtesyCents={invoiceCourtesyCents}
            totalCents={invoiceTotalCents}
            depositCents={invoiceDueCents}
            issuedOn={new Date().toISOString()}
            items={invoiceItems}
            catalog={catalog}
            onItems={(items) => editInvoice({ items })}
            onSend={previewInvoice}
            sending={proposalBusy || post.isPending}
            people={
              <MailPeople
                inline
                clientEmail={client?.email ?? null}
                more={moreTo}
                copy={copyTo}
                onMore={setMoreTo}
                onCopy={setCopyTo}
              />
            }
          />
          {sentInvoices.length ? (
            <div className="studio-sent-invoices">
              <p className="studio-ask-label">sent</p>
              {sentInvoices.map((sent) => (
                <div key={sent.id} className="studio-ledger-row">
                  <b>
                    {sent.number}
                    <small>
                      {formatMoneyExact(sent.total_cents)}
                      {sent.pay_in_full
                        ? ""
                        : ` · ${formatMoneyExact(sent.due_now_cents)} deposit`}{" "}
                      · {mailStamp(sent.sent_at)}
                    </small>
                  </b>
                  <span className="studio-file-actions">
                    <i className={cn("studio-invoice-status", `is-${sent.status}`)}>
                      {INVOICE_STATUS[sent.status] ?? sent.status}
                    </i>
                    {sent.public_url ? (
                      <a
                        href={sent.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="auth-text-action"
                      >
                        open in square
                      </a>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {filesOpen ? (
        <section className="studio-module studio-lead-files">
          <p className="studio-home-label">
            <Folder aria-hidden="true" strokeWidth={1.5} />
            files
          </p>
          <label
            className={cn("studio-file-drop", fileOver && "is-over")}
            onDragEnter={(event) => {
              event.preventDefault();
              setFileOver(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setFileOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setFileOver(false);
              const dropped = event.dataTransfer.files;
              for (const file of Array.from(dropped)) void keepStudioFile(file);
            }}
          >
            <Upload aria-hidden="true" strokeWidth={1.5} />
            <b>{fileOver ? "drop it here" : "drop a file here"}</b>
            {fileOver ? null : <small>or browse</small>}
            <input
              type="file"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void keepStudioFile(file);
              }}
            />
          </label>
          {allFiles.map((file) => (
            <div key={file.id} className="studio-ledger-row">
              <b>{file.name ?? file.file_path}</b>
              <span className="studio-file-actions">
                {"signed_url" in file && file.signed_url ? (
                  <a
                    href={file.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="auth-text-action"
                  >
                    open
                  </a>
                ) : null}
                <button
                  type="button"
                  className="studio-ghost"
                  disabled={removingFile === file.id}
                  onClick={() =>
                    setFileToRemove({ id: file.id, name: file.name ?? file.file_path })
                  }
                >
                  {removingFile === file.id ? "removing…" : "remove"}
                </button>
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <Dialog
        open={Boolean(fileToRemove)}
        onOpenChange={(open) => (open ? null : setFileToRemove(null))}
      >
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask is-confirm is-soft"
          hideClose
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">remove this file</DialogTitle>
          <DialogDescription className="sr-only">
            confirm before the file leaves this lead.
          </DialogDescription>
          <div className="studio-task-form">
            <p className="studio-review-confirm">
              remove {fileToRemove?.name}? it leaves this lead for good.
            </p>
            <div className="studio-ask-foot is-pair is-spread">
              <button type="button" className="studio-ghost" onClick={() => setFileToRemove(null)}>
                keep it
              </button>
              <button
                type="button"
                className="studio-today-go"
                onClick={() => fileToRemove && void removeStudioFile(fileToRemove)}
              >
                remove
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceShare} onOpenChange={setInvoiceShare}>
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask is-soft"
          hideClose
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">email the invoice</DialogTitle>
          <DialogDescription className="sr-only">
            this is the letter they will receive.
          </DialogDescription>
          <div className="studio-task-form">
            {invoiceShare ? (
              <LetterPreview
                subject={invoiceLetter().subject}
                body={invoiceLetter().text}
                href={null}
                button="pay your invoice"
                to={mailRecord(uniqueMails([client?.email, ...moreTo]), copyTo).line}
                sender={signatureName(profile.full_name)}
              />
            ) : null}
            {proposalError ? <p className="studio-composer-note">{proposalError}</p> : null}
            <div className="studio-ask-foot is-pair is-spread">
              <button
                type="button"
                className="studio-ghost"
                disabled={proposalBusy || post.isPending}
                onClick={() => setInvoiceShare(false)}
              >
                keep editing
              </button>
              <button
                type="button"
                className="studio-today-go"
                disabled={proposalBusy || post.isPending}
                onClick={() => void emailInvoice()}
              >
                {proposalBusy || post.isPending ? "sending" : "send invoice"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showJob && !candidate && inquiry.status !== "closed" ? (
        <button
          type="button"
          className="studio-ghost studio-lead-archive"
          onClick={() => setConfirmArchive(true)}
        >
          archive this inquiry
        </button>
      ) : null}
    </div>
  );
}

const SEND_HOLD_MS = 10_000;

/** The ten seconds after send: a pink line drains under the letter, with undo beside it. */
function SendRibbon({ line, onUndo }: { line: string; onUndo: () => void }) {
  const [left, setLeft] = useState(SEND_HOLD_MS / 1000);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      setLeft(Math.max(0, Math.ceil((SEND_HOLD_MS - (Date.now() - started)) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="studio-send-ribbon" role="status">
      <div className="studio-send-ribbon-row">
        <span>
          {line} in <em>{left}</em>
        </span>
        <button type="button" className="studio-send-undo" onClick={onUndo}>
          undo
        </button>
      </div>
      <div className="studio-send-ribbon-track" aria-hidden="true">
        <i style={{ animationDuration: `${SEND_HOLD_MS}ms` }} />
      </div>
    </div>
  );
}
