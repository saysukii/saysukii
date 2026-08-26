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
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.9, overflow: "visible" }}
      >
        <defs>
          <filter id="auraBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
          </filter>
          <radialGradient id="bloomGlow" cx="50%" cy="28%" r="55%">
            <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.45" />
            <stop offset="60%" stopColor="var(--petal)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--surface-alt)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft aura field behind the flower */}
        <circle cx="50" cy="30" r="40" fill="url(#bloomGlow)" opacity="0.9" filter="url(#auraBlur)" />

        <g
          className="animate-[aura-drift_28s_ease-in-out_infinite_alternate]"
          style={{ transformOrigin: "50px 50px", transformBox: "fill-box" }}
        >
          {/* Stem */}
          <path
            d="M50 44 Q49.5 64 50 80 T50 104"
            stroke="var(--rose)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            opacity="0.65"
            filter="url(#auraBlur)"
          />
          {/* Leaves */}
          <ellipse
            cx="64"
            cy="58"
            rx="12"
            ry="4.5"
            fill="var(--rose)"
            opacity="0.38"
            transform="rotate(-52 64 58)"
            filter="url(#auraBlur)"
          />
          <ellipse
            cx="36"
            cy="78"
            rx="10"
            ry="4"
            fill="var(--petal)"
            opacity="0.32"
            transform="rotate(42 36 78)"
            filter="url(#auraBlur)"
          />
          {/* Petals */}
          {[0, 72, 144, 216, 288].map((angle, i) => (
            <ellipse
              key={angle}
              cx="0"
              cy="-15"
              rx="12"
              ry="30"
              fill={i % 2 === 0 ? "var(--petal)" : "var(--rose)"}
              opacity="0.62"
              transform={`translate(50,30) rotate(${angle})`}
              filter="url(#auraBlur)"
            />
          ))}
          {/* Heart */}
          <circle cx="50" cy="30" r="6.5" fill="var(--bloom)" opacity="0.5" filter="url(#auraBlur)" />
        </g>
      </svg>
      <div className="aura-grain absolute inset-0 opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-alt/35 via-transparent to-surface-alt/45" />
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
