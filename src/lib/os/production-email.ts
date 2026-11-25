import { renderSaySukiiEmail } from "@/lib/os/email-layout";
import { formatMoneyExact } from "@/lib/money";
import { hoursLabel, hoursSummary, rateLabel } from "@/lib/os/production";

/**
 * The one email the team gets: their invitation into the studio, sent when sukii first shares a
 * production they're on (or from the gang, for an admin). It only opens the door; their schedule,
 * shifts, and tasks wait for them inside, where a short tour shows them around.
 */
export function teamInviteHtml(input: {
  link: string;
  role: "admin" | "team";
  invitedBy?: string | null;
  /** their first name, as sukii added them */
  given?: string | null;
  /** the production that brought them in, when it came from sharing one */
  projectName?: string | null;
  origin?: string;
}) {
  const who = input.invitedBy?.trim().split(/\s+/)[0]?.toLowerCase();
  const given = input.given?.trim().split(/\s+/)[0]?.toLowerCase();
  const from = who || "sukii";
  return renderSaySukiiEmail({
    eyebrow: "the say sukii gang",
    headline: "you're invited to the studio",
    body: [
      `${given ? `hi ${given}, ` : ""}${
        input.projectName
          ? `${from} shared the production: {i}${input.projectName}{/i}.`
          : input.role === "admin"
            ? `${from} is sharing the keys to the online studio.`
            : `${from} added you to the say sukii studio.`
      } open the link to create your account, then we'll show you around.`,
      // an admin's letter is just those words; the team's says the link is single-use
      ...(input.role === "admin" && !input.projectName ? [] : ["the link works once."]),
    ].join("\n\n"),
    button: { label: "create your account", url: input.link },
    note: "not expecting this? you can let it be. nothing happens until the link is opened.",
    ...(input.origin ? { origin: input.origin } : {}),
  });
}

/**
 * The hours for payroll, to the studio: each person's scheduled hours on a production, at their
 * rate, and the total. The spreadsheet rides along for google sheets.
 */
export function hoursSummaryHtml(input: {
  projectName: string;
  range: string;
  url: string;
  summary: ReturnType<typeof hoursSummary>;
  origin?: string;
}) {
  const { summary } = input;
  const money = (cents: number | null) => (cents == null ? "no rate yet" : formatMoneyExact(cents));
  return renderSaySukiiEmail({
    eyebrow: "hours",
    headline: `the hours for ${input.projectName}`,
    body: [
      `${input.projectName}${input.range ? ` (${input.range})` : ""}: ${hoursLabel(summary.hours)} across ${summary.people.length} ${summary.people.length === 1 ? "person" : "people"}${summary.pay_cents != null ? `, ${formatMoneyExact(summary.pay_cents)} in all` : ""}.`,
      "paid on the scheduled hours. the spreadsheet is attached, ready for google sheets.",
    ].join("\n\n"),
    facts: summary.people.map((person) => ({
      label: `${person.name.split(/\s+/)[0]} · ${person.shifts.length} ${person.shifts.length === 1 ? "shift" : "shifts"}`,
      value: [
        hoursLabel(person.hours),
        person.rate ? rateLabel(person.rate) : "",
        money(person.pay_cents),
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    button: { label: "open the schedule", url: input.url },
    ...(input.origin ? { origin: input.origin } : {}),
  });
}
