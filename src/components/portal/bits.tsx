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
        style={{ mixBlendMode: "multiply", opacity: 0.85 }}
      >
        <defs>
          <filter id="auraBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
        </defs>
        <g
          className="animate-[aura-drift_28s_ease-in-out_infinite_alternate]"
          style={{ transformOrigin: "50px 50px", transformBox: "fill-box" }}
        >
          {/* Stem */}
          <path
            d="M50 50 Q49 68 50 84 T50 98"
            stroke="var(--rose)"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            opacity="0.55"
            filter="url(#auraBlur)"
          />
          {/* Leaves */}
          <ellipse
            cx="53"
            cy="74"
            rx="7"
            ry="3"
            fill="var(--rose)"
            opacity="0.32"
            transform="rotate(-35 53 74)"
            filter="url(#auraBlur)"
          />
          <ellipse
            cx="48"
            cy="86"
            rx="5.5"
            ry="2.4"
            fill="var(--petal)"
            opacity="0.28"
            transform="rotate(28 48 86)"
            filter="url(#auraBlur)"
          />
          {/* Petals */}
          {[0, 72, 144, 216, 288].map((angle, i) => (
            <ellipse
              key={angle}
              cx="0"
              cy="-9"
              rx="6.5"
              ry="14"
              fill={i % 2 === 0 ? "var(--petal)" : "var(--rose)"}
              opacity="0.5"
              transform={`translate(50,38) rotate(${angle})`}
              filter="url(#auraBlur)"
            />
          ))}
          {/* Heart */}
          <circle cx="50" cy="38" r="4.5" fill="var(--bloom)" opacity="0.4" filter="url(#auraBlur)" />
        </g>
      </svg>
      <div className="aura-grain absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-alt/55 via-transparent to-surface-alt/65" />
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
