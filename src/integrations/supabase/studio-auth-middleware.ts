import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./auth-middleware";
import { hasAccess, type StudioArea } from "@/lib/os/access";

import type { ProfileRow } from "./types";

export const requireStudioAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .eq("active", true)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Unauthorized: An active studio membership is required");
    }

    return next({ context: { profile: data as ProfileRow } });
  });

/**
 * An admin who's been given one of these areas: the founder always is. The other admins have what the
 * founder has given them.
 */
export function requireAccess(...areas: StudioArea[]) {
  return createMiddleware({ type: "function" })
    .middleware([requireStudioAuth])
    .server(async ({ context, next }) => {
      // any one of the areas will do: a page shared by two areas opens for either
      if (!areas.some((area) => hasAccess(context.profile, area))) {
        throw new Error("that's not open to you. ask sukii for access.");
      }
      return next();
    });
}

/** the founder alone: roles, and what each admin can open */
export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireStudioAuth])
  .server(async ({ context, next }) => {
    if (context.profile.role !== "admin" || !context.profile.is_owner) {
      throw new Error("only sukii can do that.");
    }
    return next();
  });

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireStudioAuth])
  .server(async ({ context, next }) => {
    if (context.profile.role !== "admin") {
      throw new Error("Forbidden: Admin access is required");
    }
    return next();
  });
