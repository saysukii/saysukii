import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { searchFloridaAddresses } from "@/lib/os/inquiries.functions";
import { cn } from "@/lib/utils";

export function FloridaAddressPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const searchAddresses = useServerFn(searchFloridaAddresses);
  const searchRef = useRef(searchAddresses);
  searchRef.current = searchAddresses;
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Array<{ id: string; label: string; value: string; provider?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    setOpen(true);
    setLoading(true);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const suggestions = await searchRef.current({ data: { q: trimmed } });
        if (cancelled) return;
        setResults(suggestions);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function selectSuggestion(next: string) {
    setQuery(next);
    onChange(next);
    setOpen(false);
  }

  const fromGoogle = results.some((result) => result.provider === "google");

  return (
    <div className="inquire-address">
      <label className="auth-field inquire-address-field">
        <span className="sr-only">Event address</span>
        <div className={cn("auth-input inquire-address-input", open && "inquire-address-input--open")}>
          <MapPin className="size-4 shrink-0 opacity-55" aria-hidden="true" />
          <input
            type="text"
            value={query}
            disabled={disabled}
            placeholder={placeholder || "search a place"}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              onChange(next);
            }}
          />
        </div>
      </label>

      {open ? (
        <ul id={listId} role="listbox" className="inquire-address-results">
          {loading && results.length === 0 ? <li className="inquire-address-status">searching places…</li> : null}
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                role="option"
                className="inquire-address-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(result.value)}
              >
                <MapPin className="size-3.5 shrink-0 opacity-45" aria-hidden="true" />
                <span>{result.label}</span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 ? <li className="inquire-address-status">no places found yet</li> : null}
          {fromGoogle ? <li className="inquire-address-credit">powered by google</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
