import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Calendar, CalendarClock, FileArchive, FileText, Folder, Image, Link2, MessageCircle, NotebookPen, Paperclip, Sparkles, SquarePen, Upload, User, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { TextShimmer } from "@/components/core/text-shimmer";
import { FloralAgreement } from "@/components/proposal/FloralAgreement";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wordmark } from "@/components/portal/bits";
import { PersonName, isPersonType } from "@/components/studio/PersonName";
import { isStudioOwner, noteAuthor, noteWriter, SIGNATURE_LINKS, signatureName, wroteNote } from "@/lib/os/mail-signature";
import { applyTemplate, loadTemplates, saveTemplates, type MailTemplate } from "@/lib/os/mail-templates";
import { scheduleMeetingUrl } from "@/lib/studio-bookings";
import type { InquiryMessageRow, InquiryStatus } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { getDevPreviewInquiryWorkspace, previewArchiveInquiry, previewReviewDecision } from "@/lib/dev-preview";
import {
  markPreviewProposalSent,
  previewProposalForInquiry,
  readPreviewProposal,
  savePreviewProposal,
  updatePreviewProposalTerms,
} from "@/lib/preview-proposals";
import { STATEMENT_FIELDS, INVOICE_THANKS, courtesyFromNotes, floralPackageName, invoiceBookingLine, invoiceDateLabel, invoiceSharedDate, statementFromNotes, statementOfWork, type StatementOfWork } from "@/lib/floral-agreement";
import { dollarsToCents, ensureProposalLink, formatDollarInput, letterWithProposalUrl, proposalCards, readFileDataUrl } from "@/lib/proposal-link";
import { formatDateNumeric, formatMoneyExact } from "@/lib/money";
import {
  EVENT_LABEL,
  PIPELINE_PATH,
  boardStageId,
  confidenceLabel,
  initials,
  inquiryTime,
  recordSlug,
  sourceExcerpt,
} from "@/lib/os/inquiry-desk";
import { saveClient } from "@/lib/os/clients.functions";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import {
  addInquiryMessage,
  attachInquiryFile,
  deleteInquiryNote,
  getInquiryWorkspace,
  reviewDetectedInquiry,
  setInquiryStatus,
  updateInquiryNote,
} from "@/lib/os/inquiries.functions";
import { importProposalPdf } from "@/lib/os/proposals.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

type Focus = "conversation" | "proposal" | "files" | "note";
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

type DraftFile = { id: string; name: string; size: number };
type ComposeTool = "schedule" | "link" | "write";

const PROPOSAL_THREAD = "your floral proposal";

function previewLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function ContextPreview({ name, body }: { name: string; body: string }) {
  return (
    <div className="studio-compose-preview">
      <b>{name}</b>
      <em>{previewLine(body) || "nothing here yet."}</em>
    </div>
  );
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

function formatSendAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const MAIL_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;

function normalizeHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  return /^https?:\/\//i.test(href) ? href : `https://${href}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function draftToHtml(value: string) {
  return escapeHtml(value)
    .replace(new RegExp(MAIL_LINK.source, "g"), (_match, label: string, href: string) => `<a href="${href}">${label}</a>`)
    .replace(/\n/g, "<br>");
}

function htmlToDraft(root: HTMLElement) {
  let out = "";
  const walk = (node: Node, leadingBreak: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node instanceof HTMLAnchorElement) {
      const label = node.textContent ?? "";
      const href = node.getAttribute("href") ?? "";
      out += href ? `[${label}](${href})` : label;
      return;
    }
    const block = node.tagName === "DIV" || node.tagName === "P";
    if (block && leadingBreak && out && !out.endsWith("\n")) out += "\n";
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    node.childNodes.forEach((child, index) => walk(child, block && index === 0 ? false : true));
  };
  root.childNodes.forEach((child, index) => walk(child, index > 0));
  return out.replace(/\n$/, "");
}

function splitMail(body: string) {
  const match = body.match(/\n*Attached:\s*([^\n]+)\s*$/);
  if (!match || match.index == null) return { text: body, files: [] as string[] };
  const files = match[1].split(",").map((name) => name.trim()).filter(Boolean);
  return { text: body.slice(0, match.index).trimEnd(), files };
}

const PORTAL_FILES: Record<string, string> = {
  "ceremony-layout.pdf": "/attachments/ceremony-layout.pdf",
  "reference-photos.zip": "/attachments/reference-photos.zip",
};

function MailFile({ name, href }: { name: string; href?: string | null }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const archive = ext === "zip";
  const body = (
    <>
      {archive ? <FileArchive aria-hidden="true" strokeWidth={1.5} /> : <FileText aria-hidden="true" strokeWidth={1.5} />}
      <span>
        <b>{name}</b>
        <small>{ext || "file"}</small>
      </span>
    </>
  );
  if (!href) return <span className="studio-mail-file">{body}</span>;
  return (
    <a className="studio-mail-file" href={href} target="_blank" rel="noreferrer">
      {body}
    </a>
  );
}

function MailSignature({ name }: { name: string }) {
  const person = signatureName(name);
  return (
    <footer className="studio-mail-sign">
      <p className="studio-mail-sign-close">With Gratitude,</p>
      <Wordmark tone="white" className="studio-mail-sign-mark" />
      <p>
        <strong>
          <PersonName name={person} /> | Say Sukii
        </strong>
      </p>
      {isStudioOwner(person) ? <p>Floral Artist, Founder & Creative Director</p> : null}
      <p>
        <a href={SIGNATURE_LINKS.site}>saysukii.com</a>
      </p>
      <p>
        <a href={SIGNATURE_LINKS.instagram}>instagram</a>
      </p>
      <p>
        let's talk! <a href={scheduleMeetingUrl()}>schedule meeting here</a>
      </p>
    </footer>
  );
}

function MailBody({ body }: { body: string }) {
  const parts: ReactNode[] = [];
  const pattern = new RegExp(MAIL_LINK.source, "g");
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(body.slice(last, index));
    parts.push(
      <a key={index} href={match[2]} target="_blank" rel="noreferrer">
        {match[1]}
      </a>,
    );
    last = index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <p className="studio-mail-body">{parts}</p>;
}

function withoutSignoff(text: string) {
  return text.replace(/\n*say sukii\s*$/i, "").trimEnd();
}

function threadBase(subject: string | null | undefined) {
  return (subject || "").replace(/^(re:\s*)+/gi, "").trim() || "conversation";
}

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || "there";
}

function proposalLetter(template: MailTemplate, name: string | null | undefined, href: string | null, job?: string | null) {
  const body = applyTemplate(template.body, name, job);
  if (!href) return `${body}\n\nyour proposal`;
  return letterWithProposalUrl(ensureProposalLink(body, href));
}

function heldLine(facts: { eventDate?: string | null; dateTbd?: boolean | null; place?: string | null }) {
  const when = facts.dateTbd ? null : formatDateNumeric(facts.eventDate);
  const place = facts.place?.split(",")[0]?.trim();
  const held = [when, place].filter(Boolean).join(" at ");
  return held ? `I'll hold ${held}` : "I'll hold the date";
}

function studioReply(
  clientName: string | null | undefined,
  facts: { eventDate?: string | null; dateTbd?: boolean | null; place?: string | null },
  messages: InquiryMessageRow[],
) {
  const latest = messages.find((item) => item.direction === "inbound");
  const heard = latest?.body?.replace(/\s+/g, " ").trim();
  const note = heard ? `I have your note — ${heard.length > 220 ? `${heard.slice(0, 217)}…` : heard}` : "Thank you for writing.";
  return `${firstName(clientName)} —\n\n${note}\n\n${heldLine(facts)} and send a first look this week.`;
}

function ThreadComposer({
  sendAs,
  draft,
  setDraft,
  pending,
  canSend,
  clientName,
  facts,
  messages,
  blockedNote,
  onSend,
  onUseSubject,
  onOpenable,
}: {
  sendAs: "email" | "note";
  draft: string;
  setDraft: (value: string) => void;
  pending: boolean;
  canSend: boolean;
  clientName?: string | null;
  facts: { eventDate?: string | null; dateTbd?: boolean | null; place?: string | null; job?: string | null };
  messages: InquiryMessageRow[];
  blockedNote?: string | null;
  onSend: (body: string, sendAt?: string) => void;
  onUseSubject?: (subject: string) => void;
  onOpenable?: (files: Record<string, string>) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const linkPop = useRef<HTMLDivElement>(null);
  const linkHold = useRef<HTMLElement | null>(null);
  const linkSpan = useRef<{ start: number; end: number } | null>(null);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [sendAt, setSendAt] = useState("");
  const [tool, setTool] = useState<ComposeTool | null>(null);
  const [linkHref, setLinkHref] = useState("");
  const [linkAt, setLinkAt] = useState<{ top: number; left: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [templates, setTemplates] = useState<MailTemplate[]>(() => loadTemplates());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [confirm, setConfirm] = useState<{ body: string; sendAt: string } | null>(null);
  const email = sendAs === "email";

  function closeTemplateEditor() {
    setAddingTemplate(false);
    setEditingId(null);
    setTemplateName("");
    setTemplateSubject("");
    setTemplateBody("");
  }

  function beginTemplate(item?: MailTemplate) {
    setEditingId(item?.id ?? null);
    setTemplateName(item?.name ?? "");
    setTemplateSubject(item?.subject ?? "");
    setTemplateBody(item?.body ?? "");
    setAddingTemplate(true);
  }

  function keepTemplate() {
    const name = templateName.trim();
    const body = templateBody.trim();
    if (!name || !body) return;
    const subject = templateSubject.trim();
    const saved: MailTemplate = {
      id: editingId ?? crypto.randomUUID(),
      name,
      body,
      ...(subject ? { subject } : {}),
    };
    setTemplates((current) => {
      const next = editingId ? current.map((item) => (item.id === editingId ? saved : item)) : [saved, ...current];
      saveTemplates(next);
      return next;
    });
    closeTemplateEditor();
  }

  function useTemplate(item: MailTemplate) {
    setDraft(applyTemplate(item.body, clientName, facts.job));
    if (item.subject) onUseSubject?.(item.subject);
    setTemplatesOpen(false);
  }

  function toggle(next: ComposeTool) {
    setTool((current) => (current === next ? null : next));
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const picked = Array.from(list);
    const openable: Record<string, string> = {};
    for (const file of picked) openable[file.name] = URL.createObjectURL(file);
    onOpenable?.(openable);
    setFiles((current) => [
      ...current,
      ...picked.map((file) => ({ id: crypto.randomUUID(), name: file.name, size: file.size })),
    ]);
  }

  function clearLinkHold() {
    const hold = linkHold.current ?? editor.current?.querySelector(".studio-link-hold");
    linkHold.current = null;
    if (!(hold instanceof HTMLElement) || !hold.isConnected) return;
    hold.replaceWith(document.createTextNode(hold.textContent ?? ""));
  }

  function paintLinkHold(node: HTMLElement, start: number, end: number) {
    clearLinkHold();
    if (end <= start) return;
    const texts: Text[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      texts.push(current as Text);
      current = walker.nextNode();
    }
    let cursor = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;
    for (const text of texts) {
      const next = cursor + text.length;
      if (!startNode && next > start) {
        startNode = text;
        startOffset = start - cursor;
      }
      if (next >= end) {
        endNode = text;
        endOffset = end - cursor;
        break;
      }
      cursor = next;
    }
    if (!startNode || !endNode) return;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const hold = document.createElement("mark");
    hold.className = "studio-link-hold";
    hold.appendChild(range.extractContents());
    range.insertNode(hold);
    linkHold.current = hold;
  }

  useEffect(() => {
    const node = editor.current;
    if (!node || !email) return;
    if (htmlToDraft(node) !== draft) node.innerHTML = draft ? draftToHtml(draft) : "";
    if (tool === "link" && linkSpan.current) paintLinkHold(node, linkSpan.current.start, linkSpan.current.end);
  }, [draft, email, tool]);

  useEffect(() => {
    if (tool === "link") return;
    linkSpan.current = null;
    clearLinkHold();
  }, [tool]);

  useEffect(() => {
    if (tool !== "link") return;
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (linkPop.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[title='add a link']")) return;
      setTool(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTool(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [tool]);

  function openLink(event: { preventDefault: () => void }) {
    event.preventDefault();
    clearLinkHold();
    const node = editor.current;
    const selection = window.getSelection();
    const host = node?.closest(".studio-composer")?.getBoundingClientRect();
    if (node && selection && selection.rangeCount > 0 && node.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const selected = range.toString();
      if (!range.collapsed && selected.trim()) {
        const before = range.cloneRange();
        before.selectNodeContents(node);
        before.setEnd(range.startContainer, range.startOffset);
        const start = before.toString().length;
        linkSpan.current = { start, end: start + selected.length };
        paintLinkHold(node, start, start + selected.length);
      } else {
        linkSpan.current = null;
      }
      if (host && rect.height > 0) {
        const width = 280;
        setLinkAt({
          top: rect.bottom - host.top + 6,
          left: Math.min(Math.max(8, rect.left - host.left), Math.max(8, host.width - width - 8)),
        });
      } else {
        setLinkAt(null);
      }
    } else {
      setLinkAt(null);
    }
    setLinkHref("");
    setTool("link");
  }

  function placeLink() {
    const href = normalizeHref(linkHref);
    const node = editor.current;
    if (!href || !node) return;
    const hold = linkHold.current;
    const words = hold?.textContent ?? "";
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = words.trim() || href;
    if (hold?.isConnected) {
      linkHold.current = null;
      hold.replaceWith(anchor);
    } else {
      node.appendChild(document.createTextNode(node.textContent ? " " : ""));
      node.appendChild(anchor);
    }
    setDraft(htmlToDraft(node));
    linkSpan.current = null;
    setLinkHref("");
    setLinkAt(null);
    setTool(null);
  }

  function letterBody() {
    const text = draft.trim();
    const names = files.map((file) => file.name);
    if (!names.length) return text;
    return text ? `${text}\n\nAttached: ${names.join(", ")}` : `Attached: ${names.join(", ")}`;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = letterBody();
    if (!body || !canSend) return;
    if (!email) {
      setFiles([]);
      onSend(body);
      return;
    }
    setConfirm({ body, sendAt });
  }

  function commitSend() {
    if (!confirm) return;
    const { body, sendAt: when } = confirm;
    setConfirm(null);
    setDraft("");
    setFiles([]);
    setSendAt("");
    setTool(null);
    if (when) onSend(body, when);
    else onSend(body);
  }

  const ready = Boolean(draft.trim() || files.length);

  return (
    <form className="studio-composer" onSubmit={submit}>
      {email ? (
        <div
          ref={editor}
          className="studio-textarea studio-composer-editor"
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder={`write to ${clientName ?? "them"}`}
          data-empty={draft ? "false" : "true"}
          suppressContentEditableWarning
          onInput={() => {
            if (editor.current) setDraft(htmlToDraft(editor.current));
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            if (editor.current) setDraft(htmlToDraft(editor.current));
          }}
          onClick={(event) => {
            if (event.target instanceof HTMLAnchorElement) event.preventDefault();
          }}
        />
      ) : (
        <textarea
          ref={area}
          className="studio-textarea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="a note only the studio will see."
        />
      )}
      {files.length ? (
        <div className="studio-composer-chips">
          {files.map((file) => (
            <span key={file.id} className="studio-composer-chip">
              <span>
                {file.name}
                <small>{fileSize(file.size)}</small>
              </span>
              <button type="button" aria-label={`remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}>
                <X aria-hidden="true" strokeWidth={1.5} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {email && sendAt ? <p className="studio-composer-when">sends {formatSendAt(sendAt)}</p> : null}
      <div className="studio-composer-bar">
        {email ? (
          <div className="studio-composer-tools">
            <label className="studio-composer-tool" title="attach a file">
              <Paperclip aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">attach a file</span>
              <input
                type="file"
                multiple
                className="sr-only"
                accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed,*/*"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="studio-composer-tool" title="attach an image">
              <Image aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">attach an image</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <button type="button" className={cn("studio-composer-tool", tool === "schedule" && "is-on")} title="schedule the send" aria-pressed={tool === "schedule"} onClick={() => toggle("schedule")}>
              <CalendarClock aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">schedule the send</span>
            </button>
            <button type="button" className={cn("studio-composer-tool", templatesOpen && "is-on")} title="email templates" aria-pressed={templatesOpen} onClick={() => { setTool(null); setTemplatesOpen(true); }}>
              <SquarePen aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">email templates</span>
            </button>
            <button type="button" className={cn("studio-composer-tool", tool === "link" && "is-on")} title="add a link" aria-pressed={tool === "link"} onMouseDown={openLink}>
              <Link2 aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">add a link</span>
            </button>
            <button
              type="button"
              className={cn("studio-composer-tool", tool === "write" && "is-on")}
              title="help me write"
              aria-pressed={tool === "write"}
              onClick={() => setTool("write")}
            >
              <Sparkles aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">help me write</span>
            </button>
          </div>
        ) : null}
        <button type="submit" className="studio-today-go" disabled={pending || !ready || !canSend}>
          {email ? (sendAt ? "schedule" : "send") : "keep note"}
        </button>
      </div>
      {blockedNote ? <p className="studio-composer-note">{blockedNote}</p> : null}
      {email ? (
        <>
          <Dialog open={tool === "schedule"} onOpenChange={(open) => { if (!open) setTool(null); }}>
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
              <DialogTitle className="sr-only">schedule the send</DialogTitle>
              <DialogDescription className="sr-only">choose when this letter goes out.</DialogDescription>
              <div className="studio-task-form">
                <ContextPreview name={clientName || "this letter"} body={draft || "write the letter, then choose when it sends."} />
                <label className="studio-ask-field">
                  <span className="studio-ask-label">send at</span>
                  <input type="datetime-local" value={sendAt} onChange={(event) => setSendAt(event.target.value)} />
                </label>
                <div className="studio-ask-foot">
                  <button type="button" className="studio-today-go" disabled={!sendAt} onClick={() => setTool(null)}>
                    schedule
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {tool === "link" ? (
            <div
              ref={linkPop}
              className="studio-link-pop"
              role="dialog"
              aria-label="add a link"
              style={linkAt ? { top: linkAt.top, left: linkAt.left } : undefined}
            >
              <Link2 aria-hidden="true" strokeWidth={1.5} />
              <input
                autoFocus
                value={linkHref}
                onChange={(event) => setLinkHref(event.target.value)}
                placeholder="type or paste a link"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    placeLink();
                  }
                }}
              />
              <button type="button" disabled={!linkHref.trim()} onClick={placeLink}>
                apply
              </button>
            </div>
          ) : null}
          <Dialog open={tool === "write"} onOpenChange={(open) => { if (!open) setTool(null); }}>
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
              <DialogTitle className="sr-only">help me write</DialogTitle>
              <DialogDescription className="sr-only">a letter drawn from their latest note.</DialogDescription>
              <div className="studio-task-form">
                <ContextPreview
                  name={clientName || "them"}
                  body={messages.find((item) => item.direction === "inbound")?.body || "no note from them yet."}
                />
                <p className="studio-review-mail">{studioReply(clientName, facts, messages)}</p>
                <div className="studio-ask-foot">
                  <button
                    type="button"
                    className="studio-today-go"
                    onClick={() => {
                      setDraft(studioReply(clientName, facts, messages));
                      setTool(null);
                    }}
                  >
                    use this
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
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
              <DialogTitle className="sr-only">confirm this letter</DialogTitle>
              <DialogDescription className="sr-only">
                {confirm?.sendAt ? "this letter waits until the time you chose." : "after you send, there are 10 seconds to undo."}
              </DialogDescription>
              <div className="studio-task-form">
                <ContextPreview name={clientName || "this letter"} body={confirm?.body || ""} />
                {confirm?.sendAt ? <p className="studio-composer-when">sends {formatSendAt(confirm.sendAt)}</p> : null}
                <div className="studio-ask-foot">
                  <button type="button" className="studio-today-go" onClick={commitSend}>
                    {confirm?.sendAt ? "schedule" : "send"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={templatesOpen}
            onOpenChange={(open) => {
              setTemplatesOpen(open);
              if (!open) closeTemplateEditor();
            }}
          >
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
              <DialogTitle className="sr-only">email templates</DialogTitle>
              <DialogDescription className="sr-only">choose a letter, or add one of your own.</DialogDescription>
              <div className="studio-task-form">
                <button type="button" className="studio-template-add" onClick={() => beginTemplate()}>
                  add template
                </button>
                <div className="studio-template-list">
                  {templates.map((item) => (
                    <div key={item.id} className="studio-template-row">
                      <button type="button" className="studio-template-item" onClick={() => useTemplate(item)}>
                        <b>{item.name}</b>
                        <em>{previewLine(applyTemplate(item.body, clientName, facts.job))}</em>
                      </button>
                      <button type="button" className="studio-template-edit" onClick={() => beginTemplate(item)}>
                        edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <Dialog open={addingTemplate} onOpenChange={(open) => { if (!open) closeTemplateEditor(); }}>
                <DialogContent
                  overlayClassName="studio-task-veil z-[60]"
                  className="studio-task-modal is-ask is-soft z-[60]"
                  hideClose
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <div className="studio-task-head">
                    <DialogClose className="studio-task-close" aria-label="Close">
                      <X aria-hidden="true" />
                    </DialogClose>
                  </div>
                  <DialogTitle className="sr-only">{editingId ? "edit a template" : "add a template"}</DialogTitle>
                  <DialogDescription className="sr-only">name the letter, then write it.</DialogDescription>
                  <div className="studio-task-form">
                    <label className="studio-ask-field">
                      <span className="studio-ask-label">name</span>
                      <input
                        className="studio-template-letter"
                        value={templateName}
                        onChange={(event) => setTemplateName(event.target.value)}
                        placeholder="a name for this letter"
                      />
                    </label>
                    <label className="studio-ask-field">
                      <span className="studio-ask-label">subject</span>
                      <input
                        className="studio-template-letter"
                        value={templateSubject}
                        onChange={(event) => setTemplateSubject(event.target.value)}
                        placeholder="subject, when this letter starts its own conversation"
                      />
                    </label>
                    <label className="studio-ask-field">
                      <span className="studio-ask-label">letter</span>
                      <textarea
                        className="studio-template-letter"
                        value={templateBody}
                        onChange={(event) => setTemplateBody(event.target.value)}
                        placeholder="write it here. {name} becomes their first name. {{job.title}} becomes the job. {calendar} becomes the scheduler link."
                        rows={8}
                      />
                    </label>
                    <div className="studio-ask-foot">
                      <button
                        type="button"
                        className="studio-today-go"
                        disabled={!templateName.trim() || !templateBody.trim()}
                        onClick={keepTemplate}
                      >
                        keep template
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </form>
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
    <Link to="/pipeline" activeOptions={{ exact: true }} className="studio-record-back" aria-label="back to the book">
      <ArrowLeft aria-hidden="true" strokeWidth={1.5} />
    </Link>
  );
}

function mailStamp(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `today at ${time}`;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  return `${day} at ${time}`;
}

function noteTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase(),
    time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase(),
  };
}

function nextStamp(current: string | null | undefined, previous: string | null | undefined) {
  if (!previous) return true;
  const next = new Date(current || "");
  const prev = new Date(previous || "");
  if (Number.isNaN(next.getTime()) || Number.isNaN(prev.getTime())) return false;
  if (next.toDateString() !== prev.toDateString()) return true;
  return next.getTime() - prev.getTime() > 30 * 60 * 1000;
}

function mailParty(message: InquiryMessageRow, clientName: string | null | undefined) {
  const note = message.direction === "note" || message.channel === "note";
  const outbound = message.direction === "outbound";
  const name = note
    ? message.author?.trim() || "studio"
    : message.author?.trim() || (outbound ? "you" : clientName || "client");
  return {
    id: message.id,
    name,
    at: message.sent_at || message.created_at,
    note,
    outbound,
    mark: initials(name),
    subject: message.subject?.trim() || "",
    ...splitMail(message.body),
    waiting: message.status === "queued",
  };
}

function NoteList({
  messages,
  profile,
  onSave,
  onDelete,
}: {
  messages: InquiryMessageRow[];
  profile: { id: string; full_name: string | null; role: string };
  onSave: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const notes = [...messages].reverse();
  const isAdmin = profile.role === "admin";
  return (
    <div className="studio-note-list">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          canEdit={wroteNote(note, profile)}
          canDelete={isAdmin}
          onSave={onSave}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function NoteCard({
  note,
  canEdit,
  canDelete,
  onSave,
  onDelete,
}: {
  note: InquiryMessageRow;
  canEdit: boolean;
  canDelete: boolean;
  onSave: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"read" | "edit" | "delete">("read");
  const [draft, setDraft] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const written = noteTime(note.sent_at || note.created_at);

  async function save() {
    const text = draft.trim();
    if (!text || text === note.body.trim()) {
      setMode("read");
      return;
    }
    setBusy(true);
    try {
      await onSave(note.id, text);
      setMode("read");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "the note stayed as it was.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await onDelete(note.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "the note stayed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="studio-note-card">
      <time dateTime={note.sent_at || note.created_at || undefined}>
        {written ? (
          <>
            <span>{written.day}</span>
            <span>{written.time}</span>
          </>
        ) : null}
      </time>
      <div>
        {mode === "edit" ? (
          <textarea className="studio-textarea studio-note-edit" value={draft} onChange={(event) => setDraft(event.target.value)} />
        ) : (
          <p>{note.body.trim()}</p>
        )}
        <div className="studio-note-foot">
          {canEdit && mode === "edit" ? (
            <span className="studio-note-acts">
              <button type="button" disabled={busy || !draft.trim()} onClick={() => void save()}>
                save
              </button>
              <button type="button" disabled={busy} onClick={() => { setDraft(note.body); setMode("read"); }}>
                cancel
              </button>
            </span>
          ) : null}
          {canDelete && mode === "delete" ? (
            <span className="studio-note-acts">
              <span>delete this note?</span>
              <button type="button" disabled={busy} onClick={() => void remove()}>
                delete
              </button>
              <button type="button" disabled={busy} onClick={() => setMode("read")}>
                keep
              </button>
            </span>
          ) : null}
          {(canEdit || canDelete) && mode === "read" ? (
            <span className="studio-note-acts">
              {canEdit ? (
                <button type="button" onClick={() => { setDraft(note.body); setMode("edit"); }}>
                  edit
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" onClick={() => setMode("delete")}>
                  delete
                </button>
              ) : null}
            </span>
          ) : null}
          <span className="studio-note-by">{noteAuthor(note.author)}</span>
        </div>
      </div>
    </article>
  );
}

function ViewedReceipt({
  text,
  viewedAtByToken,
}: {
  text: string;
  viewedAtByToken: Record<string, string>;
}) {
  const viewed = proposalCards(text)
    .cards.map((card) => viewedAtByToken[card.token])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  if (!viewed) return null;
  return <p className="studio-mail-viewed">last viewed {mailStamp(viewed)}</p>;
}

function proposalOpenHref(token: string, href: string) {
  if (typeof window === "undefined") return href;
  return `${window.location.origin}/proposal/${token}`;
}

function MailFace({
  messages,
  clientName,
  person = false,
  fileHrefs,
  viewedAtByToken,
}: {
  messages: InquiryMessageRow[];
  clientName: string | null | undefined;
  person?: boolean;
  fileHrefs: Record<string, string>;
  viewedAtByToken: Record<string, string>;
}) {
  const rows = messages.map((message) => mailParty(message, clientName));
  return (
    <section className="studio-mail-study">
      <div className="studio-mail-face">
        {rows.map((mail, index) => {
          const previous = rows[index - 1];
          const next = rows[index + 1];
          const studio = mail.outbound && !mail.note;
          const side = studio ? "out" : mail.note ? "note" : "in";
          const prevSide = previous ? (previous.outbound && !previous.note ? "out" : previous.note ? "note" : "in") : "";
          const nextSide = next ? (next.outbound && !next.note ? "out" : next.note ? "note" : "in") : "";
          const sameRun = prevSide === side && previous?.name === mail.name;
          const runEnds = nextSide !== side || next?.name !== mail.name;
          const stamp = nextStamp(mail.at, previous?.at) ? mailStamp(mail.at) : "";
          return (
            <div key={mail.id} className="studio-mail-turn">
              {stamp ? <p className="studio-mail-stamp">{stamp}</p> : null}
              {!studio && !sameRun ? (
                <p className="studio-mail-name">
                  {person && clientName && mail.name.trim().toLowerCase() === clientName.trim().toLowerCase() ? (
                    <PersonName name={mail.name} />
                  ) : (
                    mail.name
                  )}
                </p>
              ) : null}
              <article className={cn("studio-mail-face-item", studio && "is-out", mail.note && "is-note")}>
                {runEnds ? (
                  <span className="studio-mail-avatar" aria-hidden="true">
                    {mail.mark}
                  </span>
                ) : (
                  <span className="studio-mail-avatar is-gap" aria-hidden="true" />
                )}
                <div className="studio-mail-bubble">
                  {mail.subject ? <p className="studio-mail-subject">{mail.subject}</p> : null}
                  {mail.text ? (
                    <MailBody body={proposalCards(studio ? withoutSignoff(mail.text) : mail.text).text} />
                  ) : null}
                  {proposalCards(mail.text).cards.length ? (
                    <div className="studio-mail-files">
                      {proposalCards(mail.text).cards.map((card) => (
                        <MailFile key={card.href} name="proposal.pdf" href={proposalOpenHref(card.token, card.href)} />
                      ))}
                    </div>
                  ) : null}
                  {studio ? <MailSignature name={mail.name} /> : null}
                  {mail.files.length ? (
                    <div className="studio-mail-files">
                      {mail.files.map((name) => (
                        <MailFile key={name} name={name} href={fileHrefs[name] ?? PORTAL_FILES[name]} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
              {studio ? <ViewedReceipt text={mail.text} viewedAtByToken={viewedAtByToken} /> : null}
              {mail.waiting ? <p className="studio-mail-wait">waiting for gmail</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InvoicePreview({
  clientName,
  number,
  service,
  bookingLine,
  listCents,
  courtesyCents,
  totalCents,
  depositCents,
  issuedOn,
}: {
  clientName: string;
  number: string;
  service: string;
  bookingLine: string;
  listCents: number;
  courtesyCents: number;
  totalCents: number;
  depositCents: number;
  issuedOn: string;
}) {
  const [layout, setLayout] = useState<"sheet" | "figure" | "columns">("sheet");
  const dueLabel = depositCents >= totalCents && totalCents > 0 ? "due in full" : "deposit due";
  const list = formatMoneyExact(listCents);
  const total = formatMoneyExact(totalCents);
  const due = formatMoneyExact(depositCents);
  const shared = invoiceSharedDate(issuedOn);
  const lines = (
    <table className="studio-invoice-table">
      <thead>
        <tr>
          <th>item</th>
          <th>quantity</th>
          <th>price</th>
          <th>amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            {service}
            {bookingLine ? <small>{bookingLine}</small> : null}
          </td>
          <td>1</td>
          <td>{list}</td>
          <td>{list}</td>
        </tr>
      </tbody>
    </table>
  );
  const summary = (
    <footer>
      {courtesyCents > 0 ? (
        <div>
          <span>Courtesy Discount</span>
          <span>−{formatMoneyExact(courtesyCents)}</span>
        </div>
      ) : null}
      <div>
        <span>proposal total</span>
        <span>{total}</span>
      </div>
      <div>
        <span>{dueLabel}</span>
        <strong>{due}</strong>
      </div>
    </footer>
  );
  return (
    <div className="studio-invoice-preview">
      <div className="studio-pay" role="group" aria-label="invoice layouts">
        {(["sheet", "figure", "columns"] as const).map((item) => (
          <button key={item} type="button" className={layout === item ? "is-on" : undefined} aria-pressed={layout === item} onClick={() => setLayout(item)}>
            {layout === item ? <i className="studio-pill-dot" aria-hidden="true" /> : null}
            {item}
          </button>
        ))}
      </div>
      {layout === "sheet" ? (
        <article className="studio-invoice is-sheet">
          <div className="studio-invoice-top">
            <header>
              <div>
                <p>invoice</p>
                <span>{number}</span>
                {shared ? <em>shared {shared}</em> : null}
              </div>
              <Wordmark tone="ink" className="client-packet-mark is-sheet" />
            </header>
            <div className="studio-invoice-who">
              <div>
                <p>from</p>
                <b>Say Sukii</b>
                <span>info@saysukii.com</span>
              </div>
              <div>
                <p>bill to</p>
                <b>{clientName}</b>
              </div>
            </div>
          </div>
          {lines}
          {summary}
          <p className="studio-invoice-note">{INVOICE_THANKS}</p>
        </article>
      ) : null}
      {layout === "figure" ? (
        <article className="studio-invoice is-figure">
          <div className="studio-invoice-top">
            <header>
              <div>
                <p>{dueLabel}</p>
                <strong>{due}</strong>
                {shared ? <em>shared {shared}</em> : null}
              </div>
              <Wordmark tone="ink" className="client-packet-mark is-sheet" />
            </header>
            <div className="studio-invoice-who">
              <div>
                <p>bill to</p>
                <b>{clientName}</b>
              </div>
              <div>
                <p>from</p>
                <b>Say Sukii</b>
                <span>info@saysukii.com</span>
              </div>
            </div>
          </div>
          {lines}
          {summary}
          <p className="studio-invoice-note">{INVOICE_THANKS}</p>
        </article>
      ) : null}
      {layout === "columns" ? (
        <article className="studio-invoice is-columns">
          <div className="studio-invoice-top">
            <div className="studio-invoice-brand">
              <Wordmark tone="ink" className="client-packet-mark is-sheet" />
            </div>
            <header>
              <div>
                <p>invoice</p>
                <b>{number}</b>
                {shared ? <em>shared {shared}</em> : null}
              </div>
              <div>
                <p>from</p>
                <b>Say Sukii</b>
                <span>info@saysukii.com</span>
              </div>
              <div>
                <p>bill to</p>
                <b>{clientName}</b>
              </div>
            </header>
          </div>
          {lines}
          {summary}
          <p className="studio-invoice-note">{INVOICE_THANKS}</p>
        </article>
      ) : null}
    </div>
  );
}

function PacketPreview({
  kind,
  clientName,
  work,
  totalCents,
  courtesyCents,
  depositCents,
  fileUrl,
  stored,
}: {
  kind: "proposal" | "agreement" | "invoice";
  clientName: string;
  work: StatementOfWork;
  totalCents: number;
  courtesyCents: number;
  depositCents: number;
  fileUrl: string;
  stored: ReturnType<typeof readPreviewProposal>;
}) {
  const pages = stored?.pageUrls ?? [];
  const frame = fileUrl || stored?.pdfDataUrl || "";
  return (
    <div className="client-packet is-preview">
      {kind === "proposal" ? (
        pages.length ? (
          <div className="client-packet-pages">
            {pages.map((src) => (
              <img key={src} src={src} alt="" />
            ))}
          </div>
        ) : frame ? (
          <iframe title="Proposal" src={`${frame}#toolbar=0&navpanes=0`} className="client-packet-frame" />
        ) : (
          <div className="client-packet-sheet">
            <h2>Proposal</h2>
            <p>Nothing is attached yet.</p>
          </div>
        )
      ) : null}
      {kind === "agreement" ? (
        <div className="client-packet-sheet">
          <FloralAgreement
            fields={{
              ...work,
              clientName: clientName || "Client",
              total: formatMoneyExact(totalCents),
              deposit: formatMoneyExact(depositCents),
              balance: formatMoneyExact(Math.max(0, totalCents - depositCents)),
            }}
          />
        </div>
      ) : null}
      {kind === "invoice" ? (
        <InvoicePreview
          clientName={clientName || "Client"}
          number={stored?.number || "preview"}
          service={floralPackageName(work.occasion || work.flowers)}
          bookingLine={invoiceBookingLine(work.occasion || work.flowers, invoiceDateLabel(work.eventWhen))}
          listCents={totalCents + courtesyCents}
          courtesyCents={courtesyCents}
          totalCents={totalCents}
          depositCents={depositCents}
          issuedOn={stored?.sentAt || new Date().toISOString()}
        />
      ) : null}
    </div>
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
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getInquiryWorkspace);
  const sendMessage = useServerFn(addInquiryMessage);
  const reviseNote = useServerFn(updateInquiryNote);
  const dropNote = useServerFn(deleteInquiryNote);
  const importProposal = useServerFn(importProposalPdf);
  const saveFile = useServerFn(attachInquiryFile);
  const updateStatus = useServerFn(setInquiryStatus);
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
  const [noteBodies, setNoteBodies] = useState<Record<string, string>>({});
  const [removedNotes, setRemovedNotes] = useState<string[]>([]);
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [startingThread, setStartingThread] = useState(false);
  const [namingThread, setNamingThread] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const threadRef = useRef({ fresh: false, subject: "", threadId: null as string | null, base: "" });
  const [localFiles, setLocalFiles] = useState<Array<{ id: string; name: string; file: File }>>([]);
  const [openable, setOpenable] = useState<Record<string, string>>({});
  const [fileOver, setFileOver] = useState(false);
  const [proposalHref, setProposalHref] = useState<string | null>(null);
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const localProposalUrl = useMemo(() => (proposalFile ? URL.createObjectURL(proposalFile) : ""), [proposalFile]);
  useEffect(() => {
    if (!localProposalUrl) return;
    return () => URL.revokeObjectURL(localProposalUrl);
  }, [localProposalUrl]);
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
  const [packetKind, setPacketKind] = useState<"proposal" | "agreement" | "invoice">("proposal");
  const [shareTemplateId, setShareTemplateId] = useState("proposal");
  const proposalSeeded = useRef(false);
  const workSeeded = useRef(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["os", "inquiry-workspace", id, devPreview],
    queryFn: () => (devPreview ? getDevPreviewInquiryWorkspace(id) : fetchWorkspace({ data: { id } })),
  });
  const inquiryId = data?.inquiry.id ?? id;

  useEffect(() => {
    if (!data?.slug || data.slug === id) return;
    void navigate({ to: "/pipeline/$id", params: { id: data.slug }, replace: true });
  }, [data?.slug, id, navigate]);

  useEffect(() => {
    if (!data || typeof window === "undefined") return;
    const stored = data.proposals.find((item) => "access_token" in item && typeof item.access_token === "string" && item.access_token);
    const preview = previewProposalForInquiry(data.inquiry.id);
    const token = (stored && "access_token" in stored ? stored.access_token : null) ?? preview?.token ?? null;
    if (token) setProposalHref(`${window.location.origin}/proposal/${token}`);
    if (proposalSeeded.current) return;
    const total = preview?.totalCents ?? stored?.total_cents;
    const depositCents = preview?.depositCents ?? stored?.deposit_amount_cents;
    if (!total) return;
    const notes = stored && "notes" in stored && typeof stored.notes === "string" ? stored.notes : null;
    const courtesy = preview?.courtesyCents ?? courtesyFromNotes(notes);
    const list = total + courtesy;
    proposalSeeded.current = true;
    setProposalAmount(formatDollarInput(String(list / 100)));
    setProposalCourtesy(courtesy > 0 ? formatDollarInput(String(courtesy / 100)) : "");
    setProposalPay(depositCents != null && depositCents >= total ? "full" : "deposit");
    setProposalName(preview ? "proposal.pdf" : stored?.number ?? "");
  }, [data]);

  useEffect(() => {
    if (!data || workSeeded.current) return;
    workSeeded.current = true;
    const preview = previewProposalForInquiry(data.inquiry.id);
    const stored = data.proposals.find((item) => "notes" in item && item.notes);
    const saved = preview?.work ?? statementFromNotes(stored && "notes" in stored ? stored.notes : null);
    const occasion = EVENT_LABEL[data.inquiry.event_type];
    const when = data.inquiry.event_date_tbd
      ? "tbd"
      : [formatDateNumeric(data.inquiry.event_date), inquiryTime(data.inquiry.message)].filter(Boolean).join(" · ");
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
    const token = proposalHref?.split("/proposal/").pop() ?? "";
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
      const token = "access_token" in item && typeof item.access_token === "string" ? item.access_token : "";
      const viewed = "viewed_at" in item && typeof item.viewed_at === "string" ? item.viewed_at : "";
      if (token && viewed) views[token] = viewed;
    }
    if (data && typeof window !== "undefined") {
      const preview = previewProposalForInquiry(data.inquiry.id);
      if (preview?.token && preview.viewedAt) views[preview.token] = preview.viewedAt;
    }
    return views;
  }, [data]);

  const move = useMutation({
    mutationFn: (args: { status: InquiryStatus; closed_reason?: string }) => {
      if (devPreview) {
        if (args.status === "closed") {
          previewArchiveInquiry(inquiryId);
          return Promise.resolve({ ok: true as const });
        }
        toast.message("preview mode — status not saved");
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
    mutationFn: async ({ body, sendAt, fresh, subject }: { body: string; sendAt?: string; fresh?: boolean; subject?: string }) => {
      const text = body.trim();
      if (!text) throw new Error("write a note first");
      const asChannel =
        surface === "full" ? (focus === "note" && !fresh ? "note" : "email") : outgoingChannel(surface, activityTab, channel);
      const when = sendAt ? new Date(sendAt) : new Date();
      if (sendAt && Number.isNaN(when.getTime())) throw new Error("pick a time to send");
      const thread = fresh
        ? { fresh: true, subject: subject?.trim() ?? "", threadId: null as string | null, base: "" }
        : threadRef.current;
      if (devPreview) {
        for (const card of proposalCards(text).cards) markPreviewProposalSent(card.token);
        if (asChannel === "email" && thread.fresh && !thread.subject) {
          throw new Error("add a subject for the new conversation.");
        }
        const subject =
          asChannel === "email" ? (thread.fresh ? thread.subject : thread.base ? `Re: ${thread.base}` : "from say sukii") : null;
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
            to_address: data?.client?.email ?? null,
            gmail_message_id: asChannel === "email" ? `preview-out-${Date.now()}` : null,
            gmail_thread_id: asChannel === "email" ? (thread.fresh ? `thread-${crypto.randomUUID()}` : thread.threadId ?? "preview-thread") : null,
            author: asChannel === "email" ? signatureName(profile.full_name) : noteWriter(profile),
            sent_at: when.toISOString(),
            status: sendAt ? "queued" : "sent",
            created_by: profile.id,
            created_at: new Date().toISOString(),
          },
        ]);
        return { ok: true as const, channel: asChannel, scheduled: Boolean(sendAt), when: sendAt ?? "", opened: thread.fresh ? thread.subject : "" };
      }
      if (sendAt) return { ok: true as const, channel: asChannel, scheduled: false, when: sendAt, held: true as const, opened: "" };
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
        },
      });
      return { ...sent, channel: asChannel, scheduled: false, when: "", held: false as const, opened: thread.fresh ? thread.subject : "" };
    },
    onSuccess: (result) => {
      if ("held" in result && result.held) {
        toast.message("the letter stays here until gmail can hold a time.");
        return;
      }
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

  const sendHold = useRef<{ timer: number; run: () => void } | null>(null);

  function queueLetter(run: () => void, restore?: () => void, who?: string | null) {
    if (sendHold.current) {
      window.clearTimeout(sendHold.current.timer);
      sendHold.current.run();
    }
    const timer = window.setTimeout(() => {
      if (sendHold.current?.timer === timer) sendHold.current = null;
      run();
    }, 10_000);
    sendHold.current = { timer, run };
    toast.message("sending", {
      description: who ? `to ${firstName(who)}` : "the letter",
      duration: 10_000,
      action: {
        label: "undo",
        onClick: () => {
          if (sendHold.current?.timer !== timer) return;
          window.clearTimeout(timer);
          sendHold.current = null;
          restore?.();
          toast.message("held");
        },
      },
    });
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
      .map((item) => (noteBodies[item.id] !== undefined ? { ...item, body: noteBodies[item.id] } : item));
  }, [data?.messages, localMessages, noteBodies, removedNotes]);
  const sendAs =
    surface === "full" ? (focus === "note" ? "note" : "email") : outgoingChannel(surface, activityTab, channel);
  const visibleMessages = messages
    .filter((item) => {
      const note = item.channel === "note" || item.direction === "note";
      if (surface === "full") return focus === "note" ? note : !note;
      if (surface === "notes" || surface === "rail" || (surface === "activity" && activityTab === "notes")) return note;
      if (surface === "mail" || (surface === "activity" && activityTab === "messages")) return !note;
      return true;
    })
    .sort((a, b) => (a.sent_at || a.created_at || "").localeCompare(b.sent_at || b.created_at || ""));

  const mailThreads: string[] = [];
  if (sendAs === "email") {
    for (const item of visibleMessages) {
      const key = threadBase(item.subject).toLowerCase();
      if (!mailThreads.includes(key)) mailThreads.push(key);
    }
  }
  const pendingSubject = !namingThread && newSubject.trim() && !mailThreads.includes(newSubject.trim().toLowerCase()) ? newSubject.trim() : "";
  const activeThread =
    sendAs === "email" && !startingThread
      ? threadKey && mailThreads.includes(threadKey)
        ? threadKey
        : (mailThreads.at(-1) ?? null)
      : null;
  const threadedMessages =
    sendAs === "note" || startingThread
      ? sendAs === "note"
        ? visibleMessages
        : []
      : visibleMessages.filter((item) => threadBase(item.subject).toLowerCase() === (activeThread ?? "conversation"));
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

  const { inquiry, client, files, gmailConnected, source_message } = data;
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

  async function keepStudioFile(file: File) {
    if (devPreview) {
      setLocalFiles((current) => [...current, { id: crypto.randomUUID(), name: file.name, file }]);
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
  }
  const candidate = isReviewCandidate(inquiry);
  const peek = sourceExcerpt(source_message?.subject, source_message?.body ?? inquiry.message, 280);
  const confidence = confidenceLabel(inquiry.detection_confidence);
  const stage = boardStageId(inquiry);
  const eventWhen = inquiry.event_date_tbd
    ? "tbd"
    : [formatDateNumeric(inquiry.event_date), time].filter(Boolean).join(" · ");
  const place = inquiry.venue_text?.split(",")[0]?.trim() ?? "";

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
  const showSideThread = surface === "mail" || surface === "notes" || surface === "activity" || surface === "rail";

  const threadOpen = showSideThread || (showStack && (focus === "conversation" || focus === "note"));
  const offerOpen = showStack && focus === "proposal";
  const filesOpen = showStack && focus === "files";
  const replyFacts = {
    eventDate: inquiry.event_date,
    dateTbd: inquiry.event_date_tbd,
    place: inquiry.venue_text,
    job: EVENT_LABEL[inquiry.event_type],
  };
  async function importCanva(file: File, totalCents: number, depositPercent: number, statement: StatementOfWork, courtesyCents = 0) {
    const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!pdf) throw new Error("drop the proposal pdf.");
    if (devPreview) {
      const pdfDataUrl = await readFileDataUrl(file);
      if (pdfDataUrl.length > 4_500_000) throw new Error("this preview keeps the pdf under about 3mb.");
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
        work: statement,
      });
      const href = `${window.location.origin}/proposal/${saved.token}`;
      setProposalHref(href);
      return href;
    }
    const dataUrl = await readFileDataUrl(file);
    const result = await importProposal({
      data: {
        inquiry_id: inquiryId,
        total_cents: totalCents,
        courtesy_cents: courtesyCents,
        deposit_percent: depositPercent,
        statement,
        file_name: file.name,
        pdf_base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      },
    });
    const href = `${window.location.origin}/proposal/${result.token}`;
    setProposalHref(href);
    void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
    return href;
  }

  function takeProposal(file: File | undefined) {
    if (!file) return;
    const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!pdf) {
      setProposalError("drop the proposal pdf.");
      return;
    }
    setProposalError("");
    setProposalFile(file);
    setProposalName(file.name);
  }

  function proposalProblem() {
    const list = dollarsToCents(proposalAmount);
    const courtesy = dollarsToCents(proposalCourtesy) ?? 0;
    if (!proposalFile && !proposalHref) return "drop the proposal.";
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
    const href = proposalFile ? await importCanva(proposalFile, cents, deposit, work, courtesy) : proposalHref;
    if (!href) throw new Error("drop the proposal.");
    if (!proposalFile && href.includes("/proposal/preview_")) {
      updatePreviewProposalTerms(href.split("/proposal/").pop() ?? "", cents, deposit, work, courtesy);
    }
    return href;
  }

  async function copyProposal() {
    setProposalBusy(true);
    setProposalError("");
    try {
      const href = await readyProposalHref();
      const token = href.split("/proposal/").pop() ?? "";
      if (token.startsWith("preview_")) markPreviewProposalSent(token);
      await navigator.clipboard.writeText(href);
      toast.success("copied");
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "could not copy the link");
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
    const token = proposalHref?.split("/proposal/").pop() ?? "";
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
    const template = loadTemplates().find((item) => item.id === shareTemplateId) ?? loadTemplates()[0];
    if (!template) return;
    setProposalBusy(true);
    setProposalError("");
    try {
      const href = await readyProposalHref();
      const body = ensureProposalLink(applyTemplate(template.body, client?.name, EVENT_LABEL[inquiry.event_type]), href);
      setProposalShare(false);
      queueLetter(
        () => post.mutate({ body, fresh: true, subject: PROPOSAL_THREAD }),
        () => undefined,
        client?.name ?? null,
      );
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "could not send the proposal");
    } finally {
      setProposalBusy(false);
    }
  }

  const listCents = dollarsToCents(proposalAmount);
  const courtesyCents = dollarsToCents(proposalCourtesy) ?? 0;
  const proposalCents = listCents == null ? null : Math.max(0, listCents - courtesyCents);
  const depositCents = proposalCents ? (proposalPay === "full" ? proposalCents : Math.round(proposalCents / 2)) : 0;
  const shareTemplates = loadTemplates();
  const shareTemplate = shareTemplates.find((item) => item.id === shareTemplateId) ?? shareTemplates[0];
  const sharePreview = shareTemplate
    ? proposalLetter(shareTemplate, client?.name, proposalHref, EVENT_LABEL[inquiry.event_type])
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
      blockedNote={sendAs === "email" && !gmailConnected && !devPreview ? "connect gmail in settings to send." : null}
      onSend={(body, sendAt) =>
        queueLetter(() => post.mutate(sendAt ? { body, sendAt } : { body }), () => setDraft(body), client?.name ?? null)
      }
      onUseSubject={(subject) => {
        setNewSubject(subject);
        setNamingThread(false);
        setStartingThread(true);
        setThreadKey(subject.toLowerCase());
      }}
      onOpenable={(files) => setOpenable((current) => ({ ...current, ...files }))}
    />
  );

  return (
    <div className={cn("studio-lead", `is-${stage}`, "is-layout-workflow", showSideThread && "is-side")}>
      {showJob ? (
      <>
      <div className="studio-lead-top is-mast">
      <RecordMast
        title={
          isPersonType(client?.type) && client?.name ? <PersonName name={client.name} /> : (client?.name ?? "client")
        }
        date={inquiry.event_date_tbd ? "date tbd" : formatDateNumeric(inquiry.event_date)}
        time={inquiry.event_date_tbd ? "" : time}
        place={place}
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

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask is-confirm is-soft" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">archive this inquiry</DialogTitle>
          <DialogDescription className="sr-only">confirm before this inquiry leaves the book.</DialogDescription>
          <div className="studio-task-form">
            <p className="studio-review-confirm">archive this inquiry? it leaves the book.</p>
            <div className="studio-ask-foot is-pair is-spread">
              <button type="button" className="studio-ghost" disabled={move.isPending} onClick={() => setConfirmArchive(false)}>
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
          <p className="studio-home-label">
            <User aria-hidden="true" strokeWidth={1.5} />
            client details
          </p>
          <dl className="studio-facts">
            <div>
              <dt>name</dt>
              <dd>
                {isPersonType(client?.type) && client?.name ? <PersonName name={client.name} /> : (client?.name ?? "client")}
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
        {(["conversation", "proposal", "files", "note"] as const).map((item) => (
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
        <section className={cn("studio-module studio-lead-thread", showSideThread && "studio-activity")}>
          <p className="studio-home-label">
            {sendAs === "note" ? <NotebookPen aria-hidden="true" strokeWidth={1.5} /> : <MessageCircle aria-hidden="true" strokeWidth={1.5} />}
            {sendAs === "note" ? "internal note" : "conversation"}
          </p>
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
          {sendAs === "email" ? (
            <div className="studio-threads" role="tablist" aria-label="conversations">
              {mailThreads.map((key) => (
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
                <button type="button" role="tab" aria-selected={false} onClick={() => {
                  setNewSubject("");
                  setNamingThread(true);
                  setStartingThread(true);
                }}>
                  new
                </button>
              )}
            </div>
          ) : null}
          {showSideThread ? composer : null}
          <div className="studio-mail-scroll" ref={mailScroll}>
            {sendAs === "note" ? (
              <NoteList
                messages={visibleMessages}
                profile={profile}
                onSave={async (noteId, body) => {
                  if (!devPreview) await reviseNote({ data: { id: noteId, body } });
                  setNoteBodies((current) => ({ ...current, [noteId]: body }));
                  if (!devPreview) void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
                }}
                onDelete={async (noteId) => {
                  if (!devPreview) await dropNote({ data: { id: noteId } });
                  setRemovedNotes((current) => [...current, noteId]);
                  if (!devPreview) void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace", id] });
                }}
              />
            ) : (
              <MailFace
                messages={threadedMessages}
                clientName={client?.name}
                person={isPersonType(client?.type)}
                fileHrefs={fileHrefs}
                viewedAtByToken={viewedAtByToken}
              />
            )}
          </div>
          {showSideThread ? null : composer}
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
          <p className="studio-home-label">
            <FileText aria-hidden="true" strokeWidth={1.5} />
            proposal
          </p>
          <div className="studio-proposal-desk">
            <label
              className={cn("studio-file-drop", proposalOver && "is-over", (proposalFile || proposalName) && "is-set")}
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
                setProposalOver(false);
                takeProposal(event.dataTransfer.files[0]);
              }}
            >
              <Upload aria-hidden="true" strokeWidth={1.5} />
              <b>{proposalOver ? "drop it here" : proposalName || "drop the proposal"}</b>
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
                  onChange={(event) => setProposalAmount(formatDollarInput(event.target.value))}
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
                    onChange={(event) => setProposalCourtesy(formatDollarInput(event.target.value))}
                    placeholder="0"
                    inputMode="decimal"
                  />
                </span>
              </label>
              </div>
              <div className="studio-proposal-cards" role="group" aria-label="payment method">
                <div className={cn("studio-proposal-card", proposalPay === "deposit" && "is-on")} onClick={() => setProposalPay("deposit")}>
                  <button type="button" aria-pressed={proposalPay === "deposit"} onClick={() => setProposalPay("deposit")}>
                    {proposalPay === "deposit" ? <i className="studio-pill-dot" aria-hidden="true" /> : null}
                    deposit
                  </button>
                  <small>{proposalCents ? formatMoneyExact(Math.round(proposalCents / 2)) : "half the amount"}</small>
                </div>
                <div className={cn("studio-proposal-card", proposalPay === "full" && "is-on")} onClick={() => setProposalPay("full")}>
                  <button type="button" aria-pressed={proposalPay === "full"} onClick={() => setProposalPay("full")}>
                    {proposalPay === "full" ? <i className="studio-pill-dot" aria-hidden="true" /> : null}
                    pay in full
                  </button>
                  <small>{proposalCents ? formatMoneyExact(proposalCents) : "the whole amount"}</small>
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
                        onChange={(event) => setWork((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className={cn("studio-ask-foot", profile.role === "admin" && "is-spread")}>
              {profile.role === "admin" ? (
                <button type="button" className="studio-proposal-preview" onClick={() => setPacketOpen(true)}>
                  preview
                </button>
              ) : null}
              <Popover open={shareMenu} onOpenChange={setShareMenu}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="studio-today-go"
                    aria-expanded={shareMenu}
                    disabled={proposalBusy || post.isPending}
                  >
                    share
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
                >
                  <button
                    type="button"
                    disabled={proposalBusy}
                    onClick={() => {
                      setShareMenu(false);
                      void copyProposal();
                    }}
                  >
                    copy link
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
              <DialogDescription className="sr-only">proposal, service agreement, and invoice.</DialogDescription>
              <PacketPreview
                kind={packetKind}
                clientName={client?.name ?? ""}
                work={work}
                totalCents={proposalCents ?? 0}
                courtesyCents={courtesyCents}
                depositCents={depositCents}
                fileUrl={localProposalUrl}
                stored={proposalHref?.includes("/proposal/preview_") ? readPreviewProposal(proposalHref.split("/proposal/").pop() ?? "") : null}
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
              <DialogDescription className="sr-only">preview the letter, then send it.</DialogDescription>
              <div className="studio-task-form">
                <div className="studio-ask-field">
                  <span className="studio-ask-label">preview</span>
                  <div className="studio-textarea studio-share-preview">{sharePreview}</div>
                </div>
                <div className="studio-template-list">
                  {shareTemplates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn("studio-template-item", item.id === shareTemplate?.id && "is-on")}
                      aria-pressed={item.id === shareTemplate?.id}
                      onClick={() => setShareTemplateId(item.id)}
                    >
                      <b>{item.name}</b>
                      <em>{previewLine(applyTemplate(item.body, client?.name, EVENT_LABEL[inquiry.event_type]))}</em>
                    </button>
                  ))}
                </div>
                {proposalError ? <p className="studio-composer-note">{proposalError}</p> : null}
                <div className="studio-ask-foot">
                  <button type="button" className="studio-today-go" disabled={proposalBusy || post.isPending} onClick={() => void emailProposal()}>
                    {proposalBusy || post.isPending ? "sending" : "send"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
        <button type="button" className="studio-ghost studio-lead-archive" onClick={() => setConfirmArchive(true)}>
          archive this inquiry
        </button>
      ) : null}
    </div>
  );
}
