import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLoveNote, hashSender, readLoveNoteBody } from "@/lib/os/love-notes.server";

export const Route = createFileRoute("/api/love-notes/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readLoveNoteBody(request);
        if (!body.ok) return Response.json({ ok: false, error: "invalid note" }, { status: 400 });
        const address =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "";
        try {
          const result = await createLoveNote(
            supabaseAdmin,
            body.value,
            hashSender(address, process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""),
          );
          return Response.json(result.body, { status: result.status });
        } catch (err) {
          console.error("love note wasn't saved", err);
          return Response.json({ ok: false, error: "could not save" }, { status: 500 });
        }
      },
    },
  },
});
