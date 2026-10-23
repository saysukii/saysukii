import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret, encryptSecret } from "./crypto.server";

export const GOOGLE_CONNECT_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
] as const;

function googleCredentials() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_CALENDAR_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured");
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
    scope: GOOGLE_CONNECT_SCOPES.join(" "),
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
  const accountEmail = await googleAccountEmail(tokens.access_token);
  const { storeGmailGrant } = await import("./gmail.server");
  await storeGmailGrant({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresIn: tokens.expires_in,
    accountEmail,
    connectedBy,
  });
  const { error } = await supabaseAdmin.from("integration_connections").upsert(
    {
      provider: "google",
      status: "connected",
      encrypted_access_token: encryptSecret(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      metadata: { scope: tokens.scope ?? GOOGLE_CONNECT_SCOPES.join(" "), account_email: accountEmail },
      connected_by: connectedBy,
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

const STUDIO_ZONE = "America/New_York";

export type CalendarWindow = { start: string; end: string };

export async function googleBusyWindows(from: Date, to: Date): Promise<CalendarWindow[] | null> {
  try {
    googleCredentials();
  } catch {
    return null;
  }
  const { data: connection, error } = await supabaseAdmin
    .from("integration_connections")
    .select("id, encrypted_access_token, encrypted_refresh_token, expires_at, status")
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();
  if (error || !connection?.encrypted_access_token) return null;

  const accessToken = await validAccessToken(connection);
  const calendarId = encodeURIComponent(process.env["GOOGLE_CALENDAR_ID"] ?? "primary");
  const windows: CalendarWindow[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: STUDIO_ZONE,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return null;
      throw new Error(payload.error?.message || "Google Calendar request failed");
    }
    for (const event of payload.items ?? []) {
      const window = eventWindow(event);
      if (window) windows.push(window);
    }
    pageToken = payload.nextPageToken ?? "";
  } while (pageToken);
  return windows;
}

export async function createConsultationEvent(input: {
  startsAt: string;
  name: string;
  email: string;
  note: string;
  durationMinutes?: number;
  meeting?: "meet" | "phone";
}) {
  try {
    googleCredentials();
  } catch {
    return null;
  }
  const { data: connection, error } = await supabaseAdmin
    .from("integration_connections")
    .select("id, encrypted_access_token, encrypted_refresh_token, expires_at, status")
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();
  if (error || !connection?.encrypted_access_token) return null;

  const accessToken = await validAccessToken(connection);
  const start = new Date(input.startsAt);
  const minutes = input.durationMinutes ?? 30;
  const phone = input.meeting === "phone";
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const calendarId = encodeURIComponent(process.env["GOOGLE_CALENDAR_ID"] ?? "primary");
  const body = {
    summary: `let's talk · ${input.name}`,
    description: [`${minutes} minute ${phone ? "phone call" : "google meeting"}`, input.email, input.note]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: start.toISOString(), timeZone: STUDIO_ZONE },
    end: { dateTime: end.toISOString(), timeZone: STUDIO_ZONE },
    attendees: [{ email: input.email, displayName: input.name }],
    ...(phone
      ? {}
      : {
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
  };
  const invited = await insertCalendarEvent(accessToken, calendarId, body, true);
  if (invited.ok) return invited.id;
  const { attendees: _attendees, ...studioOnly } = body;
  const parked = await insertCalendarEvent(accessToken, calendarId, studioOnly, false);
  if (!parked.ok) throw new Error(parked.message || invited.message || "Google Calendar request failed");
  return parked.id;
}

async function insertCalendarEvent(
  accessToken: string,
  calendarId: string,
  body: object,
  invite: boolean,
) {
  const params = new URLSearchParams({ conferenceDataVersion: "1" });
  if (invite) params.set("sendUpdates", "all");
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const event = (await response.json()) as { id?: string; error?: { message?: string } };
  return { ok: response.ok, id: event.id ?? null, message: event.error?.message };
}

function eventWindow(event: GoogleEvent): CalendarWindow | null {
  if (event.status === "cancelled" || event.transparency === "transparent") return null;
  if (event.start?.dateTime && event.end?.dateTime) {
    return {
      start: new Date(event.start.dateTime).toISOString(),
      end: new Date(event.end.dateTime).toISOString(),
    };
  }
  if (event.start?.date && event.end?.date) {
    return { start: studioWallTime(event.start.date).toISOString(), end: studioWallTime(event.end.date).toISOString() };
  }
  return null;
}

function studioWallTime(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 12);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const shown = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
  return new Date(Date.UTC(year, month - 1, day, 0, 0) - (shown - guess));
}

type GoogleEvent = {
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

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

async function googleAccountEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { email?: string };
  return body.email?.trim() || null;
}

export async function disconnectGoogleConnection() {
  const { error } = await supabaseAdmin
    .from("integration_connections")
    .update({
      status: "disconnected",
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      expires_at: null,
    })
    .eq("provider", "google");
  if (error) throw new Error(error.message);
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
