import type { DirectoryContact } from "@/integrations/supabase/types";

/** everyone to reach at a venue or vendor: its first contact, then the rest */
export function recordContacts(row: {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  more_contacts?: DirectoryContact[] | null;
}): DirectoryContact[] {
  const first = {
    name: row.contact_name ?? "",
    email: row.contact_email ?? "",
    phone: row.contact_phone ?? "",
  };
  const rest = Array.isArray(row.more_contacts) ? row.more_contacts : [];
  return [first, ...rest].filter((person) => person.name || person.email || person.phone);
}

/** the contacts as a save sends them: the first in its own fields, the rest after */
export function contactsForSave(contacts: DirectoryContact[]) {
  const kept = contacts
    .map((person) => ({
      name: person.name.trim(),
      email: person.email.trim(),
      phone: person.phone.trim(),
    }))
    .filter((person) => person.name || person.email || person.phone);
  const [first, ...rest] = kept;
  return {
    contact_name: first?.name ?? "",
    contact_email: first?.email ?? "",
    contact_phone: first?.phone ?? "",
    more_contacts: rest,
  };
}
