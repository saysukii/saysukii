import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin, requireStudioAuth } from "@/integrations/supabase/studio-auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const roleSchema = z.enum(["admin", "team"]);
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: roleSchema,
});
const memberSchema = z.object({ id: z.string().uuid() });

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const listAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [connections, events, members, invites] = await Promise.all([
      supabaseAdmin
        .from("integration_connections")
        .select("id, provider, status, expires_at, metadata, connected_by, updated_at")
        .order("provider"),
      supabaseAdmin
        .from("integration_events")
        .select(
          "id, provider, event_type, error_message, attempts, reference_type, reference_id, created_at, updated_at",
        )
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(12),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, role, active, created_at, last_seen_at")
        .order("active", { ascending: false })
        .order("full_name", { nullsFirst: false }),
      supabaseAdmin
        .from("team_invites")
        .select("id, email, role, expires_at, accepted_at, created_at")
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    for (const result of [connections, events, members, invites]) {
      if (result.error) throw new Error(result.error.message);
    }

    const gmail = await readGmailPublicConnection(supabaseAdmin);

    return {
      connections: mergeGmailConnection(connections.data ?? [], gmail),
      failedEvents: events.data ?? [],
      members: members.data ?? [],
      invites: invites.data ?? [],
    };
  });

export const listRecentIssues = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integration_events")
      .select("id, provider, event_type, error_message, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = data.email.toLowerCase();
    const [{ supabaseAdmin }, { createPublicToken }, { getRequest }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./crypto.server"),
      import("@tanstack/react-start/server"),
    ]);

    const { data: existingMember, error: memberError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (existingMember) throw new Error("That email already belongs to a studio member.");

    const { hash } = createPublicToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .upsert(
        {
          email,
          role: data.role,
          token_hash: hash,
          invited_by: context.profile.id,
          expires_at: expiresAt,
          accepted_at: null,
        },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (inviteError) throw new Error(inviteError.message);

    const request = getRequest();
    const configuredOrigin = process.env["APP_URL"]?.replace(/\/$/, "");
    const origin = configuredOrigin ?? new URL(request.url).origin;
    const redirectTo = new URL("/onboarding", origin).toString();
    const { error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { role: data.role },
    });

    if (authError) {
      await supabaseAdmin.from("team_invites").delete().eq("id", invite.id).eq("token_hash", hash);
      throw new Error(`The invitation could not be sent: ${authError.message}`);
    }

    return { email, role: data.role };
  });

const profileNameSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
});

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => profileNameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", context.profile.id);
    if (error) throw new Error(error.message);
    return { fullName: data.fullName };
  });

/** The owner's signature, drawn once, for countersigning the agreement copy each client keeps. */
export const saveOwnSignature = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        signature: z.string().startsWith("data:image/png;base64,").max(600_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ signature: data.signature })
      .eq("id", context.profile.id);
    if (error) {
      throw new Error(
        /signature/.test(error.message)
          ? "Run the signature migration in Supabase first."
          : error.message,
      );
    }
    return { saved: Boolean(data.signature) };
  });

export const deactivateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => memberSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.id === context.profile.id) {
      throw new Error("You cannot deactivate your own account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error: memberError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .eq("id", data.id)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Studio member not found.");
    if (!member.active) return { id: member.id };

    if (member.role === "admin") {
      const { count, error: countError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("active", true);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) <= 1) throw new Error("The last active Admin cannot be deactivated.");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ active: false })
      .eq("id", data.id)
      .eq("active", true);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

async function createOAuthRedirect(provider: "square" | "google", connectedBy: string) {
  const [{ supabaseAdmin }, { createPublicToken }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./crypto.server"),
  ]);
  const { token, hash } = createPublicToken();
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("integration_events").insert({
    provider,
    event_type: "oauth_state",
    status: "pending",
    reference_type: "profile",
    reference_id: connectedBy,
    attempts: 0,
    payload: { token_hash: hash, expires_at: expiresAt },
  });
  if (error) throw new Error(error.message);

  if (provider === "square") {
    const { squareAuthorizeUrl } = await import("./square.server");
    return squareAuthorizeUrl(token);
  }
  const { googleCalendarAuthorizeUrl } = await import("./google.server");
  return googleCalendarAuthorizeUrl(token);
}

export const beginSquareOAuth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => ({
    redirectTo: await createOAuthRedirect("square", context.profile.id),
  }));

export const beginGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => ({
    redirectTo: await createOAuthRedirect("google", context.profile.id),
  }));

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { disconnectGoogleConnection } = await import("./google.server");
    const { disconnectGmailConnection } = await import("./gmail.server");
    await disconnectGoogleConnection();
    await disconnectGmailConnection();
    return { status: "disconnected" as const };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { getGmailPublicStatus } = await import("./gmail.server");
    return getGmailPublicStatus();
  });

export const beginGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    try {
      const { startGmailOAuth } = await import("./gmail.server");
      return { redirectTo: await startGmailOAuth(context.profile.id) };
    } catch (error) {
      return {
        redirectTo: null,
        error: error instanceof Error ? error.message : "Gmail could not be connected",
      };
    }
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    try {
      const { disconnectGmailConnection } = await import("./gmail.server");
      return { status: await disconnectGmailConnection() };
    } catch (error) {
      return {
        status: null,
        error: error instanceof Error ? error.message : "Gmail could not be disconnected",
      };
    }
  });

export const refreshGmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    try {
      const { refreshGmailConnection } = await import("./gmail.server");
      return { status: await refreshGmailConnection({ force: true }) };
    } catch (error) {
      return {
        status: null,
        error: error instanceof Error ? error.message : "Gmail token could not be refreshed",
      };
    }
  });

type SettingsConnection = {
  id: string;
  provider: string;
  status: string;
  expires_at: string | null;
  metadata: Json;
  connected_by: string | null;
  updated_at: string | null;
  account_email: string | null;
};

async function readGmailPublicConnection(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
): Promise<SettingsConnection> {
  try {
    const { data, error } = await supabaseAdmin
      .from("email_integration")
      .select(
        "id, provider, account_email, status, connected_at, connected_by, created_at, updated_at",
      )
      .eq("provider", "gmail")
      .maybeSingle();
    if (error || !data) {
      return emptyGmailConnection();
    }
    return {
      id: data.id,
      provider: "gmail",
      status: data.status,
      expires_at: null,
      metadata: {},
      connected_by: data.connected_by,
      updated_at: data.updated_at,
      account_email: data.account_email,
    };
  } catch {
    return emptyGmailConnection();
  }
}

function emptyGmailConnection(): SettingsConnection {
  return {
    id: "gmail",
    provider: "gmail",
    status: "disconnected",
    expires_at: null,
    metadata: {},
    connected_by: null,
    updated_at: null,
    account_email: null,
  };
}

function mergeGmailConnection(
  connections: Array<{
    id: string;
    provider: string;
    status: string;
    expires_at: string | null;
    metadata: Json;
    connected_by: string | null;
    updated_at: string;
  }>,
  gmail: SettingsConnection,
): SettingsConnection[] {
  return [
    ...connections
      .filter((item) => item.provider !== "gmail")
      .map((item) => ({ ...item, account_email: null })),
    gmail,
  ];
}
