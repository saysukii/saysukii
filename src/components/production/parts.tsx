import { useEffect, useState, type ReactNode } from "react";

import type { ProductionView } from "@/lib/os/production";
import type { ProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

export type BoardMode = "studio" | "team";

export type BoardProps = {
  view: ProductionView;
  mode: BoardMode;
  api: ProductionApi;
  /** after a change lands, the board asks for the production again */
  onChanged: () => Promise<unknown> | void;
};

export function ProdSection({
  icon,
  title,
  id,
  action,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  id?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("studio-module studio-prod-section", className)} id={id}>
      <div className="studio-prod-head">
        <p className="studio-home-label">
          {icon}
          {title}
        </p>
        {action ? <div className="studio-prod-head-go">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** a field that keeps its own draft and saves when you leave it */
export function SaveOnBlur({
  value,
  onSave,
  multiline = false,
  placeholder,
  label,
  className,
}: {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };
  return multiline ? (
    <textarea
      className={cn("studio-prod-input is-area", className)}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      rows={Math.min(8, Math.max(2, draft.split("\n").length))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
    />
  ) : (
    <input
      className={cn("studio-prod-input", className)}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
