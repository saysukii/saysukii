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
  .inputValidator((input: unknown) => bookingInput.parse(input))
  .handler(async ({ data }) => {
    const { readStudioCalendar } = await import("@/lib/os/calendar-settings.functions");
    const settings = await readStudioCalendar();
    const durationMinutes = settings?.durationMinutes ?? 30;
    const meeting = settings?.meeting ?? "meet";
    const { createConsultationEvent } = await import("@/lib/os/google.server");
    const googleEventId = await createConsultationEvent({ ...data, durationMinutes, meeting }).catch(() => null);
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
    const { sendBookingEmail } = await import("@/lib/os/booking-email.server");
    await sendBookingEmail({
      startsAt: data.startsAt,
      name: data.name,
      email: data.email,
      note: data.note,
      durationMinutes,
      meeting,
    });
    if (saveError && !googleEventId) throw new Error(saveError);
    return { id: savedId ?? googleEventId, googleEventId };
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
    return data ?? [];
  });
