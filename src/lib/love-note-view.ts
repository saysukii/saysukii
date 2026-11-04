import { safeDownloadName } from "./app-file-link.ts";

/** A love note as the studio reads it. */
export type LoveNote = {
  id: string;
  note: string;
  name: string;
  createdAt: string;
  /** a private link to listen, which runs out; empty for a typed note */
  audioUrl: string | null;
  /** the same recording, saved to the computer under a readable name */
  downloadUrl: string | null;
  downloadName: string | null;
  hasRecording: boolean;
  okToUse: boolean;
  okForMarketing: boolean;
  /** the exact words they agreed to, kept as the record */
  consentWording: string | null;
  marketingWording: string | null;
};

/** "love-note-maya-lee-2026-11-03.m4a": who it's from and when, so saved files stay findable. */
export function loveNoteFileName(name: string, createdAt: string, path: string) {
  const extension = path.split(".").pop() ?? "";
  return safeDownloadName(`love-note-${name}-${createdAt.slice(0, 10)}.${extension}`);
}

export type LoveNoteView = "all" | "voice" | "marketing";

export const LOVE_NOTE_VIEWS: [LoveNoteView, string][] = [
  ["all", "all"],
  ["voice", "voice notes"],
  ["marketing", "ok for marketing"],
];

export function inLoveNoteView(note: LoveNote, view: LoveNoteView) {
  if (view === "voice") return note.hasRecording;
  // only a recording can be cleared for marketing: a typed note never asked
  if (view === "marketing") return note.hasRecording && note.okForMarketing;
  return true;
}

/** What the bell says when a note comes in. */
export function loveNoteNotice(row: { id: string; name: string; hasRecording: boolean }) {
  return {
    id: `love-note-${row.id}`,
    title: `${row.name} left a love note`,
    body: row.hasRecording ? "with a voice note." : "it's in your love notes.",
    href: "/love-notes",
  };
}

export function loveNoteDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toLowerCase();
}
