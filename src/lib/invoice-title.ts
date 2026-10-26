/** Square invoice titles are SS plus the count, at least three digits: SS007, SS101. */
export function invoiceTitle(number: string) {
  const trimmed = number.trim();
  const digits = trimmed.match(/(\d+)\s*$/)?.[1];
  if (!digits) return trimmed;
  return `SS${digits.padStart(3, "0")}`;
}
