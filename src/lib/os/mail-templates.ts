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
    name: "Let's Connect!",
    subject: "Let's Connect!",
    body: [
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
  },
  {
    id: "after-meeting",
    name: "Thank You For Connecting!",
    subject: "Thank You For Connecting!",
    body: [
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
  },
  {
    id: "proposal",
    name: "your proposal",
    body: "{name} —\n\nYour proposal is ready. It holds the flowers, the scale, and the investment for the day.",
  },
  {
    id: "thanks",
    name: "thank them",
    body: "{name} —\n\nThank you for writing. I'm with you on this, and I'll come back shortly with a clear next step.",
  },
  {
    id: "hold",
    name: "hold the date",
    body: "{name} —\n\nI'll hold the date. A first look at scale and palette will follow this week.",
  },
  {
    id: "look",
    name: "first look",
    body: "{name} —\n\nA first look is ready whenever you are. It covers palette, scale, and how the flowers move through the day.",
  },
  {
    id: "visit",
    name: "after the visit",
    body: "{name} —\n\nIt was lovely to walk the place with you. I'll shape what we talked about into a proposal.",
  },
  {
    id: "nudge",
    name: "a gentle nudge",
    body: "{name} —\n\nJust a note in case the proposal is still open on your side. I'm here when you're ready.",
  },
];

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
  const saved = readStored();
  if (!saved) return BUILT_IN_TEMPLATES.map((item) => ({ ...item }));
  const known = new Set(saved.map((item) => item.id));
  const added = BUILT_IN_TEMPLATES.filter((item) => !known.has(item.id)).map((item) => ({ ...item }));
  return [...added, ...saved];
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
