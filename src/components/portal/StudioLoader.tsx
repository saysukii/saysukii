import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/portal/bits";

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

export function markLoginBloom() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOGIN_BLOOM, "1");
}

export function takeLoginBloom() {
  if (typeof window === "undefined") return false;
  const armed = window.sessionStorage.getItem(LOGIN_BLOOM) === "1";
  if (armed) window.sessionStorage.removeItem(LOGIN_BLOOM);
  return armed;
}

export function BloomPass({ play }: { play: number }) {
  const [phase, setPhase] = useState<"on" | "out" | "off">("off");

  useEffect(() => {
    if (!play) return;
    setPhase("on");
    const out = window.setTimeout(() => setPhase("out"), 900);
    return () => window.clearTimeout(out);
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
        <Wordmark />
        <span className="is-playing">
          <StudioLoader kind="bloom" />
        </span>
      </div>
    </div>
  );
}
