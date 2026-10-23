import type { ReactNode } from "react";

import type { ClientType } from "@/integrations/supabase/types";

export function isPersonType(type: ClientType | string | null | undefined) {
  return type === "individual";
}

export function PersonName({ name }: { name: string }) {
  return <span className="is-person">{name}</span>;
}

export function shownName(name: string, person: boolean): ReactNode {
  return person ? <PersonName name={name} /> : name;
}

export function markPerson(text: string, who?: string | null) {
  if (!who) return text;
  const at = text.indexOf(who);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <PersonName name={who} />
      {text.slice(at + who.length)}
    </>
  );
}
