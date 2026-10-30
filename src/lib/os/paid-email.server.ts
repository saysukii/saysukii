import {
  defaultEmailTemplate,
  templateFirstName,
  templateWords,
  type EmailTemplate,
} from "@/lib/email-templates";
import { withFee } from "@/lib/convenience-fee";
import { emailKind, renderSaySukiiEmail, studioLinkOrigin } from "@/lib/os/email-layout";

export type PaidLetter = {
  clientName: string;
  invoiceNumber: string;
  /** what this payment was */
  amountCents: number;
  /** everything paid so far, this payment included */
  paidCents: number;
  totalCents: number;
  /** true for the payment that booked the project (the deposit, or paying in full at once) */
  booking: boolean;
  /** what it's for, e.g. "floral subscription" */
  occasion: string;
  /** the event's date (YYYY-MM-DD), when there is one */
  eventDate?: string | null;
  /** when it was paid */
  paidAt: string;
  /** the inquiry's id, so the studio's button opens it */
  inquiryId?: string;
  /** the inquiry's event type, for the small label of its kind */
  eventType?: string;
  /** an invoice of its own after the booking, like an arrangement they added on */
  addOn?: boolean;
  /** the studio's saved words for this letter; the app's own when there are none */
  template?: EmailTemplate;
  /** the 4% convenience fee this payment carried; set once payments carry it */
  feeCents?: number;
};

/** every date in these letters reads MM/DD/YY */
export function letterDate(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.slice(0, 10));
  if (day && raw.length <= 10) return `${day[2]}/${day[3]}/${day[1]!.slice(2)}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    timeZone: "America/New_York",
  });
}

/** the balance after a deposit is due 30 days before the event */
export function balanceDueDate(eventDate: string | null | undefined) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventDate ?? "");
  if (!day) return null;
  const due = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) - 30));
  return due.toISOString().slice(0, 10);
}

/** "$2,001.25 due 02/10/27", or just the amount when there's no event date */
export function balanceLine(cents: number, eventDate: string | null | undefined) {
  const due = balanceDueDate(eventDate);
  return due ? `${money(cents)} due ${letterDate(due)}` : money(cents);
}

/** the payment with its date, and after a deposit, the balance with its due date */
function paidFacts(letter: PaidLetter) {
  const left = letter.totalCents - letter.paidCents;
  const fee = letter.feeCents ?? 0;
  // what the card was charged, and what's left with its share of the 4% fee
  const leftCharge = letter.feeCents != null ? withFee(left, letter.paidCents) : left;
  return [
    { label: "invoice", value: letter.invoiceNumber },
    {
      label: "paid",
      value: `${money(letter.amountCents + fee)} on ${letterDate(letter.paidAt)}${fee ? ` (incl. ${money(fee)} convenience fee)` : ""}`,
    },
    ...(left > 0 ? [{ label: "balance", value: balanceLine(leftCharge, letter.eventDate) }] : []),
    { label: "for", value: forLine(letter) },
  ];
}

function forLine(letter: PaidLetter) {
  const when = letterDate(letter.eventDate);
  return when ? `${letter.occasion} · ${when}` : letter.occasion;
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** the booked letter, or the thank-you once the rest is paid, in the studio's words */
function paidWords(letter: PaidLetter) {
  const template =
    letter.template ?? defaultEmailTemplate(letter.booking ? "booked" : "paid-in-full");
  return templateWords(template, {
    name: templateFirstName(letter.clientName),
    invoice: letter.invoiceNumber,
    occasion: letter.occasion,
  });
}

/**
 * To the client once they've paid. The payment that books the project says so, with the receipt
 * and signed agreement; paying the rest later is a simple thank-you with the receipt.
 */
export function clientPaidHtml(letter: PaidLetter, origin?: string) {
  const first = letter.clientName.trim().split(/\s+/)[0] || letter.clientName;
  const kind = emailKind(letter.eventType);
  const shared = {
    ...(origin ? { origin } : {}),
    ...(kind ? { kind } : {}),
    facts: paidFacts(letter),
  };
  if (letter.addOn) {
    return renderSaySukiiEmail({
      ...shared,
      eyebrow: "paid in full",
      headline: "thank you",
      body: `thank you, ${first}. your receipt for your add-ons is attached.`,
    });
  }
  const words = paidWords(letter);
  return renderSaySukiiEmail({
    ...shared,
    eyebrow: letter.booking ? "booked" : "paid in full",
    headline: words.headline,
    body: words.body,
  });
}

export function clientPaidSubject(letter: PaidLetter) {
  if (letter.addOn) return `thank you · receipt for ${letter.invoiceNumber}`;
  return paidWords(letter).subject;
}

/** To the studio: the project is booked, or later, the balance is paid. */
export function studioPaidHtml(letter: PaidLetter, origin?: string) {
  const links = (origin ?? studioLinkOrigin()).replace(/\/$/, "");
  const kind = emailKind(letter.eventType);
  return renderSaySukiiEmail({
    ...(origin ? { origin } : {}),
    ...(kind ? { kind } : {}),
    eyebrow: letter.booking ? "booked" : "paid in full",
    headline: letter.booking
      ? "a project is booked"
      : letter.addOn
        ? "an add-on is paid"
        : "a balance is paid",
    body: letter.booking
      ? `${letter.clientName} ${letter.paidCents >= letter.totalCents ? "paid in full" : "paid the deposit"}. the project is on the books, and their proposal, signed agreement + receipt went to them.`
      : letter.addOn
        ? `${letter.clientName} paid for their add-ons. the receipt went to them.`
        : `${letter.clientName} paid the rest of their invoice. the receipt went to them.`,
    facts: [{ label: "client", value: letter.clientName }, ...paidFacts(letter)],
    button: {
      label: "open the project",
      url: letter.inquiryId ? `${links}/pipeline/${letter.inquiryId}` : `${links}/pipeline`,
    },
  });
}

export function studioPaidSubject(letter: PaidLetter) {
  return letter.booking
    ? `booked · ${letter.clientName} paid ${letter.invoiceNumber}`
    : `paid in full · ${letter.clientName} paid ${letter.invoiceNumber}`;
}

export function paidText(letter: PaidLetter) {
  const left = letter.totalCents - letter.paidCents;
  const fee = letter.feeCents ?? 0;
  const leftCharge = letter.feeCents != null ? withFee(left, letter.paidCents) : left;
  const words = paidWords(letter);
  return [
    words.headline,
    "",
    words.body,
    "",
    `invoice: ${letter.invoiceNumber}`,
    `paid: ${money(letter.amountCents + fee)} on ${letterDate(letter.paidAt)}`,
    ...(left > 0 ? [`balance: ${balanceLine(leftCharge, letter.eventDate)}`] : []),
    `for: ${forLine(letter)}`,
  ].join("\n");
}

export type BalanceReminder = {
  clientName: string;
  invoiceNumber: string;
  balanceCents: number;
  occasion: string;
  eventDate: string;
  /** "soon" five days ahead of the due date, "today" on it, "now" when the studio sends it by hand */
  when: "soon" | "today" | "now";
  /** the client's proposal, which opens on the invoice */
  payUrl: string;
  eventType?: string;
  /** the studio's own words, when they edited the letter before sending it */
  body?: string;
  /** the studio's saved words for this letter; the app's own when there are none */
  template?: EmailTemplate;
};

export { LETTER_WORDS } from "@/lib/letter-words";

/** To the client before the balance is due: what's left, when, and a button straight to the invoice. */
/** the letter's own words, before any edits */
export function balanceReminderWords(reminder: BalanceReminder) {
  return balanceReminderParts(reminder).body;
}

/** how each balance letter reads: its eyebrow, subject, headline, and words */
function balanceReminderParts(reminder: BalanceReminder) {
  const due = balanceDueDate(reminder.eventDate);
  const id = ({ today: "balance-today", soon: "balance-soon", now: "balance-invoice" } as const)[
    reminder.when
  ];
  const words = templateWords(reminder.template ?? defaultEmailTemplate(id), {
    name: templateFirstName(reminder.clientName),
    occasion: reminder.occasion,
    due: due ? letterDate(due) : "soon",
    invoice: reminder.invoiceNumber,
  });
  const eyebrow = { today: "due today", soon: "a gentle reminder", now: "invoice" }[reminder.when];
  return { eyebrow, ...words };
}

export function balanceReminderHtml(reminder: BalanceReminder, origin?: string) {
  const kind = emailKind(reminder.eventType);
  const { eyebrow, headline, body } = balanceReminderParts(reminder);
  return renderSaySukiiEmail({
    ...(origin ? { origin } : {}),
    ...(kind ? { kind } : {}),
    eyebrow,
    headline,
    body: reminder.body ?? body,
    facts: [
      { label: "invoice", value: reminder.invoiceNumber },
      { label: "balance", value: balanceLine(reminder.balanceCents, reminder.eventDate) },
      { label: "for", value: `${reminder.occasion} · ${letterDate(reminder.eventDate)}` },
    ],
    button: { label: "pay the remaining balance", url: reminder.payUrl },
  });
}

export function balanceReminderSubject(reminder: BalanceReminder) {
  return balanceReminderParts(reminder).subject;
}

export type AddOnInvoice = {
  clientName: string;
  invoiceNumber: string;
  amountCents: number;
  eventDate?: string | null;
  /** the invoice page, where they pay */
  payUrl: string;
  eventType?: string;
};

/** To the client: an invoice of its own after the booking, with a button straight to it. */
export function addOnInvoiceHtml(invoice: AddOnInvoice, origin?: string) {
  const first = invoice.clientName.trim().split(/\s+/)[0] || invoice.clientName;
  const kind = emailKind(invoice.eventType);
  const when = letterDate(invoice.eventDate);
  return renderSaySukiiEmail({
    ...(origin ? { origin } : {}),
    ...(kind ? { kind } : {}),
    eyebrow: "invoice",
    headline: "your invoice",
    body: `hi ${first}, here's the invoice for your requested add-ons. you can pay it right from your invoice.`,
    facts: [
      { label: "invoice", value: invoice.invoiceNumber },
      { label: "due", value: money(invoice.amountCents) },
      { label: "for", value: when ? `add-ons · ${when}` : "add-ons" },
    ],
    button: { label: "view + pay your invoice", url: invoice.payUrl },
  });
}

export function addOnInvoiceSubject(invoice: AddOnInvoice) {
  return `your invoice · ${invoice.invoiceNumber}`;
}

export type LetterFile = { name: string; type: string; data: Uint8Array };

function base64Lines(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return (
    bytes
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

function encodeWord(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Sends one of the studio's own letters to a client from the studio gmail, keeping its designed
 * html and any files attached. Falls back to resend when gmail isn't connected.
 */
export async function sendClientLetter(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: LetterFile[];
}) {
  const files = input.attachments ?? [];
  const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
  const gmail = await getGmailPublicStatus().catch(() => null);
  if (gmail?.status === "connected") {
    const mixed = "saysukii-paid-mail";
    const alt = "saysukii-paid-letter";
    const rfc822 = [
      `From: "Say Sukii" <${gmail.account_email || "info@saysukii.com"}>`,
      `To: ${input.to}`,
      `Subject: ${encodeWord(input.subject)}`,
      `Date: ${new Date().toUTCString().replace(/UTC$/i, "GMT")}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(input.text),
      `--${alt}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(input.html),
      `--${alt}--`,
      ...files.flatMap((file) => [
        `--${mixed}`,
        `Content-Type: ${file.type}; name="${file.name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${file.name}"`,
        "",
        base64Lines(file.data),
      ]),
      `--${mixed}--`,
      "",
    ].join("\r\n");
    const accessToken = await validGmailAccessToken();
    const response = await fetch(
      "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "message/rfc822" },
        body: rfc822,
      },
    );
    if (response.ok) return { sent: true as const };
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    console.error(
      "[client letter] gmail did not send:",
      payload?.error?.message ?? response.status,
    );
  }
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: false as const };
  const { Resend } = await import("resend");
  const { error } = await new Resend(apiKey).emails.send({
    from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii <studio@saysukii.com>",
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: files.map((file) => ({ filename: file.name, content: Buffer.from(file.data) })),
  });
  if (error) {
    console.error("[client letter] resend did not send:", error.message);
    return { sent: false as const };
  }
  return { sent: true as const };
}
