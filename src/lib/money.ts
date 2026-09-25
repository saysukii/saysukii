export function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

export function formatMoneyExact(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  return Math.round(Number.parseFloat(cleaned) * 100);
}

export function lineTotalCents(qty: number, unitPriceCents: number): number {
  return Math.round(qty * unitPriceCents);
}

export const SERVICE_LINES = ["floral", "wedding", "experiential"] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

export const SERVICE_LINE_LABEL: Record<ServiceLine, string> = {
  floral: "Floral",
  wedding: "Wedding",
  experiential: "Experiential",
};

export const UNITS = ["each", "hour", "arrangement", "flat"] as const;
export type Unit = (typeof UNITS)[number];

export const STAGES = ["conversation", "proposal_out", "agreement", "booked", "complete"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  conversation: "Conversation",
  proposal_out: "Proposal Out",
  agreement: "Agreement",
  booked: "Booked",
  complete: "Complete",
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateNumeric(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}
