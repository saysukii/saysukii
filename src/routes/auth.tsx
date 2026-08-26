import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Aura, Wordmark, Field, inputClass, SoftButton } from "@/components/portal/bits";

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
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <Aura />
      <div className="glass w-full max-w-sm rounded-[2rem] p-8">
        <Wordmark className="max-w-[7.5rem]" />
        <h1 className="mt-8 text-2xl font-light tracking-tight">Welcome</h1>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="info@saysukii.com"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <SoftButton type="submit" variant="primary" disabled={busy} className="w-full py-3">
            {busy ? "One moment" : "Enter the studio"}
          </SoftButton>
        </form>

        <div className="my-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <SoftButton onClick={google} className="w-full py-3">
          Continue with Google
        </SoftButton>
      </div>
    </div>
  );
}
