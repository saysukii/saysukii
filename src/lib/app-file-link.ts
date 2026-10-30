/** the storage buckets the studio's files live in, the only ones /file serves */
export const APP_FILE_BUCKETS = ["project-files", "documents"] as const;

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
