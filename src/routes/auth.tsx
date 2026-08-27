import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";


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
  
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Multi-layer cursor parallax: deeper layers drift slowly, surface accents drift faster.
  const auraDeepRef = useRef<HTMLDivElement>(null);
  const auraMainRef = useRef<HTMLDivElement>(null);
  const auraHazeRef = useRef<HTMLDivElement>(null);
  const auraSoftRef = useRef<HTMLDivElement>(null);
  const auraBloomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = { x: 0, y: 0 };
    const deep = { x: 0, y: 0 };
    const main = { x: 0, y: 0 };
    const haze = { x: 0, y: 0 };
    const soft = { x: 0, y: 0 };
    const bloom = { x: 0, y: 0 };
    let raf = 0;

    const onMove = (event: PointerEvent) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const tick = () => {
      // deeper / heavier = slower, closer / smaller = quicker
      deep.x += (target.x - deep.x) * 0.015;
      deep.y += (target.y - deep.y) * 0.015;
      main.x += (target.x - main.x) * 0.035;
      main.y += (target.y - main.y) * 0.035;
      haze.x += (target.x - haze.x) * 0.025;
      haze.y += (target.y - haze.y) * 0.025;
      soft.x += (target.x - soft.x) * 0.06;
      soft.y += (target.y - soft.y) * 0.06;
      bloom.x += (target.x - bloom.x) * 0.085;
      bloom.y += (target.y - bloom.y) * 0.085;

      if (auraDeepRef.current) {
        auraDeepRef.current.style.transform = `translate3d(${deep.x * 4}vw, ${deep.y * 3}vh, 0) scale(${1 + Math.abs(deep.x) * 0.04})`;
      }
      if (auraMainRef.current) {
        auraMainRef.current.style.transform = `translate3d(${main.x * 8}vw, ${main.y * 6}vh, 0) scale(${1 + Math.abs(main.x) * 0.06})`;
      }
      if (auraHazeRef.current) {
        auraHazeRef.current.style.transform = `translate3d(${haze.x * 10}vw, ${haze.y * 7}vh, 0)`;
      }
      if (auraSoftRef.current) {
        auraSoftRef.current.style.transform = `translate3d(${soft.x * 16}vw, ${soft.y * 12}vh, 0)`;
      }
      if (auraBloomRef.current) {
        auraBloomRef.current.style.transform = `translate3d(${bloom.x * 22}vw, ${bloom.y * 16}vh, 0) scale(${1 + bloom.y * 0.08})`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

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
      className="relative flex h-screen items-center justify-center overflow-hidden px-6"
      style={{ background: "linear-gradient(160deg, #FCFCFC 0%, #F8F7FF 52%, #FDF2F8 100%)" }}
    >
      {/* multi-layer aura field — deeper layers move slower, lighter accents move faster */}
      <div
        ref={auraDeepRef}
        className="pointer-events-none absolute -left-[18vw] -bottom-[28vh] -z-20 h-[110vh] w-[110vh] rounded-full will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 38% 38%, rgba(244, 114, 182, 0.55) 0%, rgba(196, 181, 253, 0.38) 30%, rgba(224, 231, 255, 0.22) 56%, transparent 82%)",
          filter: "blur(28px)",
        }}
      />
      <div
        ref={auraMainRef}
        className="pointer-events-none absolute -left-[10vw] -bottom-[16vh] -z-10 h-[84vh] w-[84vh] rounded-full will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 42% 42%, rgba(236, 72, 133, 0.95) 0%, rgba(168, 85, 247, 0.78) 26%, rgba(165, 180, 252, 0.48) 54%, transparent 80%)",
          filter: "blur(16px)",
        }}
      />
      <div
        ref={auraHazeRef}
        className="pointer-events-none absolute right-[2vw] top-[8vh] -z-10 h-[42vh] w-[42vh] rounded-full will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 40% 40%, rgba(199, 210, 254, 0.5) 0%, rgba(224, 231, 255, 0.3) 44%, transparent 78%)",
          filter: "blur(24px)",
        }}
      />
      <div
        ref={auraSoftRef}
        className="pointer-events-none absolute left-[6vw] bottom-[6vh] -z-10 h-[34vh] w-[34vh] rounded-full will-change-transform"
        style={{
          background: "radial-gradient(circle at center, rgba(255, 228, 230, 0.65) 0%, transparent 64%)",
          filter: "blur(20px)",
        }}
      />
      <div
        ref={auraBloomRef}
        className="pointer-events-none absolute left-[14vw] bottom-[18vh] -z-10 h-[18vh] w-[18vh] rounded-full will-change-transform"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(251, 113, 133, 0.62) 0%, rgba(244, 114, 182, 0.32) 45%, transparent 72%)",
          filter: "blur(10px)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center justify-center px-6 sm:px-10">
        <div className="mb-5">
          <Wordmark className="block w-32" />
        </div>

        <form onSubmit={submit} className="w-full space-y-8">
          <div className="space-y-6">
            {/* Email */}
            <label className="group flex flex-col space-y-3">
              <span
                className={cn(
                  "ml-0.5 text-[9px] font-bold uppercase tracking-[0.25em] transition-colors",
                  emailError ? "text-destructive" : "text-foreground",
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
                placeholder="you@saysukii.com"
                className={cn(
                  "w-full border-b bg-transparent px-0.5 py-2 text-xs text-foreground outline-none transition-all placeholder:text-foreground/25",
                  emailError ? "border-destructive" : "border-foreground/40 focus:border-foreground",
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
                  passwordError ? "text-destructive" : "text-foreground",
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
                  passwordError ? "border-destructive" : "border-foreground/40 focus:border-foreground",
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


          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-lg border border-foreground/10 bg-[#FAFAF8] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-[11px] font-light uppercase tracking-[0.12em] text-foreground transition-colors hover:text-foreground/60 disabled:pointer-events-none disabled:opacity-50"
              >
                {busy ? "One moment" : "Enter Studio"}
              </button>

              <div className="h-3.5 w-px bg-foreground/10" />

              <button
                type="button"
                onClick={google}
                disabled={busy}
                aria-label="Continue with Google"
                className="flex items-center justify-center px-3 py-2 text-foreground/70 transition-colors hover:text-foreground/50 disabled:pointer-events-none disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

