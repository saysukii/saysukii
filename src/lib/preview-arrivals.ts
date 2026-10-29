import type { EventType } from "@/integrations/supabase/types";

export const PREVIEW_ARRIVALS_KEY = "say-sukii-preview-arrivals";

export type PreviewArrival = {
  id: string;
  name: string;
  email: string;
  phone: string;
  eventType: EventType;
  eventDate: string | null;
  eventDateTbd: boolean;
  venue: string;
  budget: string;
  message: string;
  receivedAt: string;
};

export function readPreviewArrivals(): PreviewArrival[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREVIEW_ARRIVALS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PreviewArrival[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberPreviewArrival(arrival: PreviewArrival) {
  const next = [arrival, ...readPreviewArrivals().filter((item) => item.id !== arrival.id)].slice(
    0,
    8,
  );
  localStorage.setItem(PREVIEW_ARRIVALS_KEY, JSON.stringify(next));
}
