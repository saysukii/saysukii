export type InvoiceItem = {
  key: string;
  name: string;
  note: string | null;
  unitCents: number;
  quantity: number;
  squareId: string | null;
  /** the catalog's own price, so a line priced by hand goes to square as its own item */
  catalogCents?: number | null;
};

/** The invoice a lead is building, on its own: no proposal behind it. */
export type InvoiceDraft = {
  items: InvoiceItem[];
  amount: string;
  courtesy: string;
  pay: "deposit" | "full";
};

export const EMPTY_INVOICE_DRAFT: InvoiceDraft = {
  items: [],
  amount: "",
  courtesy: "",
  pay: "full",
};

export type CatalogItem = {
  id: string;
  name: string;
  variation: string | null;
  description: string | null;
  priceCents: number | null;
};

const STORAGE_KEY = "say-sukii-invoice-items";

export function invoiceItemsTotal(items: InvoiceItem[]) {
  return items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
}

export function itemFromCatalog(entry: CatalogItem): InvoiceItem {
  return {
    key: crypto.randomUUID(),
    name: entry.variation ? `${entry.name} · ${entry.variation}` : entry.name,
    note: entry.description,
    unitCents: entry.priceCents ?? 0,
    quantity: 1,
    squareId: entry.id,
    catalogCents: entry.priceCents,
  };
}

export function customItem(name: string): InvoiceItem {
  return {
    key: crypto.randomUUID(),
    name: name.trim(),
    note: null,
    unitCents: 0,
    quantity: 1,
    squareId: null,
  };
}

/** A lead's invoice draft is kept on this browser until it's sent. */
export function loadInvoiceDraft(inquiryId: string): InvoiceDraft {
  if (typeof window === "undefined") return EMPTY_INVOICE_DRAFT;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      InvoiceDraft | InvoiceItem[]
    >;
    const found = saved[inquiryId];
    if (Array.isArray(found)) return { ...EMPTY_INVOICE_DRAFT, items: found };
    return found ? { ...EMPTY_INVOICE_DRAFT, ...found } : EMPTY_INVOICE_DRAFT;
  } catch {
    return EMPTY_INVOICE_DRAFT;
  }
}

export function keepInvoiceDraft(inquiryId: string, draft: InvoiceDraft) {
  if (typeof window === "undefined") return;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      InvoiceDraft
    >;
    const empty = !draft.items.length && !draft.amount && !draft.courtesy && draft.pay === "full";
    if (empty) delete saved[inquiryId];
    else saved[inquiryId] = draft;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // a full or blocked store just means the draft isn't remembered
  }
}

export const PREVIEW_CATALOG: CatalogItem[] = [
  {
    id: "prev-bouquet-s",
    name: "garden bouquet",
    variation: "petite",
    description: "hand-tied, seasonal stems",
    priceCents: 9500,
  },
  {
    id: "prev-bouquet-m",
    name: "garden bouquet",
    variation: "classic",
    description: "hand-tied, seasonal stems",
    priceCents: 14500,
  },
  {
    id: "prev-bouquet-l",
    name: "garden bouquet",
    variation: "grand",
    description: "hand-tied, seasonal stems",
    priceCents: 22500,
  },
  {
    id: "prev-bud",
    name: "bud vase trio",
    variation: null,
    description: "three single-stem vases",
    priceCents: 6500,
  },
  {
    id: "prev-center",
    name: "low centerpiece",
    variation: null,
    description: "for a dinner table",
    priceCents: 18500,
  },
  {
    id: "prev-bridal",
    name: "bridal bouquet",
    variation: null,
    description: null,
    priceCents: 35000,
  },
  { id: "prev-bout", name: "boutonnière", variation: null, description: null, priceCents: 2800 },
  {
    id: "prev-weekly",
    name: "weekly arrangement",
    variation: null,
    description: "refreshed each week",
    priceCents: 16000,
  },
  {
    id: "prev-delivery",
    name: "local delivery",
    variation: null,
    description: "miami-dade and broward",
    priceCents: 4000,
  },
  {
    id: "prev-install",
    name: "custom installation",
    variation: null,
    description: "priced per design",
    priceCents: null,
  },
];
