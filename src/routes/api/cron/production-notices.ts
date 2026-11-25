import { createFileRoute } from "@tanstack/react-router";

// every five minutes: once a production is shared, a member hears when they're put on it or given
// a task; and the studio gets the hours of each production whose last shift has ended
export const Route = createFileRoute("/api/cron/production-notices")({
  server: {
    handlers: {
      GET: async ({ request }) => handleProductionNotices(request),
      POST: async ({ request }) => handleProductionNotices(request),
    },
  },
});

async function handleProductionNotices(request: Request) {
  const unauthorized = await authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendDueHours, sendNewsLetters } = await import("@/lib/os/production.server");
    const news = await sendNewsLetters(supabaseAdmin);
    return Response.json({ news, hours: await sendDueHours(supabaseAdmin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Production notices failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function authorizeCron(request: Request) {
  const { authenticateCronRequest, hasCronSecret } =
    await import("@/integrations/supabase/cron-auth");
  if (!hasCronSecret() && process.env["NODE_ENV"] !== "production") return null;
  return authenticateCronRequest(request);
}
