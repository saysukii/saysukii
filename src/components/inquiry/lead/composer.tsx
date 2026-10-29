import {
  CalendarClock,
  FileArchive,
  FileText,
  Image,
  Link2,
  Paperclip,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wordmark } from "@/components/portal/bits";
import { PersonName } from "@/components/studio/PersonName";
import { mailRecord, uniqueMails } from "@/lib/os/mail-people";
import {
  isStudioOwner,
  SIGNATURE_COPYRIGHT,
  SIGNATURE_LINKS,
  signatureName,
} from "@/lib/os/mail-signature";
import {
  applyTemplate,
  loadTemplates,
  saveTemplates,
  type MailTemplate,
} from "@/lib/os/mail-templates";
import { scheduleMeetingUrl } from "@/lib/studio-bookings";
import type { InquiryMessageRow } from "@/integrations/supabase/types";
import { proposalCards } from "@/lib/proposal-link";
import { cn } from "@/lib/utils";
import {
  previewLine,
  fileSize,
  formatSendAt,
  normalizeHref,
  draftToHtml,
  htmlToDraft,
  mailParagraphs,
  mailInline,
  studioReply,
} from "@/components/inquiry/lead/helpers";

export type DraftFile = {
  id: string;
  name: string;
  size: number;
  path: string | null;
  uploading: boolean;
};
export type LetterFile = { path: string; name: string };
export type ComposeTool = "schedule" | "link" | "write";

export function ContextPreview({ name, body }: { name: string; body: string }) {
  return (
    <div className="studio-compose-preview">
      <b>{name}</b>
      <em>{previewLine(body) || "nothing here yet."}</em>
    </div>
  );
}

export function MailFile({ name, href }: { name: string; href?: string | null | undefined }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const archive = ext === "zip";
  const body = (
    <>
      {archive ? (
        <FileArchive aria-hidden="true" strokeWidth={1.5} />
      ) : (
        <FileText aria-hidden="true" strokeWidth={1.5} />
      )}
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

export function LetterPreview({
  body,
  href,
  sender,
  subject = "your proposal",
  button = "your proposal",
  to,
}: {
  body: string;
  href: string | null;
  sender: string;
  subject?: string;
  button?: string;
  to?: string;
}) {
  const person = signatureName(sender);
  const text = proposalCards(body).text;
  return (
    <article className="studio-letter">
      {to ? <p className="studio-letter-to">to {to}</p> : null}
      <p className="studio-letter-subject">{subject}</p>
      {text ? <MailBody body={text} /> : null}
      {href ? (
        <a className="studio-letter-button" href={href} target="_blank" rel="noreferrer">
          {button}
        </a>
      ) : (
        <span className="studio-letter-button">{button}</span>
      )}
      <footer className="studio-letter-sign">
        <p>with gratitude,</p>
        <p>
          <strong>
            <PersonName name={person} /> | Say Sukii
          </strong>
        </p>
        {isStudioOwner(person) ? <p>floral artist, founder & creative director</p> : null}
        <p>
          <a href={SIGNATURE_LINKS.site}>saysukii.com</a>
        </p>
        <p>
          <a href={SIGNATURE_LINKS.instagram}>instagram</a>
        </p>
        <p>
          <a href={scheduleMeetingUrl()}>let's talk! schedule meeting here</a>
        </p>
        <p>{SIGNATURE_COPYRIGHT}</p>
      </footer>
    </article>
  );
}

export function MailSignature({ name, tone = "white" }: { name: string; tone?: "white" | "ink" }) {
  const person = signatureName(name);
  return (
    <footer className="studio-mail-sign">
      <p className="studio-mail-sign-close">with gratitude,</p>
      <Wordmark tone={tone} className="studio-mail-sign-mark" />
      <p>
        <strong>
          <PersonName name={person} /> | Say Sukii
        </strong>
      </p>
      {isStudioOwner(person) ? <p>floral artist, founder & creative director</p> : null}
      <p>
        <a href={SIGNATURE_LINKS.site}>saysukii.com</a>
      </p>
      <p>
        <a href={SIGNATURE_LINKS.instagram}>instagram</a>
      </p>
      <p>
        <a href={scheduleMeetingUrl()}>let's talk! schedule meeting here</a>
      </p>
      <p className="studio-mail-sign-legal">{SIGNATURE_COPYRIGHT}</p>
    </footer>
  );
}

export function MailBody({ body, personName }: { body: string; personName?: string | null }) {
  const paragraphs = mailParagraphs(body);
  return (
    <div className="studio-mail-body">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{mailInline(paragraph, personName, index)}</p>
      ))}
    </div>
  );
}

export function ThreadComposer({
  sendAs,
  sender,
  subject,
  draft,
  setDraft,
  pending,
  canSend,
  clientName,
  facts,
  messages,
  blockedNote,
  clientEmail,
  moreTo,
  copyTo,
  onMoreTo,
  onCopyTo,
  onSend,
  onUseSubject,
  onOpenable,
  onKeep,
}: {
  sendAs: "email" | "note";
  /** who signs the letter, for the preview before it sends */
  sender?: string | null | undefined;
  subject?: string;
  draft: string;
  setDraft: (value: string) => void;
  pending: boolean;
  canSend: boolean;
  clientName?: string | null | undefined;
  facts: {
    eventDate?: string | null;
    dateTbd?: boolean | null;
    place?: string | null;
    job?: string | null;
  };
  messages: InquiryMessageRow[];
  blockedNote?: string | null;
  clientEmail?: string | null | undefined;
  moreTo: string[];
  copyTo: string[];
  onMoreTo: (next: string[]) => void;
  onCopyTo: (next: string[]) => void;
  onSend: (body: string, sendAt?: string, attachments?: LetterFile[]) => void;
  onUseSubject?: (subject: string) => void;
  onOpenable?: (files: Record<string, string>) => void;
  onKeep?: (files: File[]) => Promise<Array<string | null>>;
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
  const [confirm, setConfirm] = useState<{
    body: string;
    sendAt: string;
    attachments: LetterFile[];
  } | null>(null);
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
      const next = editingId
        ? current.map((item) => (item.id === editingId ? saved : item))
        : [saved, ...current];
      saveTemplates(next);
      return next;
    });
    closeTemplateEditor();
  }

  function applyTemplateItem(item: MailTemplate) {
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
    const added = picked.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      path: null,
      uploading: Boolean(onKeep),
    }));
    setFiles((current) => [...current, ...added]);
    void onKeep?.(picked).then((paths) => {
      setFiles((current) =>
        current.map((file) => {
          const index = added.findIndex((item) => item.id === file.id);
          return index < 0 ? file : { ...file, path: paths[index] ?? null, uploading: false };
        }),
      );
    });
  }

  // both only touch refs, so they keep one identity across renders
  const clearLinkHold = useCallback(() => {
    const hold = linkHold.current ?? editor.current?.querySelector(".studio-link-hold");
    linkHold.current = null;
    if (!(hold instanceof HTMLElement) || !hold.isConnected) return;
    hold.replaceWith(document.createTextNode(hold.textContent ?? ""));
  }, []);

  const paintLinkHold = useCallback(
    (node: HTMLElement, start: number, end: number) => {
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
    },
    [clearLinkHold],
  );

  useEffect(() => {
    const node = editor.current;
    if (!node || !email) return;
    if (htmlToDraft(node) !== draft) node.innerHTML = draft ? draftToHtml(draft) : "";
    if (tool === "link" && linkSpan.current)
      paintLinkHold(node, linkSpan.current.start, linkSpan.current.end);
  }, [draft, email, paintLinkHold, tool]);

  useEffect(() => {
    if (tool === "link") return;
    linkSpan.current = null;
    clearLinkHold();
  }, [clearLinkHold, tool]);

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
    const letter = {
      body,
      sendAt,
      attachments: files.flatMap((file) =>
        file.path ? [{ path: file.path, name: file.name }] : [],
      ),
    };
    // every letter is read once as the client will see it; send there starts the ribbon
    setConfirm(letter);
  }

  function commitSend(letter = confirm) {
    if (!letter) return;
    const { body, sendAt: when, attachments } = letter;
    setConfirm(null);
    setDraft("");
    setFiles([]);
    setSendAt("");
    setTool(null);
    onSend(body, when || undefined, attachments);
  }

  const uploading = files.some((file) => file.uploading);
  const ready = Boolean(draft.trim() || files.length) && !uploading;
  const people = email ? mailRecord(uniqueMails([clientEmail, ...moreTo]), copyTo) : null;
  const who = people && (people.to.length > 1 || people.cc.length) ? people.line : "";

  return (
    <form className="studio-composer" onSubmit={submit}>
      {email ? (
        <MailPeople
          inline
          clientEmail={clientEmail ?? null}
          more={moreTo}
          copy={copyTo}
          onMore={onMoreTo}
          onCopy={onCopyTo}
        />
      ) : null}
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
                <small>{file.uploading ? "uploading…" : fileSize(file.size)}</small>
              </span>
              <button
                type="button"
                aria-label={`remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
              >
                <X aria-hidden="true" strokeWidth={1.5} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {email && sendAt ? (
        <p className="studio-composer-when">sends {formatSendAt(sendAt)}</p>
      ) : null}
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
            <button
              type="button"
              className={cn("studio-composer-tool", tool === "schedule" && "is-on")}
              title="schedule the send"
              aria-pressed={tool === "schedule"}
              onClick={() => toggle("schedule")}
            >
              <CalendarClock aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">schedule the send</span>
            </button>
            <button
              type="button"
              className={cn("studio-composer-tool", templatesOpen && "is-on")}
              title="email templates"
              aria-pressed={templatesOpen}
              onClick={() => {
                setTool(null);
                setTemplatesOpen(true);
              }}
            >
              <SquarePen aria-hidden="true" strokeWidth={1.5} />
              <span className="sr-only">email templates</span>
            </button>
            <button
              type="button"
              className={cn("studio-composer-tool", tool === "link" && "is-on")}
              title="add a link"
              aria-pressed={tool === "link"}
              onMouseDown={openLink}
            >
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
          {uploading ? "uploading" : email ? (sendAt ? "schedule" : "send") : "keep note"}
        </button>
      </div>
      {blockedNote ? <p className="studio-composer-note">{blockedNote}</p> : null}
      {email ? (
        <>
          <Dialog
            open={tool === "schedule"}
            onOpenChange={(open) => {
              if (!open) setTool(null);
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
              <DialogTitle className="sr-only">schedule the send</DialogTitle>
              <DialogDescription className="sr-only">
                choose when this letter goes out.
              </DialogDescription>
              <div className="studio-task-form">
                <ContextPreview
                  name={clientName || "this letter"}
                  body={draft || "write the letter, then choose when it sends."}
                />
                <label className="studio-ask-field">
                  <span className="studio-ask-label">send at</span>
                  <input
                    type="datetime-local"
                    value={sendAt}
                    onChange={(event) => setSendAt(event.target.value)}
                  />
                </label>
                <div className="studio-ask-foot">
                  <button
                    type="button"
                    className="studio-today-go"
                    disabled={!sendAt}
                    onClick={() => setTool(null)}
                  >
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
          <Dialog
            open={tool === "write"}
            onOpenChange={(open) => {
              if (!open) setTool(null);
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
              <DialogTitle className="sr-only">help me write</DialogTitle>
              <DialogDescription className="sr-only">
                a letter drawn from their latest note.
              </DialogDescription>
              <div className="studio-task-form">
                <ContextPreview
                  name={clientName || "them"}
                  body={
                    messages.find((item) => item.direction === "inbound")?.body ||
                    "no note from them yet."
                  }
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
          <Dialog
            open={Boolean(confirm)}
            onOpenChange={(open) => {
              if (!open) setConfirm(null);
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
              <DialogTitle className="sr-only">read this letter before it sends</DialogTitle>
              <DialogDescription className="sr-only">
                {confirm?.sendAt
                  ? "this letter waits until the time you chose."
                  : "after you send, there are 10 seconds to undo."}
              </DialogDescription>
              <div className="studio-task-form">
                <article className="studio-send-preview">
                  <header>
                    <p>
                      <span>to</span>
                      {who || clientEmail || clientName || "them"}
                    </p>
                    {subject ? (
                      <p>
                        <span>subject</span>
                        {subject}
                      </p>
                    ) : null}
                  </header>
                  <div className="studio-send-preview-letter">
                    <MailBody body={confirm?.body || ""} personName={clientName ?? null} />
                    <MailSignature name={sender || ""} tone="ink" />
                  </div>
                </article>
                {confirm?.sendAt ? (
                  <p className="studio-composer-when">sends {formatSendAt(confirm.sendAt)}</p>
                ) : null}
                <div className="studio-ask-foot is-pair is-spread">
                  <button type="button" className="studio-ghost" onClick={() => setConfirm(null)}>
                    keep editing
                  </button>
                  <button type="button" className="studio-today-go" onClick={() => commitSend()}>
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
              <DialogDescription className="sr-only">choose a letter.</DialogDescription>
              <div className="studio-task-form">
                <div className="studio-template-list">
                  {templates.map((item) => (
                    <div key={item.id} className="studio-template-row">
                      <button
                        type="button"
                        className="studio-template-item"
                        onClick={() => applyTemplateItem(item)}
                      >
                        <b>{item.name}</b>
                        <em>{previewLine(applyTemplate(item.body, clientName, facts.job))}</em>
                      </button>
                      <button
                        type="button"
                        className="studio-template-edit"
                        onClick={() => beginTemplate(item)}
                      >
                        edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <Dialog
                open={addingTemplate}
                onOpenChange={(open) => {
                  if (!open) closeTemplateEditor();
                }}
              >
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
                  <DialogTitle className="sr-only">
                    {editingId ? "edit a template" : "add a template"}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    name the letter, then write it.
                  </DialogDescription>
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

export function MailPeople({
  clientEmail,
  more,
  copy,
  onMore,
  onCopy,
  inline = false,
}: {
  clientEmail?: string | null | undefined;
  more: string[];
  copy: string[];
  onMore: (next: string[]) => void;
  onCopy: (next: string[]) => void;
  inline?: boolean;
}) {
  const locked = uniqueMails([clientEmail]);
  const extras = more.filter(
    (email) => !locked.some((item) => item.toLowerCase() === email.toLowerCase()),
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const showCopy = copyOpen || copy.length > 0;
  return (
    <div className={cn("studio-mail-people", inline && "is-inline")}>
      <MailLine
        label="to"
        locked={locked}
        emails={extras}
        onChange={onMore}
        placeholder="add an email"
      />
      {showCopy ? (
        <MailLine label="cc" emails={copy} onChange={onCopy} placeholder="add a cc" />
      ) : (
        <button type="button" className="studio-mail-cc-open" onClick={() => setCopyOpen(true)}>
          cc
        </button>
      )}
    </div>
  );
}

export function MailLine({
  label,
  locked = [],
  emails,
  onChange,
  placeholder,
}: {
  label: string;
  locked?: string[];
  emails: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const good = uniqueMails(parts).filter(
      (email) => !locked.some((item) => item.toLowerCase() === email.toLowerCase()),
    );
    if (!good.length) return false;
    onChange(uniqueMails([...emails, ...good]));
    setDraft("");
    return true;
  }

  return (
    <label className="studio-mail-line">
      <span>{label}</span>
      <span className="studio-mail-line-body">
        {locked.map((email) => (
          <em key={email}>{email}</em>
        ))}
        {emails.map((email) => (
          <em key={email}>
            {email}
            <button
              type="button"
              aria-label={`remove ${email}`}
              onClick={() => onChange(emails.filter((item) => item !== email))}
            >
              <X aria-hidden="true" strokeWidth={1.5} />
            </button>
          </em>
        ))}
        <input
          value={draft}
          placeholder={locked.length || emails.length ? "" : placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;]$/.test(value)) commit(value);
            else setDraft(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Backspace" && !draft && emails.length) {
              onChange(emails.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
      </span>
    </label>
  );
}
