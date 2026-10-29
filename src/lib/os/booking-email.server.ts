import { Resend } from "resend";

import { renderSaySukiiEmail } from "@/lib/os/email-layout";

export type BookingMail = {
  startsAt: string;
  name: string;
  email: string;
  note: string;
  durationMinutes: number;
  meeting?: "meet" | "phone";
  /** the google meet link, when the calendar made one */
  joinUrl?: string | null;
};

const ZONE = "America/New_York";

function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function stamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function fold(line: string) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function windowFor(input: BookingMail) {
  const start = new Date(input.startsAt);
  return { start, end: new Date(start.getTime() + input.durationMinutes * 60 * 1000) };
}

export function bookingWhen(startsAt: string) {
  return new Date(startsAt)
    .toLocaleString("en-US", {
      timeZone: ZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase();
}

function placeLabel(input: Pick<BookingMail, "meeting">) {
  return input.meeting === "phone" ? "phone call" : "google meeting";
}

function noteLines(input: Pick<BookingMail, "note" | "durationMinutes" | "meeting" | "joinUrl">) {
  return [
    "thank you for making time. looking forward to connecting with you soon! <3",
    "if this is an event or wedding -- in our initial consultation, we will discuss your overall vision and needs to follow up with an accurate proposal quote.",
    "please have any inspiration images you have readily available for our meeting. you may also email them to info@saysukii.com.",
    `${input.durationMinutes} minutes · ${placeLabel(input)}`,
    input.joinUrl ? `join: ${input.joinUrl}` : "",
    input.note.trim(),
  ].filter(Boolean);
}

export function meetingIcs(input: BookingMail) {
  const { start, end } = windowFor(input);
  const uid = `${stamp(start)}-${input.email.replace(/[^a-z0-9]/gi, "")}@saysukii.com`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Say Sukii//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:let's talk with say sukii",
    `DESCRIPTION:${icsText(noteLines(input).join("\n"))}`,
    ...(input.joinUrl ? [`LOCATION:${icsText(input.joinUrl)}`, `URL:${input.joinUrl}`] : []),
    "ORGANIZER;CN=Say Sukii:mailto:info@saysukii.com",
    `ATTENDEE;CN=${icsText(input.name)};RSVP=TRUE:mailto:${input.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
}

export function calendarLink(input: BookingMail) {
  const { start, end } = windowFor(input);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "let's talk with say sukii",
    dates: `${stamp(start)}/${stamp(end)}`,
    details: noteLines(input).join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function subjectFor(input: BookingMail) {
  return `you’re booked · ${bookingWhen(input.startsAt)}`;
}

export function bookingHtml(input: BookingMail, origin?: string) {
  const note = input.note.trim();
  return renderSaySukiiEmail({
    ...(origin ? { origin } : {}),
    eyebrow: "let's talk",
    headline: "you're booked",
    body: [
      "thank you for making time. looking forward to connecting with you soon!\u00a0<3",
      "",
      "if this is an event or wedding -- in our initial consultation, we will discuss your overall vision and needs to follow up with an accurate proposal quote.",
      "",
      "please have any inspiration images you have readily available for our meeting. you may also email them to info@saysukii.com.",
    ].join("\n"),
    facts: [
      { label: "when", value: bookingWhen(input.startsAt) },
      { label: "length", value: `${input.durationMinutes} minutes · ${placeLabel(input)}` },
      ...(input.joinUrl ? [{ label: "join", value: input.joinUrl }] : []),
      ...(note ? [{ label: "note", value: note }] : []),
    ],
    button: {
      label: "keep this on your calendar",
      url: calendarLink(input),
    },
    note: "the meeting is attached to this email.",
  });
}

export function bookingText(input: BookingMail) {
  return [
    "say sukii",
    "you’re booked",
    bookingWhen(input.startsAt),
    "",
    ...noteLines(input),
    "",
    "this note has the meeting attached, so you can keep it on your calendar.",
    calendarLink(input),
  ].join("\n");
}

function wrappedBase64(value: string) {
  return (
    Buffer.from(value, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

function bookingMime(input: BookingMail) {
  const mixed = `sukii-${Date.now().toString(36)}`;
  const alt = `${mixed}-note`;
  const subject = `=?UTF-8?B?${Buffer.from(subjectFor(input), "utf8").toString("base64")}?=`;
  return [
    `From: "Say Sukii" <info@saysukii.com>`,
    `To: ${input.email}`,
    `Subject: ${subject}`,
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
    wrappedBase64(bookingText(input)),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrappedBase64(bookingHtml(input)),
    `--${alt}--`,
    `--${mixed}`,
    'Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name="say-sukii.ics"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="say-sukii.ics"',
    "",
    wrappedBase64(meetingIcs(input)),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

async function sendBookingThroughGmail(input: BookingMail) {
  const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
  const { encodeGmailRaw } = await import("@/lib/os/gmail-outbound.server");
  const gmail = await getGmailPublicStatus();
  if (gmail.status !== "connected") return { sent: false as const };
  const accessToken = await validGmailAccessToken();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw: encodeGmailRaw(bookingMime(input)) }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message || `Gmail send failed (${response.status})`);
  }
  return { sent: true as const };
}

export async function sendBookingEmail(input: BookingMail) {
  try {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) return sendBookingThroughGmail(input);
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii <onboarding@resend.dev>",
      to: input.email,
      subject: subjectFor(input),
      html: bookingHtml(input),
      text: bookingText(input),
      attachments: [
        {
          filename: "say-sukii.ics",
          content: meetingIcs(input),
          contentType: "text/calendar; charset=UTF-8; method=REQUEST",
        },
      ],
    });
    if (error) throw new Error(error.message);
    return { sent: true as const };
  } catch (error) {
    console.error("[booking] confirmation email was not sent", error);
    return { sent: false as const };
  }
}

/** The studio's own note that a call was booked, sent to the notification address. */
export async function sendBookingNotice(input: BookingMail) {
  const { sendStudioNotice } = await import("@/lib/os/email.server");
  const when = bookingWhen(input.startsAt);
  const note = input.note.trim();
  return sendStudioNotice({
    subject: `a call was booked · ${input.name}`,
    text: [
      "a call was booked",
      `${input.name} · ${input.email}`,
      when,
      `${input.durationMinutes} minutes · ${placeLabel(input)}`,
      input.joinUrl ? `join: ${input.joinUrl}` : "",
      note ? `note: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: renderSaySukiiEmail({
      eyebrow: "let's talk",
      headline: "a call was booked",
      body: `${input.name} booked a time to talk.`,
      facts: [
        { label: "who", value: input.name },
        { label: "email", value: input.email },
        { label: "when", value: when },
        { label: "length", value: `${input.durationMinutes} minutes · ${placeLabel(input)}` },
        ...(input.joinUrl ? [{ label: "join", value: input.joinUrl }] : []),
        ...(note ? [{ label: "note", value: note }] : []),
      ],
    }),
  });
}
