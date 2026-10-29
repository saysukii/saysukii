import type { ClientType, VendorRow } from "@/integrations/supabase/types";
import { withoutCountry } from "@/lib/place-text";

const CLIENT_TYPES = ["individual", "brand", "corporate", "venue_partner"] as const;
const VENDOR_TYPES = ["warehouse", "wholesaler", "rental", "other"] as const;

export type ClientCsvRow = {
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  type: ClientType;
  source: string | null;
  notes: string | null;
  address: string | null;
};

export type VenueCsvRow = {
  name: string;
  address: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  load_in_notes: string | null;
  category: string | null;
  website: string | null;
  capacity: string | null;
};

export type VendorCsvRow = {
  name: string;
  type: VendorRow["type"];
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  ordering_method: string | null;
  address: string | null;
};

type CsvField = {
  key: string;
  aliases: string[];
  required?: boolean;
};

type CsvRead<T> = {
  rows: T[];
  rejected: Array<{ line: number; reason: string }>;
  error?: string;
};

// aliases cover the studio's own sheets and a notion export ("full name", "phone number", "location", "category")
const PHONE = ["phone", "phone number", "phone #", "telephone", "mobile", "cell"];
const ADDRESS = ["address", "location", "place", "street address", "mailing address"];

const clientFields: CsvField[] = [
  { key: "name", aliases: ["name", "client", "client name", "full name"], required: true },
  { key: "email", aliases: ["email", "e-mail", "email address", "client email"], required: true },
  { key: "phone", aliases: PHONE },
  { key: "organization", aliases: ["organization", "organisation", "company", "org"] },
  { key: "type", aliases: ["type", "client type"] },
  { key: "source", aliases: ["source"] },
  { key: "notes", aliases: ["notes", "note"] },
  { key: "address", aliases: ADDRESS },
];

const venueFields: CsvField[] = [
  { key: "name", aliases: ["name", "venue", "venue name"], required: true },
  { key: "address", aliases: [...ADDRESS, "venue address"] },
  { key: "contact_name", aliases: ["contact name", "contact_name", "contact"] },
  { key: "contact_email", aliases: ["contact email", "contact_email", "email"] },
  { key: "contact_phone", aliases: ["contact phone", "contact_phone", ...PHONE] },
  { key: "load_in_notes", aliases: ["load in notes", "load_in_notes", "load-in notes", "notes"] },
  { key: "category", aliases: ["category", "type", "venue type"] },
  { key: "website", aliases: ["website", "url", "site"] },
  { key: "capacity", aliases: ["capacity", "guest capacity"] },
];

const vendorFields: CsvField[] = [
  { key: "name", aliases: ["name", "vendor", "vendor name"], required: true },
  { key: "type", aliases: ["type", "vendor type", "category"] },
  { key: "contact_name", aliases: ["contact name", "contact_name", "contact"] },
  { key: "contact_email", aliases: ["contact email", "contact_email", "email"] },
  { key: "contact_phone", aliases: ["contact phone", "contact_phone", ...PHONE] },
  {
    key: "ordering_method",
    aliases: ["ordering method", "ordering_method", "ordering", "how to order"],
  },
  { key: "notes", aliases: ["notes", "note"] },
  { key: "address", aliases: ADDRESS },
];

export function readClientCsv(text: string): CsvRead<ClientCsvRow> {
  return readCsv(text, clientFields, (cells, line) => {
    const name = requiredText(cells["name"], 160);
    const email = requiredText(cells["email"], 320);
    if (!name) return { error: `row ${line} needs a name` };
    if (!email || !email.includes("@")) return { error: `row ${line} needs an email` };
    const type = enumValue(cells["type"], CLIENT_TYPES, "individual");
    if (!type)
      return { error: `row ${line} type should be individual, brand, corporate, or venue partner` };
    return {
      row: {
        name,
        email,
        phone: optionalText(cells["phone"], 50),
        organization: optionalText(cells["organization"], 160),
        type,
        source: optionalText(cells["source"], 160) ?? "csv",
        notes: optionalText(cells["notes"], 5000),
        address: optionalText(withoutCountry(cells["address"]), 500),
      },
    };
  });
}

export function readVenueCsv(text: string): CsvRead<VenueCsvRow> {
  return readCsv(text, venueFields, (cells, line) => {
    const name = requiredText(cells["name"], 200);
    if (!name) return { error: `row ${line} needs a name` };
    // a venue without a location still comes in; the address can be added on its page
    const address = requiredText(withoutCountry(cells["address"]), 500);
    const contactEmail = optionalText(cells["contact_email"], 320);
    if (contactEmail && !contactEmail.includes("@"))
      return { error: `row ${line} contact email is not an email` };
    return {
      row: {
        name,
        address,
        contact_name: optionalText(cells["contact_name"], 160),
        contact_email: contactEmail,
        contact_phone: optionalText(cells["contact_phone"], 50),
        load_in_notes: optionalText(cells["load_in_notes"], 5000),
        category: optionalText(cells["category"], 120),
        website: optionalText(cells["website"], 500),
        capacity: optionalText(cells["capacity"], 60),
      },
    };
  });
}

export function readVendorCsv(text: string): CsvRead<VendorCsvRow> {
  return readCsv(text, vendorFields, (cells, line) => {
    const name = requiredText(cells["name"], 200);
    if (!name) return { error: `row ${line} needs a name` };
    const type = vendorKind(cells["type"]);
    const contactEmail = optionalText(cells["contact_email"], 320);
    if (contactEmail && !contactEmail.includes("@"))
      return { error: `row ${line} contact email is not an email` };
    return {
      row: {
        name,
        type,
        contact_name: optionalText(cells["contact_name"], 160),
        contact_email: contactEmail,
        contact_phone: optionalText(cells["contact_phone"], 50),
        ordering_method: noteWith(cells["ordering_method"], [
          cells["notes"],
          // a category that isn't one of the four kinds stays readable on the vendor
          type === "other" && cells["type"]?.trim() ? `category: ${cells["type"].trim()}` : "",
        ]),
        address: optionalText(withoutCountry(cells["address"]), 500),
      },
    };
  });
}

export function csvImportNote(added: number, skipped: number, rejected: number, preview: boolean) {
  const parts = [
    added > 0 ? `added ${added}` : null,
    skipped > 0 ? `skipped ${skipped} already in the book` : null,
    rejected > 0 ? `${rejected} ${rejected === 1 ? "row" : "rows"} didn't match` : null,
  ].filter(Boolean);
  const line = parts.length > 0 ? parts.join(", ") : "nothing to add";
  return preview && added > 0 ? `${line}. preview only` : line;
}

function readCsv<T>(
  text: string,
  fields: CsvField[],
  build: (cells: Record<string, string>, line: number) => { row?: T; error?: string },
): CsvRead<T> {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], rejected: [], error: "this file is empty" };
  const header = table[0]?.map(normalizeHeader) ?? [];
  const columns = new Map<string, number>();
  for (const field of fields) {
    const index = header.findIndex((cell) => field.aliases.includes(cell));
    if (index >= 0) columns.set(field.key, index);
  }
  const missing = fields.filter((field) => field.required && !columns.has(field.key));
  if (columns.size === 0 || missing.length > 0) {
    const needed = fields
      .filter((field) => field.required)
      .map((field) => field.aliases[0])
      .join(" and ");
    return { rows: [], rejected: [], error: `this directory needs ${needed} columns` };
  }

  const rows: T[] = [];
  const rejected: Array<{ line: number; reason: string }> = [];
  table.slice(1).forEach((record, index) => {
    if (record.every((cell) => cell.trim() === "")) return;
    const cells: Record<string, string> = {};
    for (const [key, column] of columns) cells[key] = record[column] ?? "";
    const built = build(cells, index + 2);
    if (built.row) rows.push(built.row);
    else if (built.error) rejected.push({ line: index + 2, reason: built.error });
  });
  if (rows.length === 0 && rejected.length === 0) {
    return { rows: [], rejected: [], error: "this file has no rows under the header" };
  }
  return { rows, rejected };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Notion categories ("florals", "rentals") read as one of the four vendor kinds. */
function vendorKind(value: string | undefined): VendorRow["type"] {
  const exact = enumValue(value, VENDOR_TYPES, "other");
  if (exact) return exact;
  const text = (value ?? "").toLowerCase();
  if (/flor|flower|bloom|grower|wholesale|market|greens|plant/.test(text)) return "wholesaler";
  if (/rent|linen|furniture|tabletop|decor|glass|candle/.test(text)) return "rental";
  if (/warehouse|storage|supply|supplies|hardgood/.test(text)) return "warehouse";
  return "other";
}

/** Joins a note with the extra columns that have no field of their own, one per line. */
function noteWith(note: string | undefined, extras: Array<string | undefined>) {
  const lines = [note, ...extras].map((value) => value?.trim() ?? "").filter(Boolean);
  return lines.length ? lines.join("\n").slice(0, 5000) : null;
}

function requiredText(value: string | undefined, max: number) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.slice(0, max);
}

function optionalText(value: string | undefined, max: number) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, max) : null;
}

function enumValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return fallback;
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_") as T;
  return allowed.includes(normalized) ? normalized : null;
}
