import { studioFileSlug } from "@/lib/os/inquiry-holds";

export type StoredLetterFile = {
  id: string;
  name?: string | null;
  signed_url?: string | null;
  created_at: string;
};

/** Gmail takes 25mb of attachments on a letter, counted together rather than per file. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type DraftFileState = {
  name: string;
  size: number;
  path: string | null;
  failed: boolean;
};

/**
 * A letter's words, with an "Attached:" line naming only files it really carries. The line is for
 * the studio's own thread, where it becomes file chips; it's taken off before the letter is sent.
 */
export function letterBodyWithFiles(text: string, files: readonly DraftFileState[]) {
  const words = text.trim();
  const names = files.filter((file) => file.path).map((file) => file.name);
  if (!names.length) return words;
  const line = `Attached: ${names.join(", ")}`;
  return words ? `${words}\n\n${line}` : line;
}

const ATTACHED_LINE = /\n*Attached:\s*[^\n]+\s*$/;

/** A letter's words as the client gets them: the files go as attachments, never as a line. */
export function withoutAttachedLine(body: string) {
  return body.replace(ATTACHED_LINE, "").trim();
}

function inMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** What stops these files going out on a letter, in words for the person sending it. */
export function letterFileProblem(files: readonly DraftFileState[], email: boolean) {
  const failed = files.filter((file) => file.failed);
  const [first] = failed;
  if (first) {
    const who = failed.length === 1 ? first.name : `${failed.length} files`;
    return `${who} didn't upload. retry or remove to send.`;
  }
  if (!email) return null;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= MAX_ATTACHMENT_BYTES) return null;
  const over = Math.ceil(((total - MAX_ATTACHMENT_BYTES) / (1024 * 1024)) * 10) / 10;
  return `these files are ${inMb(total)} mb together, and gmail takes 25 mb per letter. remove ${over.toFixed(1)} mb to send.`;
}

/** How much of gmail's 25mb the files use, shown under them while there's room. */
export function letterFileTotal(files: readonly DraftFileState[]) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return `${inMb(total)} of 25 mb`;
}

const HAS_EXTENSION = /\.[a-z0-9]*[a-z][a-z0-9]*\s*$/i;

/**
 * The names on a letter's "Attached:" line. A name can hold a comma, so a piece with no extension
 * belongs to the name after it: "Smith, Jane.pdf, plan.pdf" is two files, not three.
 */
export function attachedNames(line: string) {
  const names: string[] = [];
  let held: string[] = [];
  for (const piece of line.split(",")) {
    if (HAS_EXTENSION.test(piece)) {
      names.push([...held, piece].join(",").trim());
      held = [];
    } else {
      held.push(piece);
    }
  }
  return [...names, ...held.map((piece) => piece.trim())].filter(Boolean);
}

/** A stored file's name without the time studioFileKey puts in front of it. */
function storedSlug(name: string) {
  return studioFileSlug(name.replace(/^\d{10,}-/, ""));
}

/**
 * The stored file a letter's chip means. A letter keeps the name as it was picked ("Ceremony
 * Layout.pdf") and storage keeps its own form ("1793898269303-ceremony-layout.pdf"), so they're
 * compared in storage's form. When the same name was added more than once, a letter means the
 * copy added most recently before it was written.
 */
export function storedFileFor<File extends StoredLetterFile>(
  name: string,
  files: readonly File[],
  letterAt?: string | null,
) {
  const slug = studioFileSlug(name);
  const copies = files
    .filter((file) => file.signed_url && file.name && storedSlug(file.name) === slug)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const written = letterAt ? Date.parse(letterAt) : Number.NaN;
  if (Number.isNaN(written)) return copies[0] ?? null;
  return (
    copies.find((file) => Date.parse(file.created_at) <= written) ??
    copies[copies.length - 1] ??
    null
  );
}
