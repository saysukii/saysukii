import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Opening an invitation link. While it's good and they haven't joined, it hands back a sign-in
 * made just now, so the link works whenever they get to it and however many times it's opened.
 * Someone who has joined already is sent to sign in.
 */
export const openInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ token: z.string().trim().min(20).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { hashToken }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./crypto.server"),
    ]);
    const invite = await supabaseAdmin
      .from("team_invites")
      .select("email, expires_at")
      .eq("token_hash", hashToken(data.token))
      .maybeSingle();
    if (!invite.data) return { state: "unknown" as const };
    const email = String(invite.data.email).toLowerCase();
    const profile = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, active")
      .eq("email", email)
      .maybeSingle();
    if (profile.data?.full_name?.trim()) return { state: "joined" as const };
    if (new Date(invite.data.expires_at).getTime() < Date.now()) {
      return { state: "expired" as const };
    }
    if (!profile.data?.active) return { state: "unknown" as const };
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error || !link.properties?.hashed_token) return { state: "unknown" as const };
    return { state: "ready" as const, tokenHash: link.properties.hashed_token };
  });
