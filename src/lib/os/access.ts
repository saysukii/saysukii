import type { AppRole } from "@/integrations/supabase/types";

/**
 * What an admin can open. The founder sees everything and decides, admin by admin, which of these
 * the others get. Team members see only the productions they're on.
 */
export const STUDIO_AREAS = [
  { id: "inquiries", label: "inquiries", note: "inquiries, proposals, invoices, and clients" },
  { id: "productions", label: "productions", note: "every production, and editing them" },
  { id: "schedule", label: "schedule", note: "the studio's calendar and bookings" },
  { id: "library", label: "library", note: "files and the directories" },
  { id: "gang", label: "the gang", note: "adding people, and turning them on and off" },
  {
    id: "pay",
    label: "rates & payroll",
    note: "sees and sets rates, sees pay on the schedule, and gets the hours email after each production",
  },
  { id: "settings", label: "settings", note: "gmail, square, google, and granola" },
] as const;

export type StudioArea = (typeof STUDIO_AREAS)[number]["id"];

/** a new admin's areas, until the founder changes them */
export const DEFAULT_ADMIN_ACCESS: StudioArea[] = [
  "inquiries",
  "productions",
  "schedule",
  "library",
];

export type AccessProfile = {
  role: AppRole;
  is_owner?: boolean | null | undefined;
  access?: string[] | null | undefined;
};

/** whether someone can open an area: the founder always, an admin when it's been given to them */
export function hasAccess(profile: AccessProfile, area: StudioArea) {
  if (profile.role !== "admin") return false;
  if (profile.is_owner) return true;
  return (profile.access ?? DEFAULT_ADMIN_ACCESS).includes(area);
}

/** only real areas, in their own order, from whatever was saved */
export function cleanAccess(access: readonly string[]) {
  return STUDIO_AREAS.map((area) => area.id).filter((id) => access.includes(id));
}

/** which area a page belongs to, for keeping an admin to what they've been given */
export function areaForPath(pathname: string): StudioArea | null {
  if (pathname.startsWith("/directories/team")) return "gang";
  if (pathname.startsWith("/pipeline") || pathname.startsWith("/clients")) return "inquiries";
  if (pathname.startsWith("/productions") || pathname.startsWith("/production/")) {
    return "productions";
  }
  if (pathname.startsWith("/calendar")) return "schedule";
  if (
    pathname.startsWith("/library") ||
    pathname.startsWith("/directories") ||
    pathname.startsWith("/files") ||
    pathname.startsWith("/shelf") ||
    pathname.startsWith("/love-notes")
  ) {
    return "library";
  }
  return null;
}
