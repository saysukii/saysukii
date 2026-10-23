import { Resend } from "resend";

import type { EventType } from "@/integrations/supabase/types";
import { emailOrigin, renderSaySukiiEmail } from "@/lib/os/email-layout";
import { EVENT_LABEL, recordSlug } from "@/lib/os/inquiry-desk";

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

export function inquiryReceivedHtml(details: InquiryEmailDetails, origin?: string) {
  const kind = inquiryKind(details.eventType);
  const base = origin ?? emailOrigin();
  return renderSaySukiiEmail({
    origin: base,
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
      url: `${base}/pipeline/${recordSlug(details.clientName)}`,
    },
  });
}

export async function sendInquiryReceivedEmail(details: InquiryEmailDetails) {
  const apiKey = process.env["RESEND_API_KEY"];
  const to = process.env["INQUIRY_NOTIFICATION_EMAIL"] ?? process.env["RESEND_TO_EMAIL"];

  if (!apiKey || !to) return { sent: false as const };

  try {
    const resend = new Resend(apiKey);
    const kind = inquiryKind(details.eventType);
    const { error } = await resend.emails.send({
      from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii OS <onboarding@resend.dev>",
      to,
      subject: `someone wrote in · ${details.clientName}`,
      html: inquiryReceivedHtml(details),
      text: [
        "someone wrote in",
        `a new ${kind} inquiry just arrived.`,
        `client: ${details.clientName}`,
        `email: ${details.email}`,
        `date: ${inquiryDate(details.eventDate)}`,
        `place: ${details.venue?.trim() || "to be decided"}`,
        `open it: ${emailOrigin()}/pipeline/${recordSlug(details.clientName)}`,
      ].join("\n"),
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
