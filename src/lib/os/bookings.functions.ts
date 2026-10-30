import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";

const bookingInput = z.object({
  startsAt: z.string().datetime(),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  note: z.string().trim().max(2000).optional().default(""),
});

export const listMeetingBusy = createServerFn({ method: "GET" }).handler(async () => {
  const { readStudioCalendar } = await import("@/lib/os/calendar-settings.functions");
  const settings = await readStudioCalendar();
  const horizonDays = settings?.horizonDays ?? 28;
  const durationMinutes = settings?.durationMinutes ?? 30;
  const from = new Date();
  const to = new Date(from.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const busy: { start: string; end: string }[] = [];
  let connected = false;
  try {
    const { googleBusyWindows } = await import("@/lib/os/google.server");
    const windows = await googleBusyWindows(from, to);
    if (windows) {
      connected = true;
      busy.push(...windows);
    }
  } catch {
    connected = false;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("appointments")
      .select("starts_at")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString());
    for (const row of data ?? []) {
      const start = new Date(row.starts_at);
      busy.push({
        start: start.toISOString(),
        end: new Date(start.getTime() + durationMinutes * 60 * 1000).toISOString(),
      });
    }
  } catch {
    // the appointments table is not on this database yet
  }
  return { connected, busy };
});

export const bookAppointment = createServerFn({ method: "POST" })
  .validator((input: unknown) => bookingInput.parse(input))
  .handler(async ({ data }) => {
    const { readStudioCalendar } = await import("@/lib/os/calendar-settings.functions");
    const settings = await readStudioCalendar();
    const durationMinutes = settings?.durationMinutes ?? 30;
    const meeting = settings?.meeting ?? "meet";
    const { createConsultationEvent } = await import("@/lib/os/google.server");
    const googleEvent = await createConsultationEvent({
      ...data,
      durationMinutes,
      meeting,
    }).catch(() => null);
    const googleEventId = googleEvent?.id ?? null;
    let savedId: string | null = null;
    let saveError = "";
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("appointments")
        .insert({
          starts_at: data.startsAt,
          guest_name: data.name,
          guest_email: data.email,
          note: data.note || null,
        })
        .select("id")
        .single();
      savedId = row?.id ?? null;
      if (error) saveError = error.message;
    } catch (error) {
      saveError = error instanceof Error ? error.message : "booking was not saved";
    }
    const { sendBookingEmail, sendBookingNotice } = await import("@/lib/os/booking-email.server");
    const { loadEmailTemplate } = await import("@/lib/os/email-templates.server");
    const mail = {
      template: await loadEmailTemplate("call-booked"),
      startsAt: data.startsAt,
      name: data.name,
      email: data.email,
      note: data.note,
      durationMinutes,
      meeting,
      joinUrl: googleEvent?.joinUrl ?? null,
    };
    // the guest's confirmation, and the studio's note that someone booked
    await Promise.all([sendBookingEmail(mail), sendBookingNotice(mail).catch(() => null)]);
    if (saveError && !googleEventId) throw new Error(saveError);
    return { id: savedId ?? googleEventId, googleEventId };
  });

/** Calls booked in the last day, for the studio's bell. */
export const listFreshBookings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("appointments")
      .select("id, guest_name, starts_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listStudioCalendarEvents = createServerFn({ method: "GET" }).handler(async () => {
  if (!import.meta.env.DEV) throw new Error("Unauthorized");
  const { listStudioGoogleEvents } = await import("@/lib/os/google.server");
  return listStudioGoogleEvents();
});

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("appointments")
      .select("id, starts_at, guest_name, guest_email, note, created_at")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const google = await import("@/lib/os/google.server")
      .then(({ listStudioGoogleEvents }) => listStudioGoogleEvents())
      .catch(() => []);
    const linkByStart = new Map<string, string>();
    for (const event of google) {
      if (!event.allDay && event.joinUrl) linkByStart.set(startKey(event.startsAt), event.joinUrl);
    }
    const taken = new Set(rows.map((row) => startKey(row.starts_at)));
    return [
      ...rows.map((row) => ({
        ...row,
        all_day: false,
        join_url: linkByStart.get(startKey(row.starts_at)) ?? null,
      })),
      ...google
        .filter((event) => event.allDay || !taken.has(startKey(event.startsAt)))
        .map((event) => ({
          id: event.id,
          starts_at: event.startsAt,
          guest_name: event.name,
          guest_email: "",
          note: "google calendar",
          created_at: event.startsAt,
          all_day: event.allDay,
          join_url: event.joinUrl,
        })),
    ].sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  });

function startKey(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  return String(Math.round(time / 60_000));
}

async function readGranolaConnected() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("granola_integration")
    .select("status, encrypted_api_key")
    .limit(1)
    .maybeSingle();
  if (error || !data) return { connected: false as const };
  return { connected: data.status === "connected" && Boolean(data.encrypted_api_key) };
}

export const getGranolaStatus = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => readGranolaConnected());

export const getGranolaStatusDev = createServerFn({ method: "GET" }).handler(async () => {
  if (!import.meta.env.DEV) throw new Error("Unauthorized");
  return readGranolaConnected();
});
