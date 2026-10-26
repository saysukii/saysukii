import { Resend } from "resend";

import type { EventType } from "@/integrations/supabase/types";
import { emailOrigin, renderSaySukiiEmail } from "@/lib/os/email-layout";
import { encodeGmailRaw } from "@/lib/os/gmail-outbound.server";
import { EVENT_LABEL, recordSlug } from "@/lib/os/inquiry-desk";

const STUDIO_INBOX = "info@saysukii.com";

type InquiryEmailDetails = {
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
  const base = (origin ?? emailOrigin()).replace(/\/$/, "");
  if (base.includes("localhost") || base.includes("127.0.0.1")) return "https://inside.saysukii.com";
  return base;
}

export function inquiryReceivedHtml(details: InquiryEmailDetails, origin?: string) {
  const kind = inquiryKind(details.eventType);
  const requested = (origin ?? emailOrigin()).replace(/\/$/, "");
  const links = studioOrigin(requested);
  const assets = origin ? requested : links;
  return renderSaySukiiEmail({
    origin: assets,
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
      url: `${links}/pipeline/${recordSlug(details.clientName)}`,
    },
  });
}

function inquiryReceivedText(details: InquiryEmailDetails, origin?: string) {
  const kind = inquiryKind(details.eventType);
  const base = studioOrigin(origin);
  return [
    "someone wrote in",
    `a new ${kind} inquiry just arrived.`,
    `client: ${details.clientName}`,
    `email: ${details.email}`,
    `date: ${inquiryDate(details.eventDate)}`,
    `place: ${details.venue?.trim() || "to be decided"}`,
    `open it: ${base}/pipeline/${recordSlug(details.clientName)}`,
  ].join("\n");
}

function noticeRfc822(subject: string, html: string, text: string) {
  const boundary = "saysukii-notice";
  const headers = [
    `From: "Say Sukii" <${STUDIO_INBOX}>`,
    `To: ${STUDIO_INBOX}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString().replace(/UTC$/i, "GMT")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const plain = Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const markup = Buffer.from(html, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  return [
    headers.join("\r\n"),
    "",
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
    "",
  ].join("\r\n");
}

async function insertStudioNotice(raw: string) {
  const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
  const gmail = await getGmailPublicStatus();
  if (gmail.status !== "connected") return false;
  const accessToken = await validGmailAccessToken();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      raw: encodeGmailRaw(raw),
      labelIds: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
    }),
  });
  if (response.ok) return true;
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  console.error("[Inquiry email] inbox insert failed:", payload?.error?.message || response.status);
  return false;
}

export async function sendInquiryReceivedEmail(details: InquiryEmailDetails) {
  const subject = `someone wrote in · ${details.clientName}`;
  const html = inquiryReceivedHtml(details);
  const text = inquiryReceivedText(details);

  try {
    const placed = await insertStudioNotice(noticeRfc822(subject, html, text));
    if (placed) return { sent: true as const };
  } catch (error) {
    console.error("[Inquiry email] inbox insert failed:", error);
  }

  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: false as const };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii OS <onboarding@resend.dev>",
      to: STUDIO_INBOX,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[Inquiry email]", error.message);
      return { sent: false as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("[Inquiry email]", error);
    return { sent: false as const };
  }
}
