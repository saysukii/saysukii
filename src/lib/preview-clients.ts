import type { ClientRow, ClientType } from "@/integrations/supabase/types";
import { getDevPreviewClients } from "@/lib/dev-preview-data";
import { clientSlugs } from "@/lib/os/inquiry-desk";

const STORAGE_KEY = "say-sukii-preview-clients";

export type ContactDraft = {
  name: string;
  email: string;
  phone?: string | null;
  organization?: string | null;
  source?: string | null;
  notes?: string | null;
  type?: ClientType;
};

export function readPreviewClients(): ClientRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ClientRow[]) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => row && !row.archived && row.email) : [];
  } catch {
    return [];
  }
}

function writePreviewClients(rows: ClientRow[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function rememberPreviewClient(draft: ContactDraft) {
  const now = new Date().toISOString();
  const row: ClientRow = {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    email: draft.email.trim(),
    phone: draft.phone?.trim() || null,
    organization: draft.organization?.trim() || null,
    type: draft.type ?? "individual",
    source: draft.source?.trim() || "added by hand",
    notes: draft.notes?.trim() || null,
    archived: false,
    created_at: now,
    updated_at: now,
  };
  const existing = readPreviewClients();
  const email = row.email.toLowerCase();
  writePreviewClients([...existing.filter((item) => item.email.toLowerCase() !== email), row]);
  return row;
}

export function updatePreviewClient(id: string, draft: ContactDraft) {
  const rows = readPreviewClients();
  const next = rows.map((row) =>
    row.id === id
      ? {
          ...row,
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone?.trim() || null,
          organization: draft.organization?.trim() || null,
          type: draft.type ?? row.type,
          source: draft.source?.trim() || row.source,
          notes: draft.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        }
      : row,
  );
  writePreviewClients(next);
}

export function findPreviewClient(id: string) {
  const rows = readPreviewClients();
  const slugs = clientSlugs(rows);
  return rows.find((row) => row.id === id || slugs.get(row.id) === id) ?? null;
}

export function previewDirectoryRecord(id: string) {
  const rows = mergePreviewClients(getDevPreviewClients());
  const slugs = clientSlugs(rows);
  const client = rows.find((row) => row.id === id || slugs.get(row.id) === id);
  const local = client ? readPreviewClients().find((row) => row.id === client.id) : null;
  if (!local) return null;
  return {
    client: local,
    slug: slugs.get(local.id) ?? local.id,
    inquiries: [],
    proposals: [],
    projects: [],
    files: [],
  };
}

export function mergePreviewClients(rows: ClientRow[]) {
  const seen = new Set(rows.map((row) => row.email.toLowerCase()));
  const extra = readPreviewClients().filter((row) => !seen.has(row.email.toLowerCase()));
  return [...rows, ...extra].sort((left, right) => left.name.localeCompare(right.name));
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim()));
}

function column(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()));
}

export function parseNotionCsv(text: string): ContactDraft[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) return [];
  const headers = table[0] ?? [];
  const name = column(headers, ["name", "client", "contact", "full name"]);
  const email = column(headers, ["email", "email address", "e-mail"]);
  const phone = column(headers, ["phone", "phone number", "mobile"]);
  const organization = column(headers, ["organization", "organisation", "company", "org", "house"]);
  if (name < 0 || email < 0) return [];
  const contacts: ContactDraft[] = [];
  const seen = new Set<string>();
  for (const line of table.slice(1)) {
    const person = line[name]?.trim() ?? "";
    const address = line[email]?.trim() ?? "";
    if (!person || !address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({
      name: person,
      email: address,
      phone: phone >= 0 ? line[phone]?.trim() || null : null,
      organization: organization >= 0 ? line[organization]?.trim() || null : null,
      source: "notion",
    });
  }
  return contacts;
}
