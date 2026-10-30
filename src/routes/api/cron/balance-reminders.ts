import { createFileRoute } from "@tanstack/react-router";

// once a day: remind clients of a balance due in five days, and on the day it's due
export const Route = createFileRoute("/api/cron/balance-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => handleRemindersCron(request),
      POST: async ({ request }) => handleRemindersCron(request),
    },
  },
});

async function handleRemindersCron(request: Request) {
  const unauthorized = await authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const { sendBalanceReminders } = await import("@/lib/os/proposals.functions");
    return Response.json(await sendBalanceReminders());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Balance reminders failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function authorizeCron(request: Request) {
  const { authenticateCronRequest, hasCronSecret } =
    await import("@/integrations/supabase/cron-auth");
  if (!hasCronSecret() && process.env["NODE_ENV"] !== "production") return null;
  return authenticateCronRequest(request);
}
