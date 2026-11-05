/** the storage buckets the studio's files live in, the only ones /file serves */
export const APP_FILE_BUCKETS = ["project-files", "documents"] as const;

/** how long a signed file link lasts, in seconds */
export const FILE_LINK_SECONDS = 60 * 30;

/** Whether links fetched at this moment have run out, or are about to before a tap lands. */
export function fileLinkOld(fetchedAt: number, now = Date.now()) {
  return now - fetchedAt > (FILE_LINK_SECONDS - 120) * 1000;
}

/**
 * A private file link on the studio's own address: storage's signed link
 * ".../storage/v1/object/sign/documents/x.pdf?token=…" becomes "/file/documents/x.pdf?token=…".
 * It keeps the same token, so it's just as private and runs out just as soon.
 */
export function appFileLink(signed: string | null | undefined) {
  if (!signed) return null;
  const match = /\/storage\/v1\/object\/sign\/(.+)$/.exec(signed);
  return match ? `/file/${match[1]}` : signed;
}
