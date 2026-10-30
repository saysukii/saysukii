import type { ReactNode } from "react";

import type { ClientType } from "@/integrations/supabase/types";
import { capitalizeName } from "@/lib/name-case";

/**
 * Whether a client's name is shown as a name, keeping its capitals: every client's is, a person's
 * ("Amiyah Qi") or a brand's ("Fenty Beauty").
 */
export function isPersonType(type: ClientType | string | null | undefined) {
  return Boolean(type);
}

/**
 * A name, always written the same way: "Amiyah Qi", "Fenty Beauty". The studio writes in
 * lowercase, so a name keeps its own capitals inside that.
 */
export function PersonName({ name, asTyped = false }: { name: string; asTyped?: boolean }) {
  // a calendar event's own title ("TAĪSTU home refresh") stays exactly as it was written
  return <span className="is-person">{asTyped ? name : capitalizeName(name)}</span>;
}

/** a client's name with its capitals; anything else (an event, a task) stays in the studio's voice */
export function shownName(name: string, person: boolean, asTyped = false): ReactNode {
  return person && name ? <PersonName name={name} asTyped={asTyped} /> : name;
}

/** a line that mentions someone, with their name capitalized wherever it appears */
export function markPerson(text: string, who?: string | null) {
  const name = who?.trim();
  if (!name) return text;
  const at = text.toLowerCase().indexOf(name.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <PersonName name={text.slice(at, at + name.length)} />
      {text.slice(at + name.length)}
    </>
  );
}

/** a line with every mention of these names capitalized: the full name, or just the first */
export function markNames(text: string, names: Array<string | null | undefined>): ReactNode {
  const words = [
    ...new Set(
      names.flatMap((name) => (name?.trim() ? [name.trim(), name.trim().split(/\s+/)[0]!] : [])),
    ),
  ]
    .filter((word) => word.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  const pattern = new RegExp(`(?<![\\p{L}])(${words.join("|")})(?![\\p{L}])`, "giu");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 ? <PersonName key={index} name={part} /> : part));
}
