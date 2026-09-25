import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "white";
}) {
  return (
    <img
      src="/say-sukii-logo.webp"
      alt="Say Sukii"
      width={750}
      height={267}
      draggable={false}
      className={cn(
        "h-auto w-full select-none object-contain",
        tone === "ink" && "invert",
        className,
      )}
    />
  );
}

export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("glass rounded-3xl p-5 sm:p-6", className)}>{children}</div>;
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
    <header className="flex flex-col items-start justify-between gap-5 pb-8 sm:flex-row sm:items-end sm:gap-6 sm:pb-10">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-3xl font-light tracking-[-0.035em] text-foreground sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">{actions}</div>
      ) : null}
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
        "bloom-glow inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(75,61,66,0.13)] hover:-translate-y-0.5 hover:brightness-105",
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
  "neu-pressed w-full rounded-2xl border-0 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";

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
        tone === "rose" && "bg-muted text-foreground",
        tone === "ink" && "bg-primary text-primary-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-soft rounded-3xl px-6 py-14 text-center sm:px-8 sm:py-16">
      <p className="text-lg font-light text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
