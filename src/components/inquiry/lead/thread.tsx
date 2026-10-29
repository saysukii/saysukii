import { useState } from "react";
import { toast } from "sonner";

import { PersonName } from "@/components/studio/PersonName";
import { noteAuthor, wroteNote } from "@/lib/os/mail-signature";
import type { InquiryMessageRow } from "@/integrations/supabase/types";
import { proposalCards } from "@/lib/proposal-link";
import { shareNote } from "@/lib/os/inquiry-desk";
import { cn } from "@/lib/utils";
import { MailFile, MailSignature, MailBody } from "@/components/inquiry/lead/composer";
import {
  PORTAL_FILES,
  withoutSignoff,
  hiddenSubject,
  mailStamp,
  noteTime,
  mailDayChanged,
  mailDay,
  mailTime,
  mailParty,
  proposalOpenHref,
} from "@/components/inquiry/lead/helpers";

export function NoteList({
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

export function NoteCard({
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
          <textarea
            className="studio-textarea studio-note-edit"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <p>{note.body.trim()}</p>
        )}
        <div className="studio-note-foot">
          {canEdit && mode === "edit" ? (
            <span className="studio-note-acts">
              <button type="button" disabled={busy || !draft.trim()} onClick={() => void save()}>
                save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(note.body);
                  setMode("read");
                }}
              >
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
                <button
                  type="button"
                  onClick={() => {
                    setDraft(note.body);
                    setMode("edit");
                  }}
                >
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

export function ViewedReceipt({
  text,
  viewedAtByToken,
}: {
  text: string;
  viewedAtByToken: Record<string, string>;
}) {
  const viewed = proposalCards(text)
    .cards.map((card) => viewedAtByToken[card.key])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  if (!viewed) return null;
  return <p className="studio-mail-viewed">last viewed {mailStamp(viewed)}</p>;
}

export function MailFace({
  messages,
  clientName,
  person = false,
  fileHrefs,
  viewedAtByToken,
  onCancel,
}: {
  messages: InquiryMessageRow[];
  clientName: string | null | undefined;
  person?: boolean;
  fileHrefs: Record<string, string>;
  viewedAtByToken: Record<string, string>;
  onCancel?: (id: string) => void;
}) {
  const rows = messages.map((message) => mailParty(message, clientName));
  return (
    <section className="studio-mail-study">
      <div className="studio-mail-face is-soft">
        {rows.map((mail, index) => {
          const text = mail.formArrival ? shareNote(mail.text) : mail.text;
          if (mail.formArrival && !text) return null;
          const previous = rows[index - 1];
          const next = rows[index + 1];
          const studio = mail.outbound && !mail.note;
          const side = studio ? "out" : mail.note ? "note" : "in";
          const prevSide = previous
            ? previous.outbound && !previous.note
              ? "out"
              : previous.note
                ? "note"
                : "in"
            : "";
          const nextSide = next
            ? next.outbound && !next.note
              ? "out"
              : next.note
                ? "note"
                : "in"
            : "";
          const day = mailDayChanged(mail.at, previous?.at) ? mailDay(mail.at) : "";
          const sameRun = !day && prevSide === side && previous?.name === mail.name;
          const runEnds =
            nextSide !== side || next?.name !== mail.name || mailDayChanged(next?.at, mail.at);
          const recipients = mail.note ? "" : (messages[index]?.to_address ?? "");
          const named = !sameRun && !mail.note && (!studio || mail.relayed);
          return (
            <div key={mail.id} className="studio-mail-turn">
              {day ? <p className="studio-mail-stamp">{day}</p> : null}
              {named ? (
                <p className="studio-mail-name">
                  {person &&
                  clientName &&
                  mail.name.trim().toLowerCase() === clientName.trim().toLowerCase() ? (
                    <PersonName name={mail.name} />
                  ) : (
                    mail.name
                  )}
                </p>
              ) : null}
              <article
                className={cn("studio-mail-face-item", studio && "is-out", mail.note && "is-note")}
              >
                <div className="studio-mail-bubble">
                  {mail.note ? (
                    <p className="studio-mail-subject">studio note · {mail.name}</p>
                  ) : null}
                  {!mail.note && !hiddenSubject(mail.subject) && !/^re:/i.test(mail.subject) ? (
                    <p className="studio-mail-subject">{mail.subject}</p>
                  ) : null}
                  {text ? (
                    <MailBody
                      body={
                        proposalCards(studio && !mail.relayed ? withoutSignoff(text) : text).text
                      }
                      personName={studio ? (clientName ?? null) : null}
                    />
                  ) : null}
                  {proposalCards(mail.text).cards.length ? (
                    <div className="studio-mail-files">
                      {proposalCards(mail.text).cards.map((card) => (
                        <MailFile
                          key={card.href}
                          name="proposal.pdf"
                          href={proposalOpenHref(card.href)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {studio && !mail.relayed ? <MailSignature name={mail.name} tone="ink" /> : null}
                  {mail.files.length ? (
                    <div className="studio-mail-files">
                      {mail.files.map((name) => (
                        <MailFile
                          key={name}
                          name={name}
                          href={fileHrefs[name] ?? PORTAL_FILES[name]}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
              {/[,·]/.test(recipients) ? <p className="studio-mail-cc">{recipients}</p> : null}
              {runEnds && !mail.note ? (
                <p className="studio-mail-time">{mailTime(mail.at)}</p>
              ) : null}
              {studio ? <ViewedReceipt text={mail.text} viewedAtByToken={viewedAtByToken} /> : null}
              {mail.waiting || mail.failed ? (
                <p className="studio-mail-wait">
                  {mail.failed
                    ? "this letter didn't send. check gmail in settings, then send it again."
                    : Date.parse(mail.at) > Date.now()
                      ? `sends ${mailStamp(mail.at)}`
                      : "sending…"}
                  {onCancel && messages[index]?.id ? (
                    <button
                      type="button"
                      className="studio-ghost"
                      onClick={() => onCancel(messages[index]!.id)}
                    >
                      {mail.failed ? "remove" : "cancel"}
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
