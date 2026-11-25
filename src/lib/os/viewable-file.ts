/** what the team can open in the viewer: pdfs and pictures; anything else stays with the studio */
export function viewable(file: { name: string; file_type: string | null }) {
  const type = file.file_type ?? "";
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf" as const;
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name)) {
    return "image" as const;
  }
  return null;
}
