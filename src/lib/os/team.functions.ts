import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAccess } from "@/integrations/supabase/studio-auth-middleware";
import { cleanAccess, hasAccess } from "@/lib/os/access";

/**
 * The gang: everyone with an account, active or not, everyone invited who hasn't joined
 * yet, and the productions each member is on that haven't ended.
 */
export const listTeamDirectory = createServerFn({ method: "GET" })
  .middleware([requireAccess("gang")])
  .handler(async ({ context }) => {
    const [{ supabaseAdmin }, { memberProductions }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./production.server"),
    ]);
    const [members, invites] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, full_name, added_name, invited_at, email, role, active, is_owner, access, created_at, last_seen_at",
        )
        .order("full_name", { nullsFirst: false }),
      supabaseAdmin
        .from("team_invites")
        .select("id, email, role, expires_at, accepted_at, created_at")
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
    ]);
    // what people are paid is set on each production now, not here
    const canPay = hasAccess(context.profile, "pay");
    if (members.error) throw new Error(members.error.message);
    if (invites.error) throw new Error(invites.error.message);

    // someone added or invited has an account; until they choose a name, they haven't joined
    const joining = (members.data ?? []).filter((member) => !member.full_name && member.active);
    // the productions each of them is already on, so the studio sees who's waiting on a share
    const crew = joining.length
      ? await supabaseAdmin
          .from("production_people")
          .select("profile_id, productions(project_name)")
          .in(
            "profile_id",
            joining.map((member) => member.id),
          )
      : { data: [] };
    const onOf = (id: string) =>
      (crew.data ?? [])
        .filter((row) => row.profile_id === id)
        .map((row) => {
          const production = row.productions as { project_name?: string } | null;
          return production?.project_name ?? "";
        })
        .filter(Boolean);
    const joined = new Set((members.data ?? []).map((member) => member.email.toLowerCase()));
    const withEvents = await Promise.all(
      (members.data ?? [])
        .filter((member) => !joining.includes(member))
        .map(async (member) => ({
          ...member,
          events: (await memberProductions(supabaseAdmin, member.id)).map((production) => ({
            project_name: production.project_name,
            path: production.path,
            first: production.first,
          })),
        })),
    );
    return {
      me: context.profile.id,
      owner: Boolean(context.profile.is_owner),
      canPay,
      members: withEvents,
      // an invitation someone already accepted through another link isn't pending anymore
      invites: [
        ...joining.map((member) => ({
          id: member.id,
          email: member.email,
          name: member.added_name ?? null,
          role: member.role,
          expires_at: null as string | null,
          accepted_at: null,
          created_at: member.created_at,
          invited_at: member.invited_at ?? null,
          on: onOf(member.id),
        })),
        ...(invites.data ?? [])
          .filter((invite) => !joined.has(invite.email.toLowerCase()))
          .map((invite) => ({
            ...invite,
            name: null as string | null,
            invited_at: invite.created_at as string | null,
            on: [] as string[],
          })),
      ],
    };
  });

/**
 * Add someone to the team without inviting them yet: their account is made quietly, so the studio
 * can put them on productions and the schedule. Nothing is emailed; they're invited when a
 * production they're on is shared, or from the directory. They can't sign in until then.
 */
export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireAccess("gang")])
  .validator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(320),
        name: z.string().trim().min(1).max(120),
        role: z.enum(["admin", "team"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { createPublicToken }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./crypto.server"),
    ]);
    if (data.role === "admin" && !context.profile.is_owner) {
      throw new Error("only sukii can add an admin.");
    }
    const email = data.email.toLowerCase();
    const existing = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing.data) throw new Error("that email is already on the team.");

    // the invitation row gives the new account its role as it's made
    const { hash } = createPublicToken();
    const { error: inviteError } = await supabaseAdmin.from("team_invites").upsert(
      {
        email,
        role: data.role,
        token_hash: hash,
        invited_by: context.profile.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
      },
      { onConflict: "email" },
    );
    if (inviteError) throw new Error(inviteError.message);
    // no email goes out: the account waits, unconfirmed by them, until they're invited
    const { data: made, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { role: data.role },
    });
    if (error || !made.user) throw new Error(error?.message ?? "they couldn't be added.");
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ added_name: data.name, invited_at: null, active: true })
      .eq("id", made.user.id);
    if (profileError) throw new Error(profileError.message);
    return { id: made.user.id };
  });

/** Turn a member's account back on, for a freelancer coming back for another event. */
export const activateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireAccess("gang")])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ active: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

/**
 * Take back an invitation. Someone whose account was made by it but who never joined is turned off,
 * so the link in their email stops working; an older invitation is simply removed.
 */
export const cancelTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireAccess("gang")])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", data.id)
      .maybeSingle();
    if (member) {
      if (member.full_name) throw new Error("they've already joined. turn them off instead.");
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ active: false })
        .eq("id", member.id);
      if (error) throw new Error(error.message);
      // they never joined, so nothing of theirs stays on a production
      await Promise.all([
        supabaseAdmin.from("production_shifts").delete().eq("profile_id", member.id),
        supabaseAdmin.from("production_task_people").delete().eq("profile_id", member.id),
        supabaseAdmin.from("production_people").delete().eq("profile_id", member.id),
      ]);
      await supabaseAdmin.from("team_invites").delete().eq("email", member.email);
      return { id: data.id };
    }
    const { error } = await supabaseAdmin
      .from("team_invites")
      .delete()
      .eq("id", data.id)
      .is("accepted_at", null);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

/**
 * Change someone on the team: their name, and what they can see. Their email
 * can change only while they're added and not invited yet, since an invitation went to the old one.
 */
export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireAccess("gang")])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(320).optional(),
        role: z.enum(["admin", "team"]),
        access: z.array(z.string()).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, invited_at, role, is_owner, access")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!member) throw new Error("they're not on the team anymore.");
    const owner = Boolean(context.profile.is_owner);
    if (member.is_owner && member.id !== context.profile.id) {
      throw new Error("only sukii can change sukii.");
    }
    if (member.id === context.profile.id && data.role !== member.role) {
      throw new Error("you can't change your own access.");
    }
    // roles, and what each admin can open, are the founder's to decide
    if (!owner && data.role !== member.role)
      throw new Error("only sukii can change someone's role.");
    const access = data.access ? cleanAccess(data.access) : null;
    if (access && !owner) throw new Error("only sukii can change what someone can open.");
    const joined = Boolean(member.full_name?.trim());
    const patch: {
      role: typeof data.role;
      full_name?: string;
      added_name?: string;
      email?: string;
      access?: string[];
    } = {
      role: data.role,
      ...(access && !member.is_owner ? { access } : {}),
    };
    // a name they chose is theirs; until they join, it's the one the studio added them under
    if (joined) patch.full_name = data.name;
    else patch.added_name = data.name;

    const email = data.email?.toLowerCase();
    if (email && email !== member.email.toLowerCase()) {
      if (joined || member.invited_at) {
        throw new Error("their email can only change before they're invited.");
      }
      const taken = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (taken.data) throw new Error("that email is already on the team.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(member.id, {
        email,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      patch.email = email;
    }
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", member.id);
    if (error) throw new Error(error.message);
    return { id: member.id };
  });
