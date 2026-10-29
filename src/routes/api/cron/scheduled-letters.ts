import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/scheduled-letters")({
  server: {
    handlers: {
      GET: async ({ request }) => handleLettersCron(request),
      POST: async ({ request }) => handleLettersCron(request),
    },
  },
});

async function handleLettersCron(request: Request) {
  const unauthorized = await authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendDueLetters } = await import("@/lib/os/letter-send.server");
    return Response.json(await sendDueLetters(supabaseAdmin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled letters failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function authorizeCron(request: Request) {
  const { authenticateCronRequest, hasCronSecret } =
    await import("@/integrations/supabase/cron-auth");
  if (!hasCronSecret() && process.env["NODE_ENV"] !== "production") return null;
  return authenticateCronRequest(request);
}
