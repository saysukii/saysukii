import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import blackLogo from "@/assets/say-sukii-black.png.asset.json";

export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={blackLogo.url}
      alt="Say Sukii"
      className={cn("h-auto w-full select-none object-contain", className)}
    />
  );
}

export function Ground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div className="dotted-ground absolute inset-0 opacity-70" />
      <div className="absolute -left-40 -top-32 size-[34rem] rounded-full bg-petal/50 blur-3xl" />
      <div className="absolute -right-32 top-1/3 size-[30rem] rounded-full bg-rose/30 blur-3xl" />
      <div className="absolute bottom-[-12rem] left-1/3 size-[32rem] rounded-full bg-secondary/70 blur-3xl" />
    </div>
  );
}

/** Soft blurred aura background: one full flower with stem, centered and calm. */
export function Aura() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-surface-alt" />
      <div className="absolute inset-0 flex justify-center">
        <svg
          className="h-full w-[min(30rem,84vw)] animate-[aura-drift_30s_ease-in-out_infinite_alternate]"
          viewBox="0 0 400 1400"
          preserveAspectRatio="xMidYMin meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="auraSoft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" />
            </filter>
            <filter id="auraStem" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            </filter>
            <linearGradient id="petalFill" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--bloom)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--rose)" stopOpacity="0.55" />
            </linearGradient>
            <radialGradient id="haze" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--petal)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--petal)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* soft halo */}
          <circle cx="200" cy="235" r="215" fill="url(#haze)" />

          {/* stem */}
          <path
            d="M200 250 Q194 560 200 860 T202 1400"
            stroke="var(--rose)"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
            opacity="0.3"
            filter="url(#auraStem)"
          />
          {/* leaves */}
          <ellipse
            cx="258"
            cy="560"
            rx="70"
            ry="20"
            fill="var(--rose)"
            opacity="0.24"
            transform="rotate(-38 258 560)"
            filter="url(#auraSoft)"
          />
          <ellipse
            cx="142"
            cy="760"
            rx="58"
            ry="17"
            fill="var(--petal)"
            opacity="0.22"
            transform="rotate(36 142 760)"
            filter="url(#auraSoft)"
          />

          {/* bloom */}
          <g filter="url(#auraSoft)" opacity="0.8">
            {[0, 72, 144, 216, 288].map((angle) => (
              <ellipse
                key={angle}
                cx="0"
                cy="-88"
                rx="44"
                ry="94"
                fill="url(#petalFill)"
                transform={`translate(200,235) rotate(${angle})`}
              />
            ))}
            <circle cx="200" cy="235" r="34" fill="var(--bloom)" opacity="0.5" />
          </g>
        </svg>
      </div>
      <div className="aura-grain absolute inset-0 opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-alt/40 via-transparent to-surface-alt/60" />
    </div>
  );
}







export function GlassCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("glass rounded-3xl p-6", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-8">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export function SoftButton({
  children,
  className,
  variant = "soft",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "soft" | "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cn(
        "bloom-glow inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase transition-all duration-300 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:brightness-110",
        variant === "soft" && "neu text-foreground hover:-translate-y-0.5",
        variant === "ghost" && "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "neu-pressed w-full rounded-2xl border-0 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60";

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "rose" | "ink";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[0.65rem] font-semibold tracking-[0.14em] uppercase",
        tone === "neutral" && "bg-secondary text-secondary-foreground",
        tone === "rose" && "bg-petal text-accent-foreground",
        tone === "ink" && "bg-primary text-primary-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-soft rounded-3xl px-8 py-16 text-center">
      <p className="text-lg font-light text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
