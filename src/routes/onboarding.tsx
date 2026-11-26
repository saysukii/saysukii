import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Wordmark } from "@/components/portal/bits";
import { glitter } from "@/components/portal/BookingCelebration";
import { markLoginBloom } from "@/components/portal/StudioLoader";
import { supabase } from "@/integrations/supabase/client";
import { applyPreviewAs, memberToPreview, previewProduction } from "@/lib/preview-production";
import { cn } from "@/lib/utils";

/** how long a screen takes to leave before the next one arrives */
const LEAVE_MS = 260;
/** "enter the studio": long enough for "welcome in" to land before the studio opens */
const DEPART_MS = 1700;
/** the send-off: one big burst of glitter from the middle of the screen, as they enter the studio */
function sprinkle() {
  glitter({
    from: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    count: 380,
    speed: [4, 15],
    size: 1.35,
    ms: 4400,
  });
}

function prefersStill() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const Route = createFileRoute("/onboarding")({
  validateSearch: z.object({
    reset: z.coerce.boolean().optional(),
    /** local only: walk the first visit as a sample member, nothing saved */
    walk: z.coerce.boolean().optional(),
  }),
  head: () => ({
    meta: [{ title: "welcome to the studio · say sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const reset = Boolean(search.reset);
  const walking = import.meta.env.DEV && Boolean(search.walk);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // the welcome is screen -1, then the three questions, 0 to 2
  const [screen, setScreen] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const [back, setBack] = useState(false);
  // the first screen waits for the room to arrive; after that, screens follow each other
  const [first, setFirst] = useState(true);
  // "enter the studio": the whole page leaves before the studio opens
  const [departing, setDeparting] = useState(false);
  const step = Math.max(screen, 0);
  const [busy, setBusy] = useState(false);
  // the warm moments: the wordmark writes itself in, their name is said back,
  // and glitter sees them into the studio
  const given = fullName.trim().split(/\s+/)[0] ?? "";

  // the welcome is shorter than the questions, which keep the same room so the wordmark holds
  // still between them: lifted by half the difference, it sits in the very middle, and glides up
  // into place when they begin
  const stackRef = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const scene = stack?.querySelector<HTMLElement>(".studio-onboard-scene");
    const intro = scene?.querySelector<HTMLElement>(".is-intro-screen");
    if (screen >= 0 || !scene || !intro) {
      setLift(0);
      return;
    }
    const measure = () => setLift(Math.max(0, (scene.offsetHeight - intro.offsetHeight) / 2));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [screen]);

  const nameOk = fullName.trim().length >= 2;
  const passwordOk = password.length >= 8;
  const confirmOk = confirm.length >= 8 && password === confirm;
  const ready = nameOk && passwordOk && confirmOk;

  /** the page lifts away as glitter sees them in, then the studio opens */
  async function depart() {
    setDeparting(true);
    if (prefersStill()) return;
    sprinkle();
    await new Promise((done) => window.setTimeout(done, DEPART_MS));
  }

  async function finish() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      if (walking) {
        // the walk-through: in as a sample member who can sign in and is on a shared
        // production, seeing how we flow and then the tour, fresh
        const member = memberToPreview();
        if (!member) throw new Error("no sample member to walk through as");
        applyPreviewAs(member.id);
        const { id } = previewProduction.forgetFlow();
        localStorage.removeItem(`say-sukii-tour:${id}`);
        await depart();
        markLoginBloom();
        await router.navigate({ to: "/dashboard", search: { as: member.id } as never });
        return;
      }
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { error: profileError } = await supabase.rpc("complete_own_profile", {
        p_full_name: fullName.trim(),
      });
      if (profileError) throw profileError;
      await depart();
      markLoginBloom();
      await router.navigate({ to: "/dashboard" });
    } catch {
      setDeparting(false);
      toast.error("that didn't go through. open the link from your email again.");
    } finally {
      setBusy(false);
    }
  }

  /** the screen leaves, then the next arrives; going back plays it the other way */
  function go(next: number) {
    if (leaving) return;
    const reduced = prefersStill();
    setFirst(false);
    setBack(next < screen);
    if (reduced) {
      setScreen(next);
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setScreen(next);
      setLeaving(false);
    }, LEAVE_MS);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step < 2) {
      if ((step === 0 && nameOk) || (step === 1 && passwordOk)) go(step + 1);
      return;
    }
    void finish();
  }

  const title = reset ? "a new password" : "welcome to the studio";
  const button = busy ? "one moment…" : "enter the studio";

  const nameField = (
    <Field label="your name">
      <input
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        autoComplete="name"
        autoFocus
      />
    </Field>
  );
  const passwordField = (
    <Field label="a password" hint="8 characters or more">
      <Secret value={password} onChange={setPassword} autoFocus />
    </Field>
  );
  const confirmField = (
    <Field
      label="once more"
      hint={confirm.length >= 8 && password !== confirm ? "these don't match yet" : undefined}
    >
      <Secret value={confirm} onChange={setConfirm} autoFocus />
    </Field>
  );

  return (
    <div
      className={cn(
        "studio-pearl studio-onboard-room",
        "is-rise is-moments",
        departing && "is-departing",
      )}
      style={{ "--onboard-step": screen + 1 } as React.CSSProperties}
    >
      <div className="auth-grain" aria-hidden="true" />
      <div className="studio-pearl-aura-far" aria-hidden="true" />
      <div className="studio-pearl-aura-near" aria-hidden="true" />

      <main className="studio-onboard">
        <div
          ref={stackRef}
          className="studio-onboard-stack"
          style={lift ? { transform: `translateY(${lift}px)` } : undefined}
        >
          {/* the mask that writes it in sits on its own wrapper, so safari keeps the ink */}
          <span className="studio-onboard-mark-wrap">
            <Wordmark tone="ink" className="studio-onboard-mark" />
          </span>
          <div
            key={screen}
            className={cn(
              "studio-onboard-scene",
              "is-rise",
              leaving && "is-leaving",
              back && "is-back",
              first && "is-first",
            )}
          >
            {screen < 0 ? (
              <div className="studio-onboard-steps is-intro-screen">
                <h1>
                  <Words text={title} />
                </h1>
                <p className="studio-onboard-ask">three quick steps, then we'll show you around.</p>
                <button
                  type="button"
                  className="studio-today-go studio-onboard-go"
                  onClick={() => go(0)}
                >
                  begin
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="studio-onboard-steps">
                {/* their name, said back to them once they've given it */}
                {step > 0 && given ? (
                  <p className="studio-onboard-hello">
                    thank you for being here, <b>{given}</b>.
                  </p>
                ) : null}
                <h1>
                  <Words
                    text={
                      step === 0
                        ? "what should we call you?"
                        : step === 1
                          ? "choose a password."
                          : "once more, to be sure."
                    }
                  />
                </h1>
                <div className="studio-onboard-fields">
                  {step === 0 ? nameField : step === 1 ? passwordField : confirmField}
                </div>
                <div className="studio-onboard-steps-foot">
                  <span className="studio-onboard-dots" aria-label={`step ${step + 1} of 3`}>
                    {[0, 1, 2].map((dot) => (
                      <i
                        key={dot}
                        className={cn(dot === step && "is-on", dot < step && "is-done")}
                      />
                    ))}
                  </span>
                  <span className="studio-onboard-steps-actions">
                    <button
                      type="button"
                      className="studio-onboard-back"
                      onClick={() => go(screen - 1)}
                    >
                      back
                    </button>
                    <button
                      className="studio-today-go studio-onboard-go"
                      disabled={
                        busy ||
                        (step === 0 && !nameOk) ||
                        (step === 1 && !passwordOk) ||
                        (step === 2 && !ready)
                      }
                    >
                      {step < 2 ? "next" : button}
                    </button>
                  </span>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* "enter the studio": a welcome, by name, as the page lifts away */}
      {departing ? (
        <p className="studio-onboard-welcome-in" aria-hidden="true">
          <Words text={given ? `welcome in, ${given}.` : "welcome in."} />
        </p>
      ) : null}

      {walking ? (
        <p className="studio-onboard-looks">
          <small>walk-through · nothing is saved</small>
        </p>
      ) : null}
    </div>
  );
}

/** a line, word by word, so "bloom" can bring the words in one after another */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, index, all) => (
        <span
          key={index}
          className="studio-onboard-word"
          style={{ "--w": index } as React.CSSProperties}
        >
          {word}
          {index < all.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function Secret({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className="studio-onboard-secret">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        autoFocus={autoFocus}
      />
      <button
        type="button"
        aria-label={shown ? "hide password" : "show password"}
        aria-pressed={shown}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShown((value) => !value)}
      >
        {shown ? <EyeOff strokeWidth={1.5} /> : <Eye strokeWidth={1.5} />}
      </button>
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="studio-onboard-field">
      <span className="studio-onboard-label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
