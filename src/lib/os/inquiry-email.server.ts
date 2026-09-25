import { Resend } from "resend";

type InquiryEmailDetails = {
  clientName: string;
  email: string;
  eventDate: string | null;
  eventType: string;
  venue: string | null;
};

export async function sendInquiryReceivedEmail(details: InquiryEmailDetails) {
  const apiKey = process.env["RESEND_API_KEY"];
  const to = process.env["INQUIRY_NOTIFICATION_EMAIL"] ?? process.env["RESEND_TO_EMAIL"];

  if (!apiKey || !to) return { sent: false as const };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii OS <onboarding@resend.dev>",
      to,
      subject: `New inquiry from ${details.clientName}`,
      text: [
        `A new ${details.eventType.replaceAll("_", " ")} inquiry was received.`,
        `Client: ${details.clientName}`,
        `Email: ${details.email}`,
        `Event date: ${details.eventDate ?? "TBD"}`,
        `Venue: ${details.venue ?? "TBD"}`,
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
