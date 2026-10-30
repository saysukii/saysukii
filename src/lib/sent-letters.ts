/**
 * The emails the app sends a client on its own (receipts, reminders) stay out of the conversation.
 * The proposal tab lists them instead, one quiet line each.
 */
export type SentLetter = { id: string; line: string; at: string; href?: string };

export const SENT_LETTER_EVENTS = [
  "paid_letter",
  "balance_reminder_soon",
  "balance_reminder_today",
  "balance_invoice_sent",
] as const;

export function sentLetterLine(event: string, payload: { to?: string; booking?: boolean }) {
  const to = payload.to ? ` to ${payload.to}` : "";
  if (event === "paid_letter") {
    return payload.booking ? `booking email + receipt sent${to}` : `receipt sent${to}`;
  }
  if (event === "balance_reminder_soon") return `balance reminder sent${to}`;
  if (event === "balance_reminder_today") return `due-today reminder sent${to}`;
  if (event === "balance_invoice_sent") return `invoice link sent${to}`;
  return `email sent${to}`;
}
