import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { EmailIntegrationRow } from "../../integrations/supabase/types";
import { createPublicToken, decryptSecret, encryptSecret, hashToken } from "./crypto.server";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export const GMAIL_PUBLIC_FIELDS = [
  "id",
  "provider",
  "status",
  "account_email",
  "connected_at",
  "connected_by",
  "updated_at",
] as const;

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const FILE_VAULT_PATH = join(process.cwd(), ".data", "gmail-integration.json");

export type GmailRecord = EmailIntegrationRow;

export type GmailPublicStatus = {
  id: string | null;
  provider: "gmail";
  status: GmailRecord["status"];
  account_email: string | null;
  connected_at: string | null;
  connected_by: string | null;
  updated_at: string | null;
};

export type GmailCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  loginHint: string | null;
};

export type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type GmailOAuthClient = {
  token(params: Record<string, string>): Promise<GoogleTokenResponse>;
  userEmail(accessToken: string): Promise<string>;
  revoke(token: string): Promise<void>;
};

export type GmailVault = {
  read(): Promise<GmailRecord | null>;
  write(record: GmailRecord): Promise<void>;
};

export type GmailDeps = {
  vault: GmailVault;
  oauth: GmailOAuthClient;
  credentials: GmailCredentials;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  now?: () => Date;
};

type MemoryOAuthState = {
  connectedBy: string;
  expiresAt: number;
};

const memoryStates = new Map<string, MemoryOAuthState>();
let memoryRecord: GmailRecord | null = null;

export function createMemoryGmailVault(initial: GmailRecord | null = null): GmailVault {
  let record = initial;
  return {
    async read() {
      return record;
    },
    async write(next) {
      record = next;
    },
  };
}

export function toGmailPublicStatus(record: GmailRecord | null): GmailPublicStatus {
  return {
    id: record?.id ?? null,
    provider: "gmail",
    status: record?.status ?? "disconnected",
    account_email: record?.account_email ?? null,
    connected_at: record?.connected_at ?? null,
    connected_by: record?.connected_by ?? null,
    updated_at: record?.updated_at ?? null,
  };
}

export function publicStatusContainsSecrets(status: GmailPublicStatus) {
  const encoded = JSON.stringify(status);
  return /token|secret|refresh|bearer/i.test(encoded);
}

export function gmailAuthorizeUrl(state: string, credentials: GmailCredentials) {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    scope: GMAIL_SCOPES.join(" "),
  });
  if (credentials.loginHint) {
    params.set("login_hint", credentials.loginHint);
    const at = credentials.loginHint.lastIndexOf("@");
    if (at > 0) params.set("hd", credentials.loginHint.slice(at + 1));
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function createGmailIntegration(deps: GmailDeps) {
  const now = () => deps.now?.() ?? new Date();

  async function publicStatus() {
    return toGmailPublicStatus(await deps.vault.read());
  }

  async function completeOAuth(code: string, connectedBy: string) {
    const tokens = await deps.oauth.token({
      code,
      client_id: deps.credentials.clientId,
      client_secret: deps.credentials.clientSecret,
      redirect_uri: deps.credentials.redirectUri,
      grant_type: "authorization_code",
    });
    if (!tokens.access_token) throw new Error("Google did not return an access token");

    const existing = await deps.vault.read();
    const refreshToken =
      tokens.refresh_token ??
      (existing?.encrypted_refresh_token ? deps.decrypt(existing.encrypted_refresh_token) : null);
    if (!refreshToken) {
      throw new Error("Google did not return a refresh token. Reconnect Gmail with consent.");
    }

    const accountEmail = await deps.oauth.userEmail(tokens.access_token);
    const at = now();
    const record: GmailRecord = {
      id: existing?.id ?? randomUUID(),
      provider: "gmail",
      account_email: accountEmail,
      encrypted_access_token: deps.encrypt(tokens.access_token),
      encrypted_refresh_token: deps.encrypt(refreshToken),
      token_expires_at: tokens.expires_in
        ? new Date(at.getTime() + tokens.expires_in * 1000).toISOString()
        : null,
      status: "connected",
      connected_at: at.toISOString(),
      connected_by: connectedBy,
      created_at: existing?.created_at ?? at.toISOString(),
      updated_at: at.toISOString(),
    };
    await deps.vault.write(record);
    return toGmailPublicStatus(record);
  }

  async function disconnect() {
    const existing = await deps.vault.read();
    for (const field of ["encrypted_access_token", "encrypted_refresh_token"] as const) {
      const encrypted = existing?.[field];
      if (!encrypted) continue;
      try {
        await deps.oauth.revoke(deps.decrypt(encrypted));
      } catch {
        // Best-effort revoke — local disconnect still proceeds.
      }
    }

    const at = now();
    const record: GmailRecord = {
      id: existing?.id ?? randomUUID(),
      provider: "gmail",
      account_email: null,
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      token_expires_at: null,
      status: "disconnected",
      connected_at: null,
      connected_by: null,
      created_at: existing?.created_at ?? at.toISOString(),
      updated_at: at.toISOString(),
    };
    await deps.vault.write(record);
    return toGmailPublicStatus(record);
  }

  async function refresh(options: { force?: boolean } = {}) {
    const existing = await deps.vault.read();
    if (!existing?.encrypted_refresh_token) throw new Error("Gmail is not connected");

    const expiresSoon =
      options.force === true ||
      !existing.token_expires_at ||
      new Date(existing.token_expires_at).getTime() <= now().getTime() + TOKEN_REFRESH_SKEW_MS;

    if (!expiresSoon && existing.encrypted_access_token && existing.status === "connected") {
      return toGmailPublicStatus(existing);
    }

    try {
      const tokens = await deps.oauth.token({
        client_id: deps.credentials.clientId,
        client_secret: deps.credentials.clientSecret,
        refresh_token: deps.decrypt(existing.encrypted_refresh_token),
        grant_type: "refresh_token",
      });
      if (!tokens.access_token) throw new Error("Google did not refresh the access token");
      const at = now();
      const record: GmailRecord = {
        ...existing,
        encrypted_access_token: deps.encrypt(tokens.access_token),
        encrypted_refresh_token: tokens.refresh_token
          ? deps.encrypt(tokens.refresh_token)
          : existing.encrypted_refresh_token,
        token_expires_at: tokens.expires_in
          ? new Date(at.getTime() + tokens.expires_in * 1000).toISOString()
          : existing.token_expires_at,
        status: "connected",
        updated_at: at.toISOString(),
      };
      await deps.vault.write(record);
      return toGmailPublicStatus(record);
    } catch (error) {
      const at = now();
      await deps.vault.write({
        ...existing,
        status: "error",
        updated_at: at.toISOString(),
      });
      throw error instanceof Error ? error : new Error("Gmail token refresh failed");
    }
  }

  async function validAccessToken() {
    await refresh();
    const latest = await deps.vault.read();
    if (!latest?.encrypted_access_token || latest.status !== "connected") {
      throw new Error("Gmail is not connected");
    }
    return deps.decrypt(latest.encrypted_access_token);
  }

  return { publicStatus, completeOAuth, disconnect, refresh, validAccessToken };
}

export function readGmailCredentials(): GmailCredentials {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_GMAIL_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [
      ...(!clientId ? ["GOOGLE_CLIENT_ID"] : []),
      ...(!clientSecret ? ["GOOGLE_CLIENT_SECRET"] : []),
      ...(!redirectUri ? ["GOOGLE_GMAIL_REDIRECT_URI"] : []),
    ];
    throw new Error(
      `Gmail OAuth is not configured. Add ${missing.join(", ")} and INTEGRATION_ENCRYPTION_KEY, then restart the server.`,
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    loginHint: process.env["GMAIL_INBOX"] ?? null,
  };
}

export const liveGmailOAuth: GmailOAuthClient = {
  async token(params) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const payload = (await response.json()) as GoogleTokenResponse;
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || "Google OAuth failed");
    }
    return payload;
  },
  async userEmail(accessToken) {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as { email?: string };
    if (!response.ok || !payload.email) {
      throw new Error("Could not read the Gmail account email");
    }
    return payload.email;
  },
  async revoke(token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  },
};

const liveGmailVault: GmailVault = {
  async read() {
    const fromInbox = await readSupabaseRecord();
    if (fromInbox?.status === "connected" && fromInbox.encrypted_refresh_token) return fromInbox;
    const fromGoogle = await readGoogleConnectionRecord();
    if (fromGoogle) return fromGoogle;
    if (fromInbox) return fromInbox;
    const fromFile = await readFileRecord();
    if (fromFile) return fromFile;
    return memoryRecord;
  },
  async write(record) {
    memoryRecord = record;
    await writeFileRecord(record);
    await writeSupabaseRecord(record);
  },
};

function liveGmail() {
  return createGmailIntegration({
    vault: liveGmailVault,
    oauth: liveGmailOAuth,
    credentials: readGmailCredentials(),
    encrypt: encryptSecret,
    decrypt: decryptSecret,
  });
}

export async function getGmailPublicStatus() {
  return toGmailPublicStatus(await liveGmailVault.read());
}

export async function startGmailOAuth(connectedBy: string) {
  const credentials = readGmailCredentials();
  if (!process.env["INTEGRATION_ENCRYPTION_KEY"]) {
    throw new Error(
      "Gmail OAuth is not configured. Add INTEGRATION_ENCRYPTION_KEY, then restart the server.",
    );
  }
  const { token, hash } = createPublicToken();
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  memoryStates.set(hash, { connectedBy, expiresAt });
  await persistOAuthState(hash, connectedBy, new Date(expiresAt).toISOString());
  return gmailAuthorizeUrl(token, credentials);
}

export async function consumeGmailOAuthState(state: string) {
  if (state.length < 32 || state.length > 256) return null;
  const tokenHash = hashToken(state);

  const fromDb = await consumeSupabaseOAuthState(tokenHash);
  if (fromDb) {
    memoryStates.delete(tokenHash);
    return fromDb;
  }

  const pending = memoryStates.get(tokenHash);
  if (!pending) return null;
  memoryStates.delete(tokenHash);
  if (pending.expiresAt <= Date.now()) return null;
  return pending.connectedBy;
}

export async function completeGmailOAuth(code: string, connectedBy: string) {
  return liveGmail().completeOAuth(code, connectedBy);
}

export async function storeGmailGrant(input: {
  accessToken: string;
  refreshToken: string | null;
  expiresIn?: number | undefined;
  accountEmail: string | null;
  connectedBy: string;
}) {
  const existing = await liveGmailVault.read();
  const refreshToken =
    input.refreshToken ??
    (existing?.encrypted_refresh_token ? decryptSecret(existing.encrypted_refresh_token) : null);
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Reconnect and allow access.");
  }
  const at = new Date();
  const record: GmailRecord = {
    id: existing?.id ?? randomUUID(),
    provider: "gmail",
    account_email: input.accountEmail,
    encrypted_access_token: encryptSecret(input.accessToken),
    encrypted_refresh_token: encryptSecret(refreshToken),
    token_expires_at: input.expiresIn
      ? new Date(at.getTime() + input.expiresIn * 1000).toISOString()
      : null,
    status: "connected",
    connected_at: at.toISOString(),
    connected_by: input.connectedBy,
    created_at: existing?.created_at ?? at.toISOString(),
    updated_at: at.toISOString(),
  };
  await liveGmailVault.write(record);
  return toGmailPublicStatus(record);
}

export async function disconnectGmailConnection() {
  return createGmailIntegration({
    vault: liveGmailVault,
    oauth: liveGmailOAuth,
    credentials: readGmailCredentialsOptional(),
    encrypt: encryptSecret,
    decrypt: decryptSecret,
  }).disconnect();
}

export async function refreshGmailConnection(options: { force?: boolean } = {}) {
  return liveGmail().refresh(options);
}

export async function validGmailAccessToken() {
  return liveGmail().validAccessToken();
}

export async function markGmailConnectionError(message: string, connectedBy: string) {
  const existing = await liveGmailVault.read();
  const at = new Date();
  await liveGmailVault.write({
    id: existing?.id ?? randomUUID(),
    provider: "gmail",
    account_email: existing?.account_email ?? null,
    encrypted_access_token: existing?.encrypted_access_token ?? null,
    encrypted_refresh_token: existing?.encrypted_refresh_token ?? null,
    token_expires_at: existing?.token_expires_at ?? null,
    status: "error",
    connected_at: existing?.connected_at ?? null,
    connected_by: connectedBy,
    created_at: existing?.created_at ?? at.toISOString(),
    updated_at: at.toISOString(),
  });
  await recordGmailEvent(connectedBy, "oauth_callback", "failed", message);
}

function readGmailCredentialsOptional(): GmailCredentials {
  try {
    return readGmailCredentials();
  } catch {
    return {
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      loginHint: process.env["GMAIL_INBOX"] ?? null,
    };
  }
}

function supabaseConfigured() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

const GMAIL_STORE_SELECT =
  "id, provider, account_email, encrypted_access_token, encrypted_refresh_token, token_expires_at, status, connected_at, connected_by, created_at, updated_at";

async function readGoogleConnectionRecord(): Promise<GmailRecord | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integration_connections")
      .select(
        "id, encrypted_access_token, encrypted_refresh_token, expires_at, status, metadata, connected_by, updated_at",
      )
      .eq("provider", "google")
      .eq("status", "connected")
      .maybeSingle();
    if (error || !data?.encrypted_refresh_token) return null;
    const metadata =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? data.metadata
        : {};
    const scopeValue = metadata["scope"];
    const scope = typeof scopeValue === "string" ? scopeValue : "";
    if (scope && !scope.includes("gmail.send")) return null;
    const accountValue = metadata["account_email"];
    const account = typeof accountValue === "string" ? accountValue : null;
    return {
      id: data.id,
      provider: "gmail",
      account_email: account,
      encrypted_access_token: data.encrypted_access_token,
      encrypted_refresh_token: data.encrypted_refresh_token,
      token_expires_at: data.expires_at,
      status: "connected",
      connected_at: data.updated_at,
      connected_by: data.connected_by,
      created_at: data.updated_at,
      updated_at: data.updated_at,
    };
  } catch {
    return null;
  }
}

async function readSupabaseRecord() {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_integration")
      .select(GMAIL_STORE_SELECT)
      .eq("provider", "gmail")
      .maybeSingle();
    if (error || !data) return null;
    return data as GmailRecord;
  } catch {
    return null;
  }
}

async function writeSupabaseRecord(record: GmailRecord) {
  if (!supabaseConfigured()) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_integration").upsert(
      {
        id: record.id,
        provider: "gmail",
        account_email: record.account_email,
        encrypted_access_token: record.encrypted_access_token,
        encrypted_refresh_token: record.encrypted_refresh_token,
        token_expires_at: record.token_expires_at,
        status: record.status,
        connected_at: record.connected_at,
        connected_by: record.connected_by,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
      { onConflict: "provider" },
    );
    if (error) console.error("[gmail] email_integration write failed:", error.message);
  } catch (error) {
    console.error(
      "[gmail] email_integration unavailable — storing tokens in the local vault until Supabase is activated.",
      error instanceof Error ? error.message : error,
    );
  }
}

async function persistOAuthState(tokenHash: string, connectedBy: string, expiresAt: string) {
  if (!supabaseConfigured()) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integration_events").insert({
      provider: "gmail",
      event_type: "oauth_state",
      status: "pending",
      reference_type: "profile",
      reference_id: connectedBy,
      attempts: 0,
      payload: { token_hash: tokenHash, expires_at: expiresAt },
    });
    if (error) console.error("[gmail] oauth state persist failed:", error.message);
  } catch {
    // Memory state is enough until Supabase is activated.
  }
}

async function consumeSupabaseOAuthState(tokenHash: string) {
  if (!supabaseConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: states, error } = await supabaseAdmin
      .from("integration_events")
      .select("id, reference_id, payload")
      .eq("provider", "gmail")
      .eq("event_type", "oauth_state")
      .eq("status", "pending")
      .contains("payload", { token_hash: tokenHash })
      .limit(1);
    if (error || !states?.[0]?.reference_id) return null;

    const candidate = states[0];
    const payload =
      candidate.payload &&
      typeof candidate.payload === "object" &&
      !Array.isArray(candidate.payload)
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
  } catch {
    return null;
  }
}

async function recordGmailEvent(
  connectedBy: string,
  eventType: string,
  status: "failed" | "succeeded",
  message: string | null,
) {
  if (!supabaseConfigured()) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integration_events").insert({
      provider: "gmail",
      event_type: eventType,
      status,
      reference_type: "profile",
      reference_id: connectedBy,
      attempts: 1,
      error_message: message ? message.slice(0, 1000) : null,
      payload: {},
    });
  } catch {
    // Isolation / pre-Supabase: skip event log.
  }
}

async function readFileRecord() {
  try {
    const raw = await readFile(FILE_VAULT_PATH, "utf8");
    const parsed = JSON.parse(raw) as GmailRecord;
    if (!parsed || parsed.provider !== "gmail") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileRecord(record: GmailRecord) {
  try {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    const tmp = `${FILE_VAULT_PATH}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
    await rename(tmp, FILE_VAULT_PATH);
  } catch (error) {
    console.error(
      "[gmail] local vault write failed:",
      error instanceof Error ? error.message : error,
    );
  }
}
