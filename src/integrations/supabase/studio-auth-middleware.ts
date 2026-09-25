import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./auth-middleware";
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

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireStudioAuth])
  .server(async ({ context, next }) => {
    if (context.profile.role !== "admin") {
      throw new Error("Forbidden: Admin access is required");
    }
    return next();
  });
