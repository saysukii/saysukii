/** "305.555.0176": a US number as the studio writes it; anything else stays as it was typed. */
export function formatPhone(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10 || /[a-z]/i.test(raw)) return raw;
  return `${local.slice(0, 3)}.${local.slice(3, 6)}.${local.slice(6)}`;
}

/** formats a phone number as it's typed: 305 → 305, 3055 → 305.5, 3055550176 → 305.555.0176 */
export function typePhone(value: string) {
  // an international number, or one with an extension, is left as typed
  if (/^\s*\+(?!1\b)|[a-z]/i.test(value)) return value;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length > 10) return value;
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(".");
}
