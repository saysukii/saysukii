import { Resend } from "resend";

import { renderSaySukiiEmail, studioLinkOrigin } from "@/lib/os/email-layout";
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

export function changeRequestHtml(input: ChangeRequestMail, origin?: string) {
  const base = origin ?? studioLinkOrigin();
  return renderSaySukiiEmail({
    ...(origin ? { origin } : {}),
    eyebrow: "the moment",
    headline: "a change was requested",
    body: `${input.clientName} asked for a change on the proposal.`,
    // the card holds only what they asked to change; everything else is on the inquiry
    facts: [{ label: "change", value: input.note.toLowerCase() }],
    button: {
      label: "open the book",
      url: `${base}/pipeline`,
    },
  });
}

export function changeRequestText(input: ChangeRequestMail) {
  return [
    "a change was requested",
    `${input.clientName} asked for a change on the proposal.`,
    `change: ${input.note.toLowerCase()}`,
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
    // through the studio's gmail; resend is only a backup, when it's still set up
    const apiKey = process.env["RESEND_API_KEY"];
    const throughGmail = await sendChangeRequestThroughGmail(input).catch((error: unknown) => {
      if (!apiKey) throw error;
      console.error("[change-request] gmail did not send, trying resend:", error);
      return null;
    });
    if (throughGmail || !apiKey) return throughGmail ?? { sent: false as const };
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
