import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import { SENT_LETTER_EVENTS } from "@/lib/sent-letters";

/** One email the app sent a client on its own, exactly as it went out. */
export const getSentLetter = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("integration_events")
      .select("payload, created_at")
      .eq("id", data.id)
      .in("event_type", [...SENT_LETTER_EVENTS])
      .maybeSingle();
    if (error) throw new Error(error.message);
    const payload = (row?.payload ?? null) as {
      subject?: string;
      html?: string;
      to?: string;
    } | null;
    if (!row || !payload?.html) throw new Error("this email wasn't saved.");
    return {
      subject: payload.subject ?? "email",
      to: payload.to ?? "",
      sentAt: row.created_at,
      html: payload.html,
    };
  });
