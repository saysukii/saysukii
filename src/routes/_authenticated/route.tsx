import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Shell } from "@/components/portal/Shell";
import {
  DEV_PREVIEW_PROFILE,
  DEV_PREVIEW_USER,
  isDevPreviewEnabled,
} from "@/lib/dev-preview";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (isDevPreviewEnabled()) {
      return {
        user: DEV_PREVIEW_USER,
        profile: DEV_PREVIEW_PROFILE,
        devPreview: true as const,
      };
    }

    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .eq("active", true)
        .maybeSingle();
      if (!profileError && profile) {
        return { user: data.user, profile, devPreview: false as const };
      }
    }

    if (data.user) await supabase.auth.signOut();
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});
