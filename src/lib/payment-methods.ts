/** how a client paid outside the card pop-up, when the studio marks an invoice paid */
export const MANUAL_METHODS = [
  { id: "zelle", label: "Zelle" },
  { id: "bank", label: "Bank transfer" },
  { id: "cash", label: "Cash" },
  { id: "check", label: "Check" },
  { id: "other", label: "Other" },
] as const;

export type ManualMethod = (typeof MANUAL_METHODS)[number]["id"];

export function manualMethodLabel(id: string | null | undefined) {
  return MANUAL_METHODS.find((method) => method.id === id)?.label ?? "Other";
}

/** a paid date (YYYY-MM-DD) as a moment in the studio's afternoon, so it reads the same day everywhere */
export function paidOnMoment(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T17:00:00.000Z` : new Date().toISOString();
}
