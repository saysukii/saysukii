import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PersonName } from "@/components/studio/PersonName";
import {
  inLoveNoteView,
  LOVE_NOTE_VIEWS,
  loveNoteDate,
  loveNoteNotice,
  type LoveNote,
  type LoveNoteView,
} from "@/lib/love-note-view";
import { deleteLoveNote, listLoveNotes } from "@/lib/os/love-notes.functions";
import { pushNotice } from "@/lib/studio-notices";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/love-notes")({
  head: () => ({
    meta: [{ title: "Love notes — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: LoveNotesPage,
});

/** a short tone, so the local preview has something to play */
function previewTone() {
  const rate = 8000;
  const samples = rate;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) {
    bytes[44 + i] = 128 + 30 * Math.sin((2 * Math.PI * 440 * i) / rate);
  }
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

function previewNotes(): LoveNote[] {
  const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const tone = previewTone();
  const use = "i give say sukii permission to store and use my voice note.";
  const marketing = "i give say sukii permission to use my voice note in its marketing.";
  return [
    {
      id: "preview-1",
      note: "sample note: you made the whole day feel like us. thank you for everything.",
      name: "Sample Maya",
      createdAt: ago(0),
      audioUrl: tone,
      downloadUrl: tone,
      downloadName: "love-note-sample.wav",
      hasRecording: true,
      okToUse: true,
      okForMarketing: true,
      consentWording: use,
      marketingWording: marketing,
    },
    {
      id: "preview-2",
      note: "",
      name: "Sample Jordan",
      createdAt: ago(1),
      audioUrl: tone,
      downloadUrl: tone,
      downloadName: "love-note-sample.wav",
      hasRecording: true,
      okToUse: true,
      okForMarketing: false,
      consentWording: use,
      marketingWording: null,
    },
    {
      id: "preview-3",
      note: "sample note: the flowers lasted for two weeks and i still think about them.",
      name: "Sample Ana",
      createdAt: ago(9),
      audioUrl: null,
      downloadUrl: null,
      downloadName: null,
      hasRecording: false,
      okToUse: false,
      okForMarketing: false,
      consentWording: null,
      marketingWording: null,
    },
  ];
}

function LoveNotesPage() {
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const fetchNotes = useServerFn(listLoveNotes);
  const removeNote = useServerFn(deleteLoveNote);
  const [view, setView] = useState<LoveNoteView>("all");
  const key = ["os", "love-notes", devPreview];

  const notes = useQuery({
    queryKey: key,
    queryFn: () => (devPreview ? previewNotes() : fetchNotes()),
    // listening links run out after half an hour, so they're renewed before then
    refetchInterval: devPreview ? false : 20 * 60 * 1000,
  });
  const rows = notes.data ?? [];
  const shown = rows.filter((note) => inLoveNoteView(note, view));

  async function remove(id: string) {
    try {
      if (!devPreview) await removeNote({ data: { id } });
      queryClient.setQueryData<LoveNote[]>(key, (now) => (now ?? []).filter((n) => n.id !== id));
    } catch {
      toast.error("that note couldn't be deleted. please try again.");
    }
  }

  return (
    <div className="studio-home">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">studio</p>
          <h1>love notes</h1>
          <p>what people have left on the card at lovenote.saysukii.com.</p>
        </div>
        {devPreview ? (
          <div className="studio-home-hello-go">
            {/* local preview only: the bell doesn't look for real notes here */}
            <button
              type="button"
              className="studio-ghost"
              onClick={() =>
                pushNotice(
                  loveNoteNotice({ id: `preview-${Date.now()}`, name: "Maya", hasRecording: true }),
                )
              }
            >
              show a sample toast
            </button>
          </div>
        ) : null}
      </header>
      <div className="studio-love-page">
        <div className="studio-file-views" role="tablist" aria-label="love note views">
          {LOVE_NOTE_VIEWS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={view === id ? "is-on" : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {notes.isPending ? <p className="studio-love-empty">…</p> : null}
        {notes.isError ? (
          <p className="studio-love-empty">the love notes couldn't be read. please try again.</p>
        ) : null}
        {!notes.isPending && !notes.isError && shown.length === 0 ? (
          <p className="studio-love-empty">
            {view === "all" ? "no love notes yet." : "none of these yet."}
          </p>
        ) : null}
        <div className="studio-love-notes">
          {shown.map((note) => (
            <LoveNoteRow key={note.id} note={note} onDelete={() => remove(note.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoveNoteRow({ note, onDelete }: { note: LoveNote; onDelete: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <article className="studio-love-note">
      <header>
        <p>
          <span>from:</span> <PersonName name={note.name} />
        </p>
        <time dateTime={note.createdAt}>{loveNoteDate(note.createdAt)}</time>
      </header>
      {note.note ? <p className="studio-love-words">{note.note}</p> : null}
      {note.hasVideo ? (
        note.videoUrl ? (
          <video
            className="studio-love-video"
            controls
            playsInline
            preload="metadata"
            src={note.videoUrl}
            aria-label={`video note from ${note.name}`}
          />
        ) : (
          <p className="studio-love-empty">this recording couldn't be opened.</p>
        )
      ) : note.hasRecording ? (
        note.audioUrl ? (
          <audio
            controls
            preload="none"
            src={note.audioUrl}
            aria-label={`voice note from ${note.name}`}
          />
        ) : (
          <p className="studio-love-empty">this recording couldn't be opened.</p>
        )
      ) : null}
      <footer>
        {note.hasRecording ? (
          <p className="studio-love-consent">
            <span title={note.consentWording ?? undefined}>ok to store and use</span>
            <span
              title={note.marketingWording ?? undefined}
              className={note.okForMarketing ? "is-yes" : undefined}
            >
              {note.okForMarketing ? "ok for marketing" : "not for marketing"}
            </span>
          </p>
        ) : (
          <p className="studio-love-consent">
            <span>typed note, not cleared for marketing</span>
          </p>
        )}
        <div className="studio-love-actions">
          {note.downloadUrl ? (
            <a href={note.downloadUrl} download={note.downloadName ?? true}>
              download
            </a>
          ) : null}
          {asking ? (
            <p className="studio-love-delete">
              <span>delete for good?</span>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleting(true);
                  void onDelete().finally(() => setDeleting(false));
                }}
              >
                delete
              </button>
              <button type="button" disabled={deleting} onClick={() => setAsking(false)}>
                keep
              </button>
            </p>
          ) : (
            <p className="studio-love-delete">
              <button type="button" onClick={() => setAsking(true)}>
                delete
              </button>
            </p>
          )}
        </div>
      </footer>
    </article>
  );
}
