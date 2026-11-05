import { studioFileSlug } from "@/lib/os/inquiry-holds";

export type StoredLetterFile = {
  id: string;
  name?: string | null;
  signed_url?: string | null;
  created_at: string;
};

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
