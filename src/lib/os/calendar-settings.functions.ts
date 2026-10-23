import { createServerFn } from "@tanstack/react-start";

import { SAY_SUKII_STUDIO_ID } from "@/integrations/supabase/types";
import { normalizeCalendar, type CalendarSettings } from "@/lib/calendar-settings";
import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";

export const getCalendarSettings = createServerFn({ method: "GET" }).handler(async () => {
  return readStudioCalendar();
});

export const saveCalendarSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => normalizeCalendar(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("studios")
      .update({ calendar_settings: data })
      .eq("id", SAY_SUKII_STUDIO_ID);
    if (error) throw new Error(error.message);
    return data;
  });

export async function readStudioCalendar(): Promise<CalendarSettings | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("studios")
      .select("calendar_settings")
      .eq("id", SAY_SUKII_STUDIO_ID)
      .maybeSingle();
    if (error || !data?.calendar_settings) return null;
    return normalizeCalendar(data.calendar_settings);
  } catch {
    return null;
  }
}
