import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret, encryptSecret } from "./crypto.server";

function googleCredentials() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_CALENDAR_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Calendar OAuth is not configured");
  }
  return { clientId, clientSecret, redirectUri };
}

export function googleCalendarAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = googleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    scope: "https://www.googleapis.com/auth/calendar.events",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCalendarCode(code: string, connectedBy: string) {
  const { clientId, clientSecret, redirectUri } = googleCredentials();
  const tokens = await googleToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  const { error } = await supabaseAdmin.from("integration_connections").upsert(
    {
      provider: "google",
      status: "connected",
      encrypted_access_token: encryptSecret(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      metadata: { scope: tokens.scope ?? null },
      connected_by: connectedBy,
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

export async function pushProjectToGoogleCalendar(projectId: string) {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("*, clients(name), venues(name, address)")
    .eq("id", projectId)
    .single();
  if (projectError) throw new Error(projectError.message);
  if (project.google_event_id) return project.google_event_id;

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("integration_connections")
    .select("*")
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();
  if (connectionError || !connection?.encrypted_access_token) return null;

  const accessToken = await validAccessToken(connection);
  const clientName = (project.clients as { name?: string } | null)?.name ?? "Client";
  const venue = project.venues as { name?: string; address?: string } | null;
  const start = project.event_date;
  const nextDay = new Date(`${start}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const calendarId = encodeURIComponent(process.env["GOOGLE_CALENDAR_ID"] ?? "primary");
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `${project.event_name} · ${clientName}`,
        location: venue?.address ?? project.venue_text ?? undefined,
        description: "Say Sukii OS project",
        start: { date: start },
        end: { date: nextDay.toISOString().slice(0, 10) },
      }),
    },
  );
  const event = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(event.error?.message || "Google Calendar request failed");
  if (!event.id) return null;
  await supabaseAdmin.from("projects").update({ google_event_id: event.id }).eq("id", projectId);
  return event.id;
}

async function validAccessToken(connection: {
  id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  expires_at: string | null;
}) {
  if (!connection.encrypted_access_token) throw new Error("Google Calendar is not connected");
  const expiresSoon =
    !connection.expires_at || new Date(connection.expires_at).getTime() <= Date.now() + 60_000;
  if (!expiresSoon) return decryptSecret(connection.encrypted_access_token);
  if (!connection.encrypted_refresh_token) throw new Error("Reconnect Google Calendar");

  const { clientId, clientSecret } = googleCredentials();
  const tokens = await googleToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: decryptSecret(connection.encrypted_refresh_token),
    grant_type: "refresh_token",
  });
  if (!tokens.access_token) throw new Error("Google did not refresh the access token");
  await supabaseAdmin
    .from("integration_connections")
    .update({
      encrypted_access_token: encryptSecret(tokens.access_token),
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
    })
    .eq("id", connection.id);
  return tokens.access_token;
}

async function googleToken(params: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok)
    throw new Error(payload.error_description || payload.error || "Google OAuth failed");
  return payload;
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};
