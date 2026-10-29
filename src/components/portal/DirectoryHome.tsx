import { useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import type { DirectorySelection } from "@/lib/use-directory-selection";
import { cn } from "@/lib/utils";

export function DirectoryHome({
  title,
  lede,
  back,
  action,
  children,
}: {
  title: string;
  lede?: string | undefined;
  back?: { to: "/library" | "/directories/vendors" | "/directories/venues"; label: string };
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="studio-home is-book">
      <header className="studio-home-hello">
        <div>
          {back ? (
            <Link to={back.to} className="studio-kicker">
              {back.label}
            </Link>
          ) : (
            <p className="studio-kicker">the book</p>
          )}
          <h1>{title}</h1>
          {lede ? <p>{lede}</p> : null}
        </div>
        {action ? <div className="studio-home-hello-go">{action}</div> : null}
      </header>
      <div className="studio-book-body">{children}</div>
    </div>
  );
}

export function DirectoryImport({
  hint,
  onText,
}: {
  hint: string;
  onText: (text: string) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="studio-today-go"
        title={hint}
        onClick={() => inputRef.current?.click()}
      >
        import
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void file.text().then((text) => onText(text));
        }}
      />
    </>
  );
}

export function DirectorySelectToggle({ selection }: { selection: DirectorySelection }) {
  return (
    <button
      type="button"
      className="studio-today-go"
      aria-pressed={selection.on}
      onClick={selection.on ? selection.stop : selection.start}
    >
      {selection.on ? "done" : "select"}
    </button>
  );
}

export function DirectorySelectBar({
  selection,
  visibleIds,
  noun,
  busy,
  onDelete,
  verb = "delete",
}: {
  selection: DirectorySelection;
  visibleIds: string[];
  noun: [one: string, many: string];
  busy: boolean;
  onDelete: (ids: string[]) => void;
  verb?: "delete" | "archive";
}) {
  if (!selection.on) return null;
  const picked = visibleIds.filter((id) => selection.ids.has(id));
  const allPicked = visibleIds.length > 0 && picked.length === visibleIds.length;
  return (
    <div className="studio-directory-pickbar" role="toolbar" aria-label={`select ${noun[1]}`}>
      <span>{picked.length === 0 ? `pick ${noun[1]}` : `${picked.length} selected`}</span>
      <button
        type="button"
        className="studio-ghost"
        onClick={() => selection.pickAll(allPicked ? [] : visibleIds)}
      >
        {allPicked ? "clear" : "select all"}
      </button>
      <button
        type="button"
        className="studio-ghost is-delete"
        disabled={picked.length === 0 || busy}
        onClick={() => {
          const label = picked.length === 1 ? `this ${noun[0]}` : `${picked.length} ${noun[1]}`;
          if (window.confirm(`${verb} ${label}?`)) onDelete(picked);
        }}
      >
        {busy ? (verb === "archive" ? "archiving…" : "deleting…") : verb}
      </button>
    </div>
  );
}

export function DirectoryPick({
  selection,
  id,
  children,
}: {
  selection: DirectorySelection;
  id: string;
  children: ReactNode;
}) {
  const picked = selection.ids.has(id);
  return (
    <button
      type="button"
      className={cn("studio-book-row is-pick", picked && "is-picked")}
      aria-pressed={picked}
      onClick={() => selection.toggle(id)}
    >
      <i className="studio-directory-check" aria-hidden="true">
        {picked ? <Check /> : null}
      </i>
      {children}
    </button>
  );
}

export function DirectorySearch({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="studio-search studio-directory-search">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
