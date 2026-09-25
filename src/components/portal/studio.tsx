import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StudioHeading({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="studio-today-top">
      <div>
        <h1>{title}</h1>
        {note ? <p>{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StudioViews({
  to,
  views,
  current,
}: {
  to: "/proposals" | "/clients" | "/settings";
  views: Array<{ id: string; label: string }>;
  current: string;
}) {
  return (
    <nav className="studio-views" aria-label="layout versions">
      {views.map((view) => (
        <Link
          key={view.id}
          to={to}
          search={{ view: view.id }}
          className={cn(current === view.id && "is-on")}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

export function StudioChip({
  children,
  tone = "soft",
  stage,
}: {
  children: ReactNode;
  tone?: "soft" | "due" | "late";
  stage?: "new" | "touch" | "proposal" | "booked" | "archived";
}) {
  return (
    <span className={cn("studio-chip", stage && `is-${stage}`, tone === "due" && "is-due", tone === "late" && "is-late")}>
      {stage ? <i className="studio-pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
