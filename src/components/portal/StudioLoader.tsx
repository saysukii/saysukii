import { cn } from "@/lib/utils";

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
