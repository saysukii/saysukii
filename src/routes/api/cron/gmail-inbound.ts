import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/gmail-inbound")({
  server: {
    handlers: {
      GET: async ({ request }) => handleInboundCron(request),
      POST: async ({ request }) => handleInboundCron(request),
    },
  },
});

async function handleInboundCron(request: Request) {
  const unauthorized = await authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const { runGmailInboundSync } = await import("@/lib/os/gmail-inbound.server");
    const captured = await runGmailInboundSync();
    try {
      const { runGmailInboundRouting } = await import("@/lib/os/inquiry-routing.server");
      const routed = await runGmailInboundRouting();
      return Response.json({ ...captured, routed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gmail inbound routing failed";
      return Response.json({ ...captured, routed: { skipped: true, reason: message } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail inbound sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function authorizeCron(request: Request) {
  if (!process.env["LOVABLE_CRON_SECRET"]) {
    if (process.env["NODE_ENV"] === "production") {
      const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
      return authenticateCronRequest(request);
    }
    return null;
  }
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  return authenticateCronRequest(request);
}
