import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EmailOtpType } from "@supabase/supabase-js";

import { Wordmark } from "@/components/portal/bits";
import { markLoginBloom } from "@/components/portal/StudioLoader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Signing In — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Confirming your studio link…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      try {
        const code = query.get("code");
        const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
        const type = (query.get("type") ?? hash.get("type")) as EmailOtpType | null;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
        } else if (hash.get("access_token")) {
          const { error } = await supabase.auth.getSession();
          if (error) throw error;
        } else {
          throw new Error("Missing sign-in credentials");
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw userError ?? new Error("No session");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userData.user.id)
          .eq("active", true)
          .maybeSingle();

        if (profileError || !profile) {
          await supabase.auth.signOut();
          throw new Error("Access denied");
        }

        if (cancelled) return;

        window.history.replaceState({}, "", "/auth/callback");
        setMessage("Opening the studio…");
        markLoginBloom();
        await router.navigate({ to: "/dashboard" });
      } catch {
        if (cancelled) return;
        toast.error("This sign-in link is invalid or expired.");
        await router.navigate({ to: "/auth" });
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="auth-scene auth-scene--pearl auth-scene--login">
      <div className="auth-grain" />
      <div className="auth-aura auth-aura--far" />
      <main className="auth-login-only">
        <div className="auth-wordmark">
          <Wordmark tone="ink" />
        </div>
        <section className="auth-panel">
          <div className="auth-panel-shine" />
          <p className="auth-panel-heading">{message}</p>
        </section>
      </main>
    </div>
  );
}
