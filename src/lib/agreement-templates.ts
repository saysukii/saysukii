import { floralAgreementPlain, statementOfWork, type StatementOfWork } from "@/lib/floral-agreement";

export type AgreementType = "standard" | "in_kind_barter";

export const AGREEMENT_TYPE_LABEL: Record<AgreementType, string> = {
  standard: "Standard Agreement",
  in_kind_barter: "In-Kind / Barter Agreement",
};

type AgreementContext = {
  clientName: string;
  contactName: string | null;
  projectTitle: string;
  eventDate: string | null;
  venue: string | null;
  totalCents: number;
  depositCents: number;
  proposalNumber: string;
  statement?: StatementOfWork | null;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function eventLine(ctx: AgreementContext): string {
  const parts = [ctx.projectTitle];
  if (ctx.eventDate) parts.push(`on ${ctx.eventDate}`);
  if (ctx.venue) parts.push(`at ${ctx.venue}`);
  return parts.join(" ");
}

export function buildAgreementContent(type: AgreementType, ctx: AgreementContext): string {
  const header = [
    `This agreement is entered into between Say Sukii ("Studio"), a Miami floral and experiential design studio, and ${ctx.clientName}${ctx.contactName ? ` (attn: ${ctx.contactName})` : ""} ("Client").`,
    "",
    `Engagement: ${eventLine(ctx)}`,
    `Reference proposal: ${ctx.proposalNumber}`,
    "",
  ].join("\n");

  if (type === "in_kind_barter") {
    return (
      header +
      [
        "1. SCOPE",
        "The Studio will design, produce, and install the floral and experiential elements described in the referenced proposal. The proposal, including its line items, is incorporated into this agreement by reference.",
        "",
        "2. IN-KIND CONSIDERATION",
        `In place of a cash fee, Client provides in-kind consideration of equivalent stated value ${dollars(ctx.totalCents)}. Consideration may include venue access, hospitality, product, media placement, or promotional exposure as agreed in writing between the parties. Any portion not delivered as in-kind consideration converts to a cash balance payable within fifteen (15) days of the engagement date.`,
        "",
        "3. CREDIT AND CONTENT RIGHTS",
        "Client agrees to credit Say Sukii as floral and experiential designer in all published materials, including social captions, press mentions, and vendor lists. The Studio retains the right to photograph, film, and publish the work for portfolio and marketing use. Client grants the Studio access to capture content on site before guest arrival.",
        "",
        "4. SCHEDULE AND ACCESS",
        "Client provides load-in access, elevator or freight availability, and a secured staging area at the times agreed in production planning. Delays caused by venue access may reduce installed scope without reduction of stated value.",
        "",
        "5. SUBSTITUTIONS",
        "Botanical material is seasonal and market-dependent. The Studio may substitute stems of equal or greater quality, holding to the agreed palette, scale, and design intent.",
        "",
        "6. CANCELLATION",
        "If Client cancels within thirty (30) days of the engagement date, Client reimburses the Studio for all hard costs incurred, including sourced botanicals, rentals, and committed labor.",
        "",
        "7. LIABILITY",
        "The Studio's liability is limited to the stated value of this agreement. The Studio is not responsible for damage caused by guests, weather, venue conditions, or third-party vendors.",
        "",
        "8. GOVERNING LAW",
        "This agreement is governed by the laws of the State of Florida.",
        "",
        "Accepted by:",
        "",
        "Client signature: ______________________________   Date: ____________",
        "",
        "Say Sukii: ______________________________   Date: ____________",
      ].join("\n")
    );
  }

  const balance = Math.max(0, ctx.totalCents - ctx.depositCents);
  const work = statementOfWork({
    flowers: ctx.statement?.flowers || ctx.projectTitle,
    eventWhen: ctx.statement?.eventWhen || ctx.eventDate || "",
    occasion: ctx.statement?.occasion || ctx.projectTitle,
    venue: ctx.statement?.venue || ctx.venue || "",
    delivery: ctx.statement?.delivery,
    taxes: ctx.statement?.taxes,
    rentals: ctx.statement?.rentals,
    rentalDeposit: ctx.statement?.rentalDeposit,
  });
  return floralAgreementPlain({
    ...work,
    clientName: ctx.clientName,
    total: dollars(ctx.totalCents),
    deposit: dollars(ctx.depositCents),
    balance: dollars(balance),
  });
}
