import layout from "@/emails/layout.html?raw";

export type EmailFact = {
  label: string;
  value: string;
};

export type SaySukiiEmail = {
  eyebrow: string;
  eyebrowColor?: string;
  headline: string;
  body: string;
  facts?: EmailFact[];
  /** every button is hot pink */
  button?: { label: string; url: string };
  /** the kind of work, shown as a small label in its own pink */
  kind?: EmailKind;
  note?: string;
  /** where the logo loads from; only the email preview page changes it */
  origin?: string;
};

export type EmailKind = "weddings" | "events" | "deliveries" | "flowers";

// the same pinks as the footer words, one for each kind of work, each soft enough to carry dark text
const KIND_PINK: Record<EmailKind, string> = {
  weddings: "#FF5C89",
  events: "#FB8CAC",
  deliveries: "#F4B3C0",
  flowers: "#FDA8BF",
};

/** wedding, events + activations (and styling), deliveries, and concierge + subscription flowers */
export function emailKind(eventType: string | null | undefined): EmailKind | undefined {
  if (!eventType) return undefined;
  if (eventType === "wedding") return "weddings";
  if (eventType === "other") return "deliveries";
  if (eventType === "subscription") return "flowers";
  return "events";
}

export function escapeEmail(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// images have to load for anyone, and vercel's preview addresses sit behind a sign-in
const EMAIL_ASSET_ORIGIN = "https://inside.saysukii.com";

/** Links in the studio's own notices always open the studio itself, wherever the note was sent from. */
export function studioLinkOrigin() {
  return import.meta.env.DEV ? emailOrigin() : EMAIL_ASSET_ORIGIN;
}

export function emailOrigin() {
  return (process.env["APP_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
}

export function renderSaySukiiEmail(input: SaySukiiEmail) {
  const origin = (input.origin ?? EMAIL_ASSET_ORIGIN).replace(/\/$/, "");
  const facts = (input.facts ?? []).filter((fact) => fact.value.trim());
  const detail = facts.length
    ? `<tr><td style="padding-bottom:28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#FFF8F9;border-radius:12px;padding:18px 20px;">${factsTable(facts)}</td></tr></table></td></tr>`
    : "";
  const button = input.button
    ? `<tr><td align="center" style="padding-bottom:20px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#FF4D94;border-radius:8px;"><a href="${escapeEmail(input.button.url)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#FFF8F9;text-decoration:none;border-radius:8px;">${escapeEmail(input.button.label)}</a></td></tr></table></td></tr>`
    : "";
  const note = input.note?.trim()
    ? `<tr><td align="center"><span style="font-size:13px;line-height:1.6;color:#999999;">${escapeEmail(input.note).replaceAll("\n", "<br>")}</span></td></tr>`
    : "";

  return layout
    .replaceAll("{{logo_url}}", `${origin}/email/say-sukii-wordmark.png`)
    .replaceAll("{{eyebrow_color}}", input.eyebrowColor ?? "#FF4D94")
    .replaceAll("{{eyebrow}}", escapeEmail(input.eyebrow))
    .replaceAll("{{headline}}", escapeEmail(input.headline))
    .replaceAll("{{body}}", escapeEmail(input.body).replaceAll("\n", "<br>"))
    .replaceAll("{{detail_block}}", detail)
    .replaceAll("{{button_block}}", button)
    .replaceAll("{{note_block}}", note)
    .replaceAll(
      "{{kind_block}}",
      input.kind
        ? `<tr><td align="center" style="padding-bottom:12px;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background-color:${KIND_PINK[input.kind]};color:${input.kind === "weddings" ? "#FFFFFF" : "#24221F"};font-size:11px;letter-spacing:0.08em;">${input.kind}</span></td></tr>`
        : "",
    );
}

function factsTable(facts: EmailFact[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts
    .map(
      (fact) => `<tr>
        <td style="width:108px;padding:0 8px 10px 0;font-size:11px;letter-spacing:0.14em;color:rgba(36,34,31,0.52);font-weight:700;vertical-align:baseline;">${escapeEmail(fact.label)}</td>
        <td style="padding:0 0 10px;font-size:15px;line-height:1.5;color:#24221F;vertical-align:baseline;">${escapeEmail(fact.value)}</td>
      </tr>`,
    )
    .join("")}</table>`;
}
