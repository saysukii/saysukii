import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/integrations/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGmailCallback(request),
    },
  },
});

function settingsRedirect(request: Request, status: "connected" | "error") {
  const origin = process.env["APP_URL"]?.replace(/\/$/, "") ?? new URL(request.url).origin;
  const url = new URL("/settings", origin);
  url.searchParams.set("integration", "gmail");
  url.searchParams.set("status", status);
  return Response.redirect(url, 303);
}

async function handleGmailCallback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return settingsRedirect(request, "error");

  const { completeGmailOAuth, consumeGmailOAuthState, markGmailConnectionError } =
    await import("@/lib/os/gmail.server");

  const connectedBy = await consumeGmailOAuthState(state);
  if (!connectedBy) return settingsRedirect(request, "error");

  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (providerError || !code) {
    await markGmailConnectionError(
      providerError ? `Gmail authorization failed: ${providerError}` : "Gmail returned no code",
      connectedBy,
    );
    return settingsRedirect(request, "error");
  }

  try {
    await completeGmailOAuth(code, connectedBy);
    return settingsRedirect(request, "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail connection failed";
    await markGmailConnectionError(message, connectedBy);
    return settingsRedirect(request, "error");
  }
}
