import { randomUUID } from "node:crypto";

import { Resend } from "resend";

import type { EventType } from "@/integrations/supabase/types";
import { emailKind, renderSaySukiiEmail, studioLinkOrigin } from "@/lib/os/email-layout";
import { studioNotificationEmail } from "@/lib/os/email.server";
import { encodeGmailRaw } from "@/lib/os/gmail-outbound.server";
import { EVENT_LABEL, recordSlug } from "@/lib/os/inquiry-desk";

const STUDIO_INBOX = "info@saysukii.com";

type InquiryEmailDetails = {
  /** opens this exact inquiry, even for a client who has written before */
  inquiryId?: string;
  clientName: string;
  email: string;
  eventDate: string | null;
  eventType: string;
  venue: string | null;
};

function inquiryDate(value: string | null) {
  const raw = value?.slice(0, 10);
  if (!raw) return "to be decided";
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return "to be decided";
  return `${month}/${day}/${year.slice(-2)}`;
}

function inquiryKind(value: string) {
  if (value in EVENT_LABEL) return EVENT_LABEL[value as EventType];
  return value.replaceAll("_", " ");
}

function studioOrigin(origin?: string) {
  if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    return origin.replace(/\/$/, "");
  }
  return studioLinkOrigin().replace(/\/$/, "");
}

function inquiryLink(details: InquiryEmailDetails, origin?: string) {
  const record = details.inquiryId ?? recordSlug(details.clientName);
  return `${studioOrigin(origin)}/pipeline/${record}`;
}

export function inquiryReceivedHtml(details: InquiryEmailDetails, origin?: string) {
  const kind = inquiryKind(details.eventType);
  const label = emailKind(details.eventType);
  return renderSaySukiiEmail({
    ...(origin ? { origin } : {}),
    ...(label ? { kind: label } : {}),
    eyebrow: "new inquiry",
    headline: "someone wrote in",
    body: `a new ${kind} inquiry just arrived.`,
    facts: [
      { label: "client", value: details.clientName },
      { label: "email", value: details.email },
      { label: "date", value: inquiryDate(details.eventDate) },
      { label: "place", value: details.venue?.trim() || "to be decided" },
    ],
    button: {
      label: "open the inquiry",
      url: inquiryLink(details, origin),
    },
  });
}

function inquiryReceivedText(details: InquiryEmailDetails, origin?: string) {
  const kind = inquiryKind(details.eventType);
  return [
    "someone wrote in",
    `a new ${kind} inquiry just arrived.`,
    `client: ${details.clientName}`,
    `email: ${details.email}`,
    `date: ${inquiryDate(details.eventDate)}`,
    `place: ${details.venue?.trim() || "to be decided"}`,
    `open it: ${inquiryLink(details, origin)}`,
  ].join("\n");
}

export type NoticeFile = { name: string; type: string; data: Uint8Array };

function base64Lines(value: string | Uint8Array) {
  return (
    Buffer.from(value)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

function noticeRfc822(
  subject: string,
  html: string,
  text: string,
  to: string,
  files: NoticeFile[] = [],
) {
  const boundary = "saysukii-notice";
  const mixed = "saysukii-notice-files";
  const headers = [
    `From: "Say Sukii" <${STUDIO_INBOX}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString().replace(/UTC$/i, "GMT")}`,
    `Message-ID: <${randomUUID()}@saysukii.com>`,
    "MIME-Version: 1.0",
    files.length
      ? `Content-Type: multipart/mixed; boundary="${mixed}"`
      : `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const plain =
    Buffer.from(text, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const markup =
    Buffer.from(html, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const letter = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    plain,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    markup,
    `--${boundary}--`,
  ];
  if (!files.length) return [headers.join("\r\n"), "", ...letter, ""].join("\r\n");
  // with files: the letter first, then each file attached
  return [
    headers.join("\r\n"),
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    ...letter,
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
}

async function gmailWrite(url: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    labelIds?: string[];
    error?: { message?: string };
  } | null;
  return { ok: response.ok, status: response.status, payload };
}

async function insertStudioNotice(raw: string) {
  const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
  const gmail = await getGmailPublicStatus();
  if (gmail.status !== "connected") return false;
  const accessToken = await validGmailAccessToken();
  const encoded = encodeGmailRaw(raw);

  const inserted = await gmailWrite(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    accessToken,
    {
      raw: encoded,
      labelIds: ["INBOX", "UNREAD"],
    },
  );
  if (inserted.ok) return true;

  const sent = await gmailWrite(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    accessToken,
    {
      raw: encoded,
    },
  );
  if (!sent.ok || !sent.payload?.id) {
    console.error(
      "[Inquiry email] gmail did not deliver the notice:",
      inserted.payload?.error?.message || inserted.status,
      sent.payload?.error?.message || sent.status,
    );
    return false;
  }

  const placed = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${sent.payload.id}?format=minimal`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const placedPayload = (await placed.json().catch(() => null)) as { labelIds?: string[] } | null;
  if (placedPayload?.labelIds?.includes("INBOX")) return true;

  await gmailWrite(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${sent.payload.id}/modify`,
    accessToken,
    {
      addLabelIds: ["INBOX", "UNREAD"],
    },
  );
  return true;
}

async function sendNotice(raw: string) {
  const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
  const gmail = await getGmailPublicStatus();
  if (gmail.status !== "connected") return false;
  const accessToken = await validGmailAccessToken();
  const sent = await gmailWrite(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    accessToken,
    {
      raw: encodeGmailRaw(raw),
    },
  );
  if (!sent.ok || !sent.payload?.id) {
    console.error(
      "[Inquiry email] gmail did not send the notice:",
      sent.payload?.error?.message || sent.status,
    );
    return false;
  }
  return true;
}

export async function sendInquiryReceivedEmail(details: InquiryEmailDetails) {
  return deliverStudioNotice(
    `someone wrote in · ${details.clientName}`,
    inquiryReceivedHtml(details),
    inquiryReceivedText(details),
  );
}

/**
 * A note for the studio: placed straight in the studio inbox when that's where notices go,
 * otherwise sent through the studio's gmail, and through resend only if it's still set up.
 */
export async function deliverStudioNotice(
  subject: string,
  html: string,
  text: string,
  files: NoticeFile[] = [],
) {
  const to = studioNotificationEmail();
  const raw = noticeRfc822(subject, html, text, to, files);

  if (to === STUDIO_INBOX) {
    try {
      const placed = await insertStudioNotice(raw);
      if (placed) return { sent: true as const };
    } catch (error) {
      console.error("[Inquiry email] inbox insert failed:", error);
    }
  }

  try {
    const sent = await sendNotice(raw);
    if (sent) return { sent: true as const };
  } catch (error) {
    console.error("[Inquiry email] gmail send failed:", error);
  }
  const apiKey = process.env["RESEND_API_KEY"];
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii OS <onboarding@resend.dev>",
        to,
        subject,
        html,
        text,
        attachments: files.map((file) => ({
          filename: file.name,
          content: Buffer.from(file.data),
        })),
      });
      if (error) {
        console.error("[Inquiry email]", error.message);
      } else {
        return { sent: true as const };
      }
    } catch (error) {
      console.error("[Inquiry email]", error);
    }
  }

  return { sent: false as const };
}
