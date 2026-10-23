import { scheduleMeetingUrl } from "@/lib/studio-bookings";

export const STUDIO_OWNER = "Sukii Qi";

export const SIGNATURE_LINKS = {
  site: "https://www.saysukii.com",
  instagram: "https://instagram.com/saysukii",
  talk: "mailto:info@saysukii.com",
} as const;

export function signatureName(author: string | null | undefined) {
  const value = author?.trim();
  if (!value || /^(say sukii|studio|you|studio preview)$/i.test(value)) return STUDIO_OWNER;
  return value;
}

export function noteAuthor(author: string | null | undefined) {
  const value = author?.trim();
  if (!value || /^(studio|say sukii|you|sukii qi)$/i.test(value)) return "Sukii";
  return value;
}

export function noteWriter(profile: { full_name: string | null; role: string }) {
  if (profile.role === "admin") return "Sukii";
  return profile.full_name?.trim() || "Sukii";
}

export function wroteNote(
  note: { created_by?: string | null; author?: string | null },
  profile: { id: string; full_name: string | null; role: string },
) {
  if (note.created_by) return note.created_by === profile.id;
  return (note.author ?? "").trim() === noteWriter(profile);
}

export function isStudioOwner(name: string) {
  return name.trim().toLowerCase() === STUDIO_OWNER.toLowerCase();
}

export function signatureText(name: string) {
  const lines = ["With Gratitude,", "", `${name} | Say Sukii`];
  if (isStudioOwner(name)) lines.push("Floral Artist, Founder & Creative Director");
  lines.push(
    SIGNATURE_LINKS.site,
    SIGNATURE_LINKS.instagram,
    `let's talk! schedule meeting here ${scheduleMeetingUrl()}`,
  );
  return lines.join("\n");
}
