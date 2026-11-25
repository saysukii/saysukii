import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireAdmin,
  requireStudioAuth,
  requireAccess,
} from "@/integrations/supabase/studio-auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const roleSchema = z.enum(["admin", "team"]);
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: roleSchema,
});
const memberSchema = z.object({ id: z.string().uuid() });
const granolaKeySchema = z.object({ apiKey: z.string().trim().min(1).max(500) });

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
    const { readGranolaConnection, supabaseGranolaVault } = await import("./granola.server");

    return {
      connections: mergeGmailConnection(connections.data ?? [], gmail),
      granola: await readGranolaConnection(supabaseGranolaVault()),
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

/**
 * An invitation into the studio, in the studio's own letter from its gmail. Someone already invited
 * who hasn't joined yet gets a fresh link; someone who has joined can't be invited again.
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireAccess("gang")])
  .validator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = data.email.toLowerCase();
    const [
      { supabaseAdmin },
      { invitationLink },
      { getRequest },
      { teamInviteHtml },
      { sendStudioEmail },
    ] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./invite-link.server"),
      import("@tanstack/react-start/server"),
      import("./production-email"),
      import("./email.server"),
    ]);

    const { data: existingMember, error: memberError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, added_name")
      .eq("email", email)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    // a name means they've joined; without one, they were invited and never finished
    if (existingMember?.full_name)
      throw new Error("That email already belongs to a studio member.");

    const request = getRequest();
    const origin = (
      process.env["APP_URL"]?.replace(/\/$/, "") ?? new URL(request.url).origin
    ).replace(/\/$/, "");
    // the invitation and its link: good for two weeks, however many times it's opened, until they join
    const link = await invitationLink(supabaseAdmin, {
      email,
      role: data.role,
      invitedBy: context.profile.id,
      origin,
      accepted: Boolean(existingMember),
    });
    if (existingMember) {
      // sending again turns a taken-back invitation back on
      await supabaseAdmin
        .from("profiles")
        .update({ active: true, role: data.role })
        .eq("id", existingMember.id);
    } else {
      // a first invitation makes their account, quietly; the link signs them in to finish it
      const { error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: data.role },
      });
      if (userError) throw new Error(`The invitation could not be made: ${userError.message}`);
    }

    const sent = await sendStudioEmail({
      to: email,
      subject: "you're invited to the say sukii studio",
      eventType: "team_invite",
      referenceType: "team_invite",
      html: teamInviteHtml({
        link,
        role: data.role,
        invitedBy: context.profile.full_name,
        // the name sukii added them under, for "hi cara,"
        given: existingMember?.added_name ?? null,
      }),
    });
    if (sent.skipped) {
      throw new Error(
        "the invitation didn't go out: connect the studio's gmail in settings, then send it again.",
      );
    }
    await supabaseAdmin
      .from("profiles")
      .update({ invited_at: new Date().toISOString() })
      .eq("email", email)
      .is("full_name", null);
    return { email, role: data.role };
  });

const profileNameSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
});

/** Agree to how we flow, the gang's terms: the version they read, and when. */
/** The tour of today is done, or skipped: it never shows again, on any device. */
export const finishTodayTour = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ tour_seen_at: at })
      .eq("id", context.profile.id)
      .is("tour_seen_at", null);
    if (error) throw new Error(error.message);
    return { tour_seen_at: at };
  });

export const agreeToHowWeFlow = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ version: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { FLOW_VERSION } = await import("./how-we-flow");
    if (data.version !== FLOW_VERSION) throw new Error("how we flow has changed. read it again.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ flow_version: data.version, flow_agreed_at: at })
      .eq("id", context.profile.id);
    if (error) throw new Error(error.message);
    return { version: data.version, agreed_at: at };
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
  .middleware([requireAccess("gang")])
  .validator((input: unknown) => memberSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.id === context.profile.id) {
      throw new Error("You cannot deactivate your own account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error: memberError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active, is_owner")
      .eq("id", data.id)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Studio member not found.");
    if (member.is_owner) throw new Error("sukii can't be turned off.");
    // turning off another admin is the founder's call
    if (member.role === "admin" && !context.profile.is_owner) {
      throw new Error("only sukii can turn off an admin.");
    }
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
  .middleware([requireAccess("settings")])
  .handler(async ({ context }) => ({
    redirectTo: await createOAuthRedirect("square", context.profile.id),
  }));

export const beginGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireAccess("settings")])
  .handler(async ({ context }) => ({
    redirectTo: await createOAuthRedirect("google", context.profile.id),
  }));

export const connectGranola = createServerFn({ method: "POST" })
  .middleware([requireAccess("settings")])
  .validator((input: unknown) => granolaKeySchema.parse(input))
  .handler(async ({ data }) => {
    const { connectGranolaKey, supabaseGranolaVault } = await import("./granola.server");
    return connectGranolaKey(data.apiKey, { vault: supabaseGranolaVault() });
  });

export const disconnectGranola = createServerFn({ method: "POST" })
  .middleware([requireAccess("settings")])
  .handler(async () => {
    const { disconnectGranolaKey, supabaseGranolaVault } = await import("./granola.server");
    return disconnectGranolaKey({ vault: supabaseGranolaVault() });
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireAccess("settings")])
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
  .middleware([requireAccess("settings")])
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
  .middleware([requireAccess("settings")])
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
  .middleware([requireAccess("settings")])
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
