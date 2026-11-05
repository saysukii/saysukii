import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/meeting-summaries")({
  server: {
    handlers: {
      GET: async ({ request }) => handleSummariesCron(request),
      POST: async ({ request }) => handleSummariesCron(request),
    },
  },
});

async function handleSummariesCron(request: Request) {
  const unauthorized = await authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { studioMeetingSync, syncMeetingSummaries } =
      await import("@/lib/os/meeting-sync.server");
    return Response.json(await syncMeetingSummaries(studioMeetingSync(supabaseAdmin)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meeting summaries failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function authorizeCron(request: Request) {
  const { authenticateCronRequest, hasCronSecret } =
    await import("@/integrations/supabase/cron-auth");
  if (!hasCronSecret() && process.env["NODE_ENV"] !== "production") return null;
  return authenticateCronRequest(request);
}
