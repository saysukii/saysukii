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
  button?: { label: string; url: string; color?: string };
  note?: string;
  origin?: string;
};

export function escapeEmail(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function emailOrigin() {
  return (process.env["APP_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
}

export function renderSaySukiiEmail(input: SaySukiiEmail) {
  const origin = (input.origin ?? emailOrigin()).replace(/\/$/, "");
  const facts = (input.facts ?? []).filter((fact) => fact.value.trim());
  const detail = facts.length
    ? `<tr><td style="padding-bottom:28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#FFF8F9;border-radius:12px;padding:18px 20px;">${factsTable(facts)}</td></tr></table></td></tr>`
    : "";
  const button = input.button
    ? `<tr><td align="center" style="padding-bottom:20px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:${input.button.color ?? "#FF4D94"};border-radius:8px;"><a href="${escapeEmail(input.button.url)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#FFF8F9;text-decoration:none;border-radius:8px;">${escapeEmail(input.button.label)}</a></td></tr></table></td></tr>`
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
    .replaceAll("{{note_block}}", note);
}

function factsTable(facts: EmailFact[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts
    .map(
      (fact) => `<tr>
        <td style="width:108px;padding:0 8px 10px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(36,34,31,0.52);font-weight:700;vertical-align:baseline;">${escapeEmail(fact.label)}</td>
        <td style="padding:0 0 10px;font-size:15px;line-height:1.5;color:#24221F;vertical-align:baseline;">${escapeEmail(fact.value)}</td>
      </tr>`,
    )
    .join("")}</table>`;
}
