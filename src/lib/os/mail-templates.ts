import { scheduleMeetingUrl } from "@/lib/studio-bookings";

export type MailTemplate = {
  id: string;
  name: string;
  body: string;
  subject?: string;
};

const STORAGE_KEY = "say-sukii-mail-templates";

export const BUILT_IN_TEMPLATES: MailTemplate[] = [
  {
    id: "connect",
    name: "let's connect!",
    subject: "let's connect!",
    body: [
      "hi {name},",
      "",
      "thanks again for reaching out! at this time we are available and would love to connect and learn more about your floral needs.",
      "",
      "feel free to schedule time for us to meet at your earliest convenience using my {calendar} — or if you're ready to dive in here, please reply to this email with any project details and inspiration photos to get us started.",
      "",
      "looking forward to it!",
      "",
      "<3",
    ].join("\n"),
  },
  {
    id: "after-meeting",
    name: "thank you for connecting!",
    subject: "thank you for connecting!",
    body: [
      "hi {name},",
      "",
      "it was such a pleasure connecting with you and learning more about {{job.title}}. thank you for sharing your vision—i’m truly excited about all that we’ll create together.",
      "",
      "as discussed, i’ll begin curating a floral proposal tailored to everything we covered along with booking details to secure services and move forward. you can expect to receive it within the next few days.",
      "",
      "in the meantime, if any new ideas, inspiration, or questions come up, please feel free to send them my way.",
      "",
      "<3",
    ].join("\n"),
  },
  {
    id: "proposal",
    name: "your proposal",
    subject: "your proposal",
    body: "{name} —\n\nyour proposal is ready. it holds the flowers, the scale, and the investment for the day.",
  },
];

const PREVIOUS_TEMPLATE_BODIES: Record<string, string> = {
  connect: [
    "Hi {name},",
    "",
    "Thanks again for reaching out! At this time we are available and would love to connect and learn more about your floral needs.",
    "",
    "Feel free to schedule time for us to meet at your earliest convenience using my {calendar} — or if you're ready to dive in here, please reply to this email with any project details and inspiration photos to get us started.",
    "",
    "Looking forward to it!",
    "",
    "<3",
  ].join("\n"),
  "after-meeting": [
    "Hi {name},",
    "",
    "It was such a pleasure connecting with you and learning more about {{job.title}}. Thank you for sharing your vision—I’m truly excited about all that we’ll create together.",
    "",
    "As discussed, I’ll begin curating a floral proposal tailored to everything we covered along with booking details to secure services and move forward. You can expect to receive it within the next few days.",
    "",
    "In the meantime, if any new ideas, inspiration, or questions come up, please feel free to send them my way.",
    "",
    "<3",
  ].join("\n"),
  proposal: "{name} —\n\nYour proposal is ready. It holds the flowers, the scale, and the investment for the day.",
};

function readStored(): MailTemplate[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MailTemplate[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadTemplates(): MailTemplate[] {
  const kept = new Set(BUILT_IN_TEMPLATES.map((item) => item.id));
  const saved = readStored()?.filter((item) => kept.has(item.id)) ?? null;
  if (!saved?.length) return BUILT_IN_TEMPLATES.map((item) => ({ ...item }));
  const builtIn = new Map(BUILT_IN_TEMPLATES.map((item) => [item.id, item]));
  const known = new Set(saved.map((item) => item.id));
  const added = BUILT_IN_TEMPLATES.filter((item) => !known.has(item.id)).map((item) => ({ ...item }));
  const current = saved.map((item) => {
    const fresh = builtIn.get(item.id);
    if (!fresh) return item;
    if (item.body !== PREVIOUS_TEMPLATE_BODIES[item.id]) return item;
    return { ...item, name: fresh.name, subject: fresh.subject, body: fresh.body };
  });
  return [...added, ...current];
}

export function saveTemplates(templates: MailTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function templateFirstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || "there";
}

function jobPhrase(job: string | null | undefined) {
  const value = job?.trim();
  if (!value || value.toLowerCase() === "other") return "your flowers";
  if (/^your\b/i.test(value)) return value;
  return `your ${value}`;
}

export function applyTemplate(body: string, clientName?: string | null, job?: string | null) {
  const link = scheduleMeetingUrl();
  return body
    .replaceAll("{name}", templateFirstName(clientName))
    .replaceAll("{{job.title}}", jobPhrase(job))
    .replaceAll("{calendar}", `[calendar link](${link})`);
}
