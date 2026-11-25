import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { createPublicToken } from "./crypto.server";

type Db = SupabaseClient<Database>;

/** how long an invitation link stays good, until they've joined */
export const INVITE_DAYS = 14;

/**
 * The link in an invitation: the studio's own, good for two weeks and for as many clicks as it
 * takes until they've joined. Opening it signs them in fresh right then, so a slow reply or a mail
 * app that opens links on its own doesn't use it up. A newer invitation replaces the older link.
 */
export async function invitationLink(
  admin: Db,
  input: {
    email: string;
    role: "admin" | "team";
    invitedBy: string;
    origin: string;
    /**
     * whether their account is still to be made: the new account takes its role from an open
     * invitation. left out, the invitation stays as it is
     */
    accepted?: boolean;
  },
) {
  const { token, hash } = createPublicToken();
  const { error } = await admin.from("team_invites").upsert(
    {
      email: input.email.toLowerCase(),
      role: input.role,
      token_hash: hash,
      invited_by: input.invitedBy,
      expires_at: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      ...(input.accepted === undefined
        ? {}
        : { accepted_at: input.accepted ? new Date().toISOString() : null }),
    },
    { onConflict: "email" },
  );
  if (error) throw new Error(`the invitation couldn't be made: ${error.message}`);
  const url = new URL("/auth/callback", input.origin);
  url.searchParams.set("invite", token);
  return url.toString();
}
