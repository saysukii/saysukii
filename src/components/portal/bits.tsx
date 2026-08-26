import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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

/** Soft blurred aura background with gentle cursor parallax. */
export function Aura() {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setPos({
          x: event.clientX / window.innerWidth,
          y: event.clientY / window.innerHeight,
        });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const shift = (depth: number) => ({
    transform: `translate3d(${(pos.x - 0.5) * depth}px, ${(pos.y - 0.5) * depth}px, 0)`,
    transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
  });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-surface-alt" />
      <div
        className="absolute -left-32 top-[-10%] size-[46rem] rounded-full bg-petal/70 blur-[130px]"
        style={shift(70)}
      />
      <div
        className="absolute right-[-14%] top-[8%] size-[40rem] rounded-full bg-rose/55 blur-[140px]"
        style={shift(-110)}
      />
      <div
        className="absolute bottom-[-22%] right-[6%] size-[52rem] rounded-full bg-bloom/40 blur-[160px]"
        style={shift(140)}
      />
      <div
        className="absolute bottom-[-18%] left-[10%] size-[38rem] rounded-full bg-petal/55 blur-[150px]"
        style={shift(-60)}
      />
      <div
        className="absolute left-1/2 top-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose/25 blur-[120px]"
        style={shift(40)}
      />
      <div className="aura-grain absolute inset-0 opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-alt/40 via-transparent to-surface-alt/50" />
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
