import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/gmail-route")({
  server: {
    handlers: {
      GET: async ({ request }) => handleRouteCron(request),
      POST: async ({ request }) => handleRouteCron(request),
    },
  },
});

async function handleRouteCron(request: Request) {
  const unauthorized = await authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const { runGmailInboundRouting } = await import("@/lib/os/inquiry-routing.server");
    const result = await runGmailInboundRouting();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail inbound routing failed";
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
