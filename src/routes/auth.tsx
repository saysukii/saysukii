import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/portal/bits";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Say Sukii OS" },
      {
        name: "description",
        content:
          "Private sign-in for the Say Sukii studio portal: proposals, agreements, invoices, and production.",
      },
      { property: "og:title", content: "say sukii" },
      { property: "og:site_name", content: "say sukii" },
      {
        property: "og:description",
        content: "Private sign-in for the Say Sukii floral studio operating system.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", data.user.id)
        .eq("active", true)
        .maybeSingle();
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error("Access denied");
      }
      await router.navigate({ to: "/dashboard" });
    } catch {
      toast.error("This account does not have access to the studio.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setBusy(false);
      toast.error("This Google account does not have access to the studio.");
    }
  }

  async function magicLink() {
    if (import.meta.env.DEV) return;
    if (!email.trim()) return;
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (error) throw error;
      toast.success("Your studio link is on its way.");
    } catch {
      toast.error("We couldn't send that link. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      toast("Enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/onboarding?reset=1`,
    });
    if (error) {
      toast.error("We couldn't send the reset email.");
      return;
    }
    toast.success("Password reset sent.");
  }

  return (
    <div className="auth-scene auth-scene--pearl auth-scene--login">
      <div className="auth-grain" />
      <div className="auth-aura auth-aura--far" />
      <div className="auth-aura auth-aura--near">
        <span className="auth-orbit auth-orbit--one" />
        <span className="auth-orbit auth-orbit--two" />
        <span className="auth-petal auth-petal--one" />
        <span className="auth-petal auth-petal--two" />
        <span className="auth-petal auth-petal--three" />
      </div>

      <main className="auth-login-only">
        <div className="auth-wordmark">
          <Wordmark tone="ink" />
        </div>

        <section className="auth-panel">
          <div className="auth-panel-shine" />
          <form onSubmit={submit} className="auth-form" noValidate>
            <label className="auth-field">
              <span>Email address</span>
              <div className="auth-input">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@saysukii.com"
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button type="button" onClick={resetPassword} className="auth-text-action">
              Forgot password?
            </button>

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="auth-submit"
            >
              <span>{busy ? "Opening studio…" : "Enter the studio"}</span>
              <i>
                <ArrowRight size={16} />
              </i>
            </button>

            <div className="auth-divider">
              <span />
              or
              <span />
            </div>

            <button
              type="button"
              onClick={magicLink}
              disabled={busy || (!import.meta.env.DEV && !email.trim())}
              className="auth-google"
            >
              <Sparkles size={15} aria-hidden="true" />
              Email me a magic link
            </button>

            <button type="button" onClick={google} disabled={busy} className="auth-google">
              <GoogleMark />
              Continue with Google
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.72-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z"
      />
      <path
        fill="currentColor"
        opacity=".76"
        d="M12 22c2.7 0 4.98-.9 6.64-2.35L15.4 17.1c-.9.6-2.04.97-3.39.97-2.6 0-4.82-1.76-5.61-4.13H3.05v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        opacity=".52"
        d="M6.4 13.94A6 6 0 0 1 6.08 12c0-.68.12-1.33.32-1.94v-2.6H3.05A10 10 0 0 0 2 12c0 1.63.38 3.17 1.05 4.54l3.35-2.6Z"
      />
      <path
        fill="currentColor"
        opacity=".88"
        d="M12 5.93c1.47 0 2.79.5 3.83 1.5l2.88-2.87A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.95 5.46l3.35 2.6A5.98 5.98 0 0 1 12 5.93Z"
      />
    </svg>
  );
}
