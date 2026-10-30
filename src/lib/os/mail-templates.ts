import { fillTemplate, templateFirstName, type EmailTemplate } from "@/lib/email-templates";
import { scheduleMeetingUrl } from "@/lib/studio-bookings";

// the templates once lived in the browser only; the preview still keeps them here
const STORAGE_KEY = "say-sukii-mail-templates";
const MOVED_KEY = "say-sukii-mail-templates-moved";

// what the letters said before they were lowercased, so an untouched copy isn't kept as an edit
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
  proposal:
    "{name} —\n\nYour proposal is ready. It holds the flowers, the scale, and the investment for the day.",
};

type StoredTemplate = Partial<Omit<EmailTemplate, "id">> & { id: string };

function readStored(): StoredTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as StoredTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** the templates saved in this browser (the preview's store) */
export function storedTemplates() {
  return readStored().filter(
    (item) => item.body?.trim() && item.body !== PREVIOUS_TEMPLATE_BODIES[item.id],
  );
}

export function storeTemplate(template: EmailTemplate) {
  const rest = readStored().filter((item) => item.id !== template.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...rest, template]));
}

export function unstoreTemplate(id: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readStored().filter((item) => item.id !== id)));
}

/** letters edited in this browser before templates were saved for the studio, once */
export function templatesToMove(): StoredTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    if (localStorage.getItem(MOVED_KEY)) return [];
  } catch {
    return [];
  }
  return storedTemplates();
}

export function markTemplatesMoved() {
  try {
    localStorage.setItem(MOVED_KEY, "1");
  } catch {
    // nothing to remember it in
  }
}

function jobPhrase(job: string | null | undefined) {
  const value = job?.trim();
  if (!value || value.toLowerCase() === "other") return "your flowers";
  if (/^your\b/i.test(value)) return value;
  return `your ${value}`;
}

/** a letter written in the composer, its placeholders filled in */
export function applyTemplate(body: string, clientName?: string | null, job?: string | null) {
  return fillTemplate(body, {
    name: templateFirstName(clientName),
    job: jobPhrase(job),
    calendar: `[calendar link](${scheduleMeetingUrl()})`,
  });
}
