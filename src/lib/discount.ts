import { dollarsToCents } from "@/lib/proposal-link";

export type DiscountMode = "amount" | "percent";

/** the percentage typed, 0–100, or null when it isn't one */
export function discountPercent(text: string) {
  const value = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 100) : null;
}

/** a discount in cents: dollars as typed, or a percentage of the amount before it */
export function discountCents(text: string, mode: DiscountMode, listCents: number | null) {
  if (mode === "percent") {
    const percent = discountPercent(text);
    return percent && listCents ? Math.round((listCents * percent) / 100) : 0;
  }
  return dollarsToCents(text) ?? 0;
}

/** a named discount the studio keeps to use again for any client */
export type SavedDiscount = {
  id: string;
  name: string;
  kind: DiscountMode;
  /** a percentage (10) or dollars (50) */
  value: number;
};

/** how a discount reads on an invoice: "returning client (10%)", "discount (10%)", or its name alone */
export function discountLabel(
  name: string | null | undefined,
  percent: number | null | undefined,
  fallback = "courtesy discount",
) {
  const label = name?.trim();
  const share = percent ? `${Number(percent)}%` : "";
  if (label) return share ? `${label} (${share})` : label;
  return share ? `discount (${share})` : fallback;
}

/** a saved discount as the field shows it: "10" with %, or "50.00" with $ */
export function savedDiscountText(discount: SavedDiscount) {
  return discount.kind === "percent" ? String(Number(discount.value)) : discount.value.toFixed(2);
}
