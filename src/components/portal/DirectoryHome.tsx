import { useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function DirectoryHome({
  title,
  lede,
  back,
  action,
  children,
}: {
  title: string;
  lede?: string;
  back?: { to: "/shelf" | "/directories/vendors" | "/directories/venues"; label: string };
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
      <button type="button" className="studio-today-go" title={hint} onClick={() => inputRef.current?.click()}>
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
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
