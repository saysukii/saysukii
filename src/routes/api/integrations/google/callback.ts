import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/integrations/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGoogleCallback(request),
    },
  },
});

function settingsRedirect(request: Request, status: "connected" | "error") {
  const origin = process.env["APP_URL"]?.replace(/\/$/, "") ?? new URL(request.url).origin;
  const url = new URL("/settings", origin);
  url.searchParams.set("integration", "google");
  url.searchParams.set("status", status);
  return Response.redirect(url, 303);
}

async function consumeGoogleState(state: string) {
  if (state.length < 32 || state.length > 256) return null;

  const [{ supabaseAdmin }, { hashToken }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/os/crypto.server"),
  ]);
  const tokenHash = hashToken(state);
  const { data: states, error } = await supabaseAdmin
    .from("integration_events")
    .select("id, reference_id, payload")
    .eq("provider", "google")
    .eq("event_type", "oauth_state")
    .eq("status", "pending")
    .contains("payload", { token_hash: tokenHash })
    .limit(1);
  if (error || !states?.[0]?.reference_id) return null;

  const candidate = states[0];
  const payload =
    candidate.payload && typeof candidate.payload === "object" && !Array.isArray(candidate.payload)
      ? candidate.payload
      : null;
  const expiresAt = payload?.["expires_at"];
  if (typeof expiresAt !== "string" || Date.parse(expiresAt) <= Date.now()) {
    await supabaseAdmin
      .from("integration_events")
      .update({
        status: "failed",
        attempts: 1,
        error_message: "OAuth state expired",
      })
      .eq("id", candidate.id)
      .eq("status", "pending");
    return null;
  }

  const { data: consumed, error: consumeError } = await supabaseAdmin
    .from("integration_events")
    .update({ status: "succeeded", attempts: 1, error_message: null })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("reference_id")
    .maybeSingle();
  if (consumeError || !consumed?.reference_id) return null;
  return consumed.reference_id;
}

async function recordGoogleFailure(message: string, connectedBy: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: connection } = await supabaseAdmin
    .from("integration_connections")
    .select("id")
    .eq("provider", "google")
    .maybeSingle();
  const connectionWrite = connection
    ? supabaseAdmin
        .from("integration_connections")
        .update({ status: "error" })
        .eq("id", connection.id)
    : supabaseAdmin.from("integration_connections").insert({
        provider: "google",
        status: "error",
        metadata: {},
      });
  await Promise.all([
    supabaseAdmin.from("integration_events").insert({
      provider: "google",
      event_type: "oauth_callback",
      status: "failed",
      reference_type: "profile",
      reference_id: connectedBy,
      attempts: 1,
      error_message: message.slice(0, 1000),
      payload: {},
    }),
    connectionWrite,
  ]);
}

async function handleGoogleCallback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return settingsRedirect(request, "error");

  const connectedBy = await consumeGoogleState(state);
  if (!connectedBy) return settingsRedirect(request, "error");

  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (providerError || !code) {
    await recordGoogleFailure(
      providerError ? `Google authorization failed: ${providerError}` : "Google returned no code",
      connectedBy,
    );
    return settingsRedirect(request, "error");
  }

  try {
    const { exchangeGoogleCalendarCode } = await import("@/lib/os/google.server");
    await exchangeGoogleCalendarCode(code, connectedBy);
    return settingsRedirect(request, "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google connection failed";
    await recordGoogleFailure(message, connectedBy);
    return settingsRedirect(request, "error");
  }
}
