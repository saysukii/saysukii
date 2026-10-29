import { Resend } from "resend";

import { emailOrigin, renderSaySukiiEmail } from "@/lib/os/email-layout";
import { studioNotificationEmail } from "@/lib/os/email.server";

export type ChangeRequestMail = {
  clientName: string;
  clientEmail: string | null;
  eventDate: string | null;
  place: string | null;
  investment: string | null;
  note: string;
};

function notificationRecipient() {
  return studioNotificationEmail();
}

function momentDate(value: string | null) {
  const raw = value?.trim().slice(0, 10);
  if (!raw) return "to be decided";
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value?.trim() || "to be decided";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toLowerCase();
}

export function changeRequestHtml(input: ChangeRequestMail, origin?: string) {
  const base = origin ?? emailOrigin();
  return renderSaySukiiEmail({
    origin: base,
    eyebrow: "the moment",
    eyebrowColor: "#C45D72",
    headline: "a change was requested",
    body: `${input.clientName} asked for a change on the proposal.`,
    facts: [
      { label: "client", value: input.clientName },
      { label: "date", value: momentDate(input.eventDate) },
      { label: "place", value: input.place?.trim() || "to be decided" },
      { label: "investment", value: input.investment?.trim() || "—" },
      { label: "change", value: input.note },
    ],
    button: {
      label: "open the book",
      url: `${base}/pipeline`,
      color: "#C45D72",
    },
    ...(input.clientEmail ? { note: input.clientEmail } : {}),
  });
}

export function changeRequestText(input: ChangeRequestMail) {
  return [
    "the moment",
    `client: ${input.clientName}`,
    `date: ${momentDate(input.eventDate)}`,
    `place: ${input.place?.trim() || "—"}`,
    `investment: ${input.investment?.trim() || "—"}`,
    `change requested: ${input.note}`,
    input.clientEmail || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlMessage(input: ChangeRequestMail) {
  const subject = `changes requested — ${input.clientName}`;
  const headers = [
    `From: "Say Sukii" <info@saysukii.com>`,
    `To: ${notificationRecipient()}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString().replace(/UTC$/i, "GMT")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const payload =
    Buffer.from(changeRequestHtml(input), "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  return `${headers.join("\r\n")}\r\n\r\n${payload}`;
}

async function sendChangeRequestThroughGmail(input: ChangeRequestMail) {
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
    body: JSON.stringify({ raw: encodeGmailRaw(htmlMessage(input)) }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message || `Gmail send failed (${response.status})`);
  }
  return { sent: true as const };
}

export async function sendChangeRequestEmail(input: ChangeRequestMail) {
  try {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) return sendChangeRequestThroughGmail(input);
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii <onboarding@resend.dev>",
      to: notificationRecipient(),
      subject: `changes requested — ${input.clientName}`,
      html: changeRequestHtml(input),
      text: changeRequestText(input),
    });
    if (error) throw new Error(error.message);
    return { sent: true as const };
  } catch (error) {
    console.error("[change-request] email to info@saysukii.com was not sent", error);
    return { sent: false as const };
  }
}
