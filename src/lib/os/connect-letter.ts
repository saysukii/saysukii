import { scheduleMeetingUrl } from "@/lib/studio-bookings";

export const CONNECT_SUBJECT = "let's connect!";

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function scheduleUrl() {
  return scheduleMeetingUrl();
}

export function connectLetterBody(name: string, _origin?: string) {
  const link = scheduleUrl();
  return [
    `hi ${firstName(name)},`,
    "",
    "thanks again for reaching out! at this time we are available and would love to connect and learn more about your floral needs.",
    "",
    `feel free to schedule time for us to meet at your earliest convenience using my [calendar link](${link}) — or if you're ready to dive in here, please reply to this email with any project details and inspiration photos to get us started.`,
    "",
    "looking forward to it!",
    "",
    "<3",
  ].join("\n");
}

export function connectLetterPlain(name: string, origin?: string) {
  return connectLetterBody(name, origin).replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    "$1 ($2)",
  );
}
