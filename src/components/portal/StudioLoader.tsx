import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useState } from "react";

export const STUDIO_LOADERS = ["bloom", "page", "line", "dots", "veil", "ring"] as const;

export type StudioLoaderKind = (typeof STUDIO_LOADERS)[number];

export function StudioLoader({ kind, waiting = false }: { kind: StudioLoaderKind; waiting?: boolean }) {
  const className = cn("studio-loader", `is-${kind}`, waiting && "is-waiting");
  if (kind === "bloom") {
    return (
      <span className={className} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (kind === "dots") {
    return (
      <span className={className} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (kind === "ring") {
    return (
      <span className={className} aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="16" />
        </svg>
      </span>
    );
  }
  return <span className={className} aria-hidden="true" />;
}

export function BloomWait({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={compact ? "studio-bloom-wait is-compact" : "studio-bloom-wait studio-home"} role="status">
      <span className="sr-only">{label}</span>
      <StudioLoader kind="bloom" waiting />
    </div>
  );
}

const LOGIN_BLOOM = "say-sukii-bloom-login";
const bloomWaiters = new Set<() => void>();

export function markLoginBloom() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOGIN_BLOOM, "1");
}

export function loginBloomArmed() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(LOGIN_BLOOM) === "1";
}

export function releaseLoginBloom() {
  if (typeof document === "undefined") return;
  window.sessionStorage.removeItem(LOGIN_BLOOM);
  document.getElementById("studio-login-bloom")?.remove();
  for (const waiter of bloomWaiters) waiter();
}

function onLoginBloomRelease(waiter: () => void) {
  bloomWaiters.add(waiter);
  return () => {
    bloomWaiters.delete(waiter);
  };
}

export function BloomPass({ play }: { play: number }) {
  const [phase, setPhase] = useState<"on" | "out" | "off">(play ? "on" : "off");

  useLayoutEffect(() => {
    if (!play) return;
    document.getElementById("studio-login-bloom")?.remove();
  }, [play]);

  useEffect(() => {
    if (!play) return;
    const started = Date.now();
    setPhase("on");
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPhase("out"), Math.max(0, 2800 - (Date.now() - started)));
    };
    const stop = onLoginBloomRelease(finish);
    const cap = window.setTimeout(() => releaseLoginBloom(), 7000);
    return () => {
      stop();
      window.clearTimeout(cap);
      window.clearTimeout(timer);
    };
  }, [play]);

  useEffect(() => {
    if (phase !== "out") return;
    const off = window.setTimeout(() => setPhase("off"), 480);
    return () => window.clearTimeout(off);
  }, [phase]);

  if (phase === "off") return null;
  return (
    <div className={phase === "out" ? "studio-bloom-pass is-out" : "studio-bloom-pass"} role="status" aria-label="opening the studio">
      <div className="studio-bloom-mark">
        <span className="is-playing">
          <StudioLoader kind="bloom" />
        </span>
      </div>
    </div>
  );
}
