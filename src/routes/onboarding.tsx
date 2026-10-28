import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Wordmark } from "@/components/portal/bits";
import { markLoginBloom } from "@/components/portal/StudioLoader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  validateSearch: z.object({ reset: z.coerce.boolean().optional() }),
  head: () => ({
    meta: [{ title: "Join the Studio — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const router = useRouter();
  const { reset } = Route.useSearch();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || password.length < 8 || password !== confirm) return;
    setBusy(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { error: profileError } = await supabase.rpc("complete_own_profile", {
        p_full_name: fullName.trim(),
      });
      if (profileError) throw profileError;
      markLoginBloom();
      await router.navigate({ to: "/dashboard" });
    } catch {
      toast.error("We couldn't finish setting up your studio access.");
    } finally {
      setBusy(false);
    }
  }

  const ready =
    fullName.trim().length >= 2 &&
    password.length >= 8 &&
    confirm.length >= 8 &&
    password === confirm;

  return (
    <div className="auth-scene auth-scene--pearl">
      <div className="auth-grain" />
      <div className="auth-aura auth-aura--far" />
      <main className="auth-login-only">
        <div className="auth-wordmark">
          <Wordmark tone="ink" />
        </div>
        <section className="auth-panel">
          <div className="auth-panel-shine" />
          <div className="auth-panel-heading">
            <p>{reset ? "Reset access" : "Welcome to the studio"}</p>
          </div>
          <form onSubmit={submit} className="auth-form">
            <label className="auth-field">
              <span>Your name</span>
              <div className="auth-input">
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                />
              </div>
            </label>
            <label className="auth-field">
              <span>New password</span>
              <div className="auth-input">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </label>
            <label className="auth-field">
              <span>Confirm password</span>
              <div className="auth-input">
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </label>
            <button className="auth-submit" type="submit" disabled={!ready || busy}>
              {busy ? "One moment…" : "Enter the studio"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
