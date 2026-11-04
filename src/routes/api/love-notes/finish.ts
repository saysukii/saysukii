import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { finishLoveNote, readLoveNoteBody } from "@/lib/os/love-notes.server";

export const Route = createFileRoute("/api/love-notes/finish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readLoveNoteBody(request);
        if (!body.ok) return Response.json({ ok: false, error: "invalid note" }, { status: 400 });
        try {
          const result = await finishLoveNote(supabaseAdmin, body.value);
          return Response.json(result.body, { status: result.status });
        } catch (err) {
          console.error("love note wasn't finished", err);
          return Response.json({ ok: false, error: "could not save" }, { status: 500 });
        }
      },
    },
  },
});
