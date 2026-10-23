import { emailOrigin } from "@/lib/os/email-layout";

export const CONNECT_SUBJECT = "Let's Connect!";

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function scheduleUrl(origin?: string) {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : emailOrigin());
  return `${base.replace(/\/$/, "")}/book`;
}

export function connectLetterBody(name: string, origin?: string) {
  const link = scheduleUrl(origin);
  return [
    `Hi ${firstName(name)},`,
    "",
    "Thanks again for reaching out! At this time we are available and would love to connect and learn more about your floral needs.",
    "",
    `Feel free to schedule time for us to meet at your earliest convenience using my [calendar link](${link}) — or if you're ready to dive in here, please reply to this email with any project details and inspiration photos to get us started.`,
    "",
    "Looking forward to it!",
    "",
    "<3",
  ].join("\n");
}

export function connectLetterPlain(name: string, origin?: string) {
  return connectLetterBody(name, origin).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
}
