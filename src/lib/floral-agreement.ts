export type StatementOfWork = {
  flowers: string;
  delivery: string;
  taxes: string;
  rentals: string;
  rentalDeposit: string;
  eventWhen: string;
  occasion: string;
  venue: string;
};

export const STATEMENT_FIELDS: Array<{ key: keyof StatementOfWork; label: string }> = [
  { key: "flowers", label: "flowers / service" },
  { key: "delivery", label: "delivery" },
  { key: "taxes", label: "taxes + service" },
  { key: "rentals", label: "rentals fee" },
  { key: "rentalDeposit", label: "rental security deposit" },
  { key: "eventWhen", label: "event day" },
  { key: "occasion", label: "occasion" },
  { key: "venue", label: "venue" },
];

export const INVOICE_THANKS = "Thank you for choosing Say Sukii! We appreciate your business.";

export function invoiceSharedDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function invoiceDateLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || /^tbd$/i.test(trimmed)) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(trimmed);
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : slash
      ? new Date(
          (slash[3] ?? "").length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]),
          Number(slash[1]) - 1,
          Number(slash[2]),
        )
      : null;
  if (date && !Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  const long = trimmed.match(/[A-Za-z]+ \d{1,2}, \d{4}/);
  if (long) return long[0];
  return trimmed.replace(/^[A-Za-z]+,\s*/, "").split(" · ")[0] ?? trimmed;
}

export function floralPackageName(occasion: string) {
  const text = occasion.trim().toLowerCase();
  if (text.includes("wedding")) return "Wedding Floral Package";
  if (text.includes("photo")) return "Photoshoot Floral Package";
  if (text.includes("subscription")) return "Floral Subscription";
  return "Event Floral Package";
}

export function invoiceBookingLine(occasion: string, when: string) {
  const text = occasion.trim().toLowerCase();
  const service = text.includes("wedding")
    ? "wedding floral service"
    : text.includes("photo")
      ? "photoshoot floral service"
      : text.includes("subscription")
        ? "floral subscription"
        : "event floral service";
  if (!when.trim()) return `Booked for ${service}.`;
  return `Booked for ${service} on ${when.trim()}.`;
}

export function statementOfWork(
  partial?: { [K in keyof StatementOfWork]?: StatementOfWork[K] | undefined } | null,
): StatementOfWork {
  return {
    flowers: partial?.flowers ?? "",
    delivery: partial?.delivery ?? "as detailed in the proposal",
    taxes: partial?.taxes ?? "as detailed in the proposal",
    rentals: partial?.rentals ?? "as detailed in the proposal",
    rentalDeposit: partial?.rentalDeposit ?? "refundable, see agreement",
    eventWhen: partial?.eventWhen ?? "",
    occasion: partial?.occasion ?? "",
    venue: partial?.venue ?? "",
  };
}

export function statementNotes(work: StatementOfWork, courtesyCents = 0, fileName = "") {
  return JSON.stringify({
    statement: work,
    courtesyCents,
    fileName: fileName || undefined,
  });
}

export function fileNameFromNotes(notes: string | null | undefined) {
  if (!notes) return "";
  try {
    const parsed = JSON.parse(notes) as { fileName?: unknown };
    return typeof parsed.fileName === "string" ? parsed.fileName.trim() : "";
  } catch {
    return "";
  }
}

export function courtesyFromNotes(notes: string | null | undefined) {
  if (!notes) return 0;
  try {
    const parsed = JSON.parse(notes) as { courtesyCents?: unknown };
    const value = parsed.courtesyCents;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  } catch {
    return 0;
  }
}

export function statementFromNotes(notes: string | null | undefined): StatementOfWork | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { statement?: Partial<StatementOfWork> };
    if (!parsed?.statement || typeof parsed.statement !== "object") return null;
    return statementOfWork(parsed.statement);
  } catch {
    return null;
  }
}

export type FloralAgreementFields = StatementOfWork & {
  clientName: string;
  total: string;
  deposit: string;
  balance: string;
};

export type FloralBlock = {
  kind: "title" | "heading" | "subhead" | "body" | "note" | "line";
  text: string;
};

export function floralAgreementBlocks(fields: FloralAgreementFields): FloralBlock[] {
  const client = fields.clientName || "Client";
  return [
    { kind: "title", text: "Floral Service Agreement" },
    {
      kind: "body",
      text: `This Agreement is between Say Sukii, LLC (hereafter "Say Sukii" or "we"), and ${client} (hereafter "Client"), for the purpose of Say Sukii providing Statement of Work for Client. This Agreement shall become effective upon the date of both Parties' signatures below.`,
    },
    { kind: "heading", text: "Client details" },
    { kind: "line", text: client },
    {
      kind: "note",
      text: "This is a copy. Your personal service agreement will be sent upon booking.",
    },
    { kind: "heading", text: "Payment & fees" },
    {
      kind: "body",
      text: "In order to secure services and reserve your date, a non-refundable deposit is required at time of booking.",
    },
    {
      kind: "body",
      text: "The deposit is applied toward the Client's wedding/event flowers, but is non-refundable should Client cancel for any reason at any time.",
    },
    {
      kind: "body",
      text: "A final consultation will be made 30 days prior to the wedding/event date, at which time the final balance will be due.",
    },
    {
      kind: "body",
      text: "Entire balance must be paid in full 30 days before the wedding/event date. A 25% service charge will be assessed on all remaining balances past 3 days due. Any past due balance will incur interest at 25% every 7 days thereafter.",
    },
    {
      kind: "body",
      text: "In the event that services are booked less than 45 days prior to the wedding/event date, the entire balance will immediately be due to secure the date. This will be non-refundable.",
    },
    {
      kind: "body",
      text: "Payments must be made by cash, check (payable to Say Sukii, LLC), wire transfer, bank transfer via Zelle, or online via credit/debit card. If using a check or credit/debit card, an additional 4% will be applied to the total. Payment due dates and account information will be indicated on your invoices and personal service agreement.",
    },
    {
      kind: "body",
      text: 'Say Sukii carries general liability insurance. However, there is a $110 fee should the venue or company require that their property, company or title also be listed as "additional insured" on our insurance policy.',
    },
    {
      kind: "body",
      text: "This will be due with the final payment 30 days before the wedding/event date (or due with full payment if the event is booked within 45 days).",
    },
    {
      kind: "body",
      text: "Additional purchases made after the final consultation will be accepted up to 14 days before the wedding/event date. Payment will be due upon ordering and there will be a non-refundable $55 fee for these additional orders.",
    },
    {
      kind: "body",
      text: "No guarantee is given that the same flowers will be available for orders made after the final consultation, but rest assured that color and style will match as closely as possible.",
    },
    {
      kind: "body",
      text: "A delivery/travel fee will apply to all service areas. Client may opt to pick up finished flowers instead of having them delivered if applicable.",
    },
    {
      kind: "body",
      text: "If flowers or services require on-site set up and/or installation, a fee at a percentage of the total before discounts will be assessed based on labor intensity. This will be indicated on the Client's personal service agreement.",
    },
    {
      kind: "body",
      text: "For destination weddings and events, travel accommodation fees will be determined during the consultation and indicated on invoices and the personal service agreement.",
    },
    { kind: "heading", text: "Price adjustments" },
    {
      kind: "body",
      text: "All pricing is based on supplier rates at the time of proposal. Due to the nature of imported floral products and market conditions, final costs may be subject to change. If there is a significant increase in tariffs, duties, or supplier costs that exceeds 5% after the proposal is signed, Say Sukii will notify the Client. The adjustment will be reflected in the final invoice. The Client may opt to revise selections to stay within budget.",
    },
    { kind: "heading", text: "Cancellations" },
    {
      kind: "body",
      text: "If the date of the Client's event changes and Client is in need of rescheduling services, we may not be able to accommodate the Client depending upon prior commitments.",
    },
    {
      kind: "body",
      text: "Due to the nature of the ongoing planning and design labor process, Say Sukii does not issue refunds on payments made once services are booked. Credits will be given based on timeline of cancellation or reschedule.",
    },
    {
      kind: "body",
      text: "Cancellations made at least 30 days prior to the event date will receive a full credit toward future bookings.",
    },
    {
      kind: "body",
      text: "Cancellations made less than 30 days prior to the wedding/event date will not receive a credit and have forfeited all payments made. Cancellations and reschedules will only be accepted by the individual that has signed the contract. If there are extenuating circumstances, please advise us and we will do our best to accommodate.",
    },
    { kind: "heading", text: "Substitutions" },
    {
      kind: "body",
      text: "Client agrees to communicate any color and/or flower variety preferences. We will advise Client on seasonality of specific flower varieties; however, substitutions may need to be made based on availability issues or other unforeseen or uncontrollable circumstances. We reserve the right to make substitutions in the event that the flowers received are not of the quality suitable for your wedding/event. Any substitutes will match as closely as possible in color and style as the original flowers agreed upon.",
    },
    { kind: "heading", text: "Rentals" },
    {
      kind: "body",
      text: "All rental fees and security deposits are due 30 days prior to the wedding/event. Rental fees are non-refundable and do not include delivery and set up, which is an additional charge. The security deposit will be refunded when the rentals are returned to us in original condition, no later than three days past the event date. If not returned within three days, the security deposit will not be refunded.",
    },
    { kind: "heading", text: "Our commitment" },
    {
      kind: "body",
      text: "We will provide all flowers and services agreed upon in time for your event. The flowers and colors will be of the types specified in the original proposal, barring any unforeseen event, in which case flowers of the same colors and a similar type will be substituted.",
    },
    { kind: "heading", text: "Intellectual property" },
    {
      kind: "body",
      text: "All materials shared by Say Sukii, including but not limited to proposals, designs, images, floral recipes, and written content, are the sole intellectual property of Say Sukii. These materials are provided for service consideration only and may not be shared, copied, or distributed without prior written consent. Unauthorized use may result in service termination and/or legal action.",
    },
    {
      kind: "body",
      text: "The Client agrees not to disclose any part of the proposal or related documents to third parties, including other vendors, without written approval from Say Sukii.",
    },
    {
      kind: "body",
      text: "Both parties agree to keep the terms of this agreement and any shared proprietary information confidential, unless disclosure is required by law.",
    },
    { kind: "heading", text: "Statement of work" },
    { kind: "subhead", text: "A. Services" },
    {
      kind: "body",
      text: "Client wedding/event order includes the following based on the work order detailed in the final proposal.",
    },
    { kind: "line", text: `Flowers / service: ${fields.flowers || "—"}` },
    { kind: "line", text: `Delivery: ${fields.delivery || "as detailed in the proposal"}` },
    { kind: "line", text: `Taxes + service: ${fields.taxes || "as detailed in the proposal"}` },
    { kind: "line", text: `Rentals fee: ${fields.rentals || "as detailed in the proposal"}` },
    {
      kind: "line",
      text: `Rental security deposit: ${fields.rentalDeposit || "refundable, see agreement"}`,
    },
    { kind: "subhead", text: "B. Location" },
    { kind: "line", text: `Event day / date / time: ${fields.eventWhen || "—"}` },
    { kind: "line", text: `Occasion: ${fields.occasion || "—"}` },
    { kind: "line", text: `Venue: ${fields.venue || "—"}` },
    { kind: "subhead", text: "C. Compensation" },
    { kind: "line", text: `Grand total: ${fields.total}` },
    { kind: "line", text: `Booking deposit: ${fields.deposit}` },
    { kind: "line", text: `Final payment: ${fields.balance}, due 30 days before the event` },
    {
      kind: "note",
      text: "This is a copy. Your personal service agreement will be sent upon booking.",
    },
  ];
}

export function floralAgreementPlain(fields: FloralAgreementFields): string {
  return floralAgreementBlocks(fields)
    .map((block) => block.text)
    .join("\n\n");
}
