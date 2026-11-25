import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EmailOtpType } from "@supabase/supabase-js";

import { Wordmark } from "@/components/portal/bits";
import { markLoginBloom } from "@/components/portal/StudioLoader";
import { supabase } from "@/integrations/supabase/client";
import { afterSignIn } from "@/lib/after-sign-in";
import { openInvitation } from "@/lib/os/invite.functions";

export const Route = createFileRoute("/auth_/callback")({
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
        const invite = query.get("invite");
        let tokenHash = query.get("token_hash") ?? hash.get("token_hash");
        let type = (query.get("type") ?? hash.get("type")) as EmailOtpType | null;

        // an invitation: good until they've joined, it signs them in fresh each time it's opened
        if (invite) {
          setMessage("Opening your invitation…");
          const opened = await openInvitation({ data: { token: invite } });
          if (opened.state === "joined") {
            if (cancelled) return;
            toast("You're already in. Sign in with your email and password.");
            await router.navigate({ to: "/auth" });
            return;
          }
          if (opened.state !== "ready") {
            if (cancelled) return;
            toast.error(
              opened.state === "expired"
                ? "This invitation ran out. Ask Sukii to send it again."
                : "This invitation link isn't good anymore. Open the newest one, or ask Sukii to send it again.",
            );
            await router.navigate({ to: "/auth" });
            return;
          }
          tokenHash = opened.tokenHash;
          type = "email";
        }

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
          .select("id, full_name")
          .eq("id", userData.user.id)
          .eq("active", true)
          .maybeSingle();

        if (profileError || !profile) {
          await supabase.auth.signOut();
          throw new Error("Access denied");
        }

        if (cancelled) return;

        window.history.replaceState({}, "", "/auth/callback");
        // a password reset goes on to choosing the new password
        if (type === "recovery") {
          await router.navigate({ to: "/onboarding", search: { reset: true } });
          return;
        }
        // someone new from an invitation chooses their name and a password first
        if (!profile.full_name) {
          await router.navigate({ to: "/onboarding" });
          return;
        }
        setMessage("Opening the studio…");
        markLoginBloom();
        await router.navigate({ href: afterSignIn(query.get("next")) });
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
