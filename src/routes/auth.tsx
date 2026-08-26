import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Wordmark } from "@/components/portal/bits";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Studio Sign In — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Private sign-in for the Say Sukii studio portal: proposals, agreements, invoices, and production.",
      },
      { property: "og:title", content: "Studio Sign In — Say Sukii Portal" },
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
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(value: string) {
    if (!value.trim()) return "Email is required";
    if (!emailRegex.test(value.trim())) return "Please enter a valid email address";
    return null;
  }

  function validatePassword(value: string) {
    if (!value) return "Password is required";
    if (value.length < 8) return "Password must be at least 8 characters";
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await router.navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    await router.navigate({ to: "/dashboard" });
  }

  return (
    <div
      className="flex h-screen items-center justify-center overflow-hidden px-6"
      style={{ backgroundColor: "#FCFCFC" }}
    >

      <div className="relative z-10 flex h-full max-h-[844px] w-full max-w-[400px] flex-col px-6 py-12 sm:px-10">
        <div className="flex-1" />

        <div className="mb-10 sm:mb-14">
          <Wordmark className="block w-32" />
        </div>

        <form onSubmit={submit} className="w-full space-y-10">
          <div className="space-y-8">
            {/* Email */}
            <label className="group flex flex-col space-y-3">
              <span
                className={cn(
                  "ml-0.5 text-[9px] font-bold uppercase tracking-[0.25em] transition-colors",
                  emailError ? "text-destructive" : "text-muted-foreground/70",
                )}
              >
                Email Address
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(validateEmail(event.target.value));
                }}
                onBlur={(event) => setEmailError(validateEmail(event.target.value))}
                placeholder="studio@saysukii.com"
                className={cn(
                  "w-full border-b bg-transparent px-0.5 py-2 text-xs text-foreground outline-none transition-all placeholder:text-foreground/25",
                  emailError ? "border-destructive" : "border-border focus:border-foreground/60",
                )}
              />
              {emailError ? (
                <span className="text-[10px] leading-tight text-destructive">{emailError}</span>
              ) : null}
            </label>

            {/* Password */}
            <label className="group flex flex-col space-y-3">
              <span
                className={cn(
                  "ml-0.5 text-[9px] font-bold uppercase tracking-[0.25em] transition-colors",
                  passwordError ? "text-destructive" : "text-muted-foreground/70",
                )}
              >
                Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError(validatePassword(event.target.value));
                  }}
                  onBlur={(event) => setPasswordError(validatePassword(event.target.value))}
                  placeholder="••••••••"
                  className={cn(
                    "w-full border-b bg-transparent px-0.5 py-2 pr-12 text-xs text-foreground outline-none transition-all placeholder:text-foreground/25",
                    passwordError ? "border-destructive" : "border-border focus:border-foreground/60",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute bottom-2 right-0 text-[9px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {passwordError ? (
                <span className="text-[10px] leading-tight text-destructive">{passwordError}</span>
              ) : null}
            </label>
          </div>

          <div className="flex items-center justify-between px-0.5">
            <label className="flex cursor-pointer items-center gap-2.5">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <span className="text-[10px] uppercase tracking-tight text-muted-foreground">
                Remember me
              </span>
            </label>
          </div>

          <div className="space-y-4 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="liquid-glass liquid-glass-rose flex w-full items-center justify-center rounded-3xl py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "One moment" : "Enter Studio"}
            </button>

            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="liquid-glass liquid-glass-peri flex w-full items-center justify-center gap-3 rounded-3xl py-4 text-[11px] font-medium uppercase tracking-wider text-foreground transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </button>
          </div>
        </form>

        <div className="flex-1" />
      </div>
    </div>
  );
}


function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
