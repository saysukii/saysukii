import { inboundAsk, senderEmail } from "@/lib/os/inquiry-mail";

/** A past human decision the inbox can imitate. */
export type InquiryLesson = {
  label: "accepted" | "skipped";
  from: string | null;
  subject: string | null;
  text: string;
};

const STOP = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "from",
  "have",
  "here",
  "just",
  "like",
  "more",
  "that",
  "them",
  "then",
  "they",
  "this",
  "with",
  "would",
  "your",
  "youre",
  "hello",
  "thanks",
  "thank",
  "please",
  "sukii",
  "saysukii",
]);

const COMMON_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "live.com",
]);

export function makeLesson(input: {
  accepted: boolean;
  from?: string | null | undefined;
  subject?: string | null | undefined;
  body?: string | null | undefined;
}): InquiryLesson | null {
  const text = inboundAsk(input.subject, input.body).slice(0, 500);
  const from = input.from?.trim() || null;
  if (!text && !from) return null;
  return {
    label: input.accepted ? "accepted" : "skipped",
    from,
    subject: input.subject?.trim() || null,
    text,
  };
}

function hostOf(from: string | null | undefined) {
  const email = senderEmail(from);
  const host = email.split("@")[1] ?? "";
  if (!host || COMMON_DOMAINS.has(host)) return null;
  return host;
}

function tokens(text: string) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
  return new Set(words);
}

function overlap(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  if (shared < 2) return 0;
  return shared / Math.min(left.size, right.size);
}

export function lessonVerdict(
  mail: {
    from?: string | null | undefined;
    subject?: string | null | undefined;
    body?: string | null | undefined;
  },
  lessons: InquiryLesson[],
): "accept" | "skip" | "unsure" {
  if (lessons.length === 0) return "unsure";
  const host = hostOf(mail.from);
  const mailTokens = tokens(inboundAsk(mail.subject, mail.body));
  let bestAccept = 0;
  let bestSkip = 0;
  let domainAccept = false;
  let domainSkip = false;
  for (const lesson of lessons) {
    const lessonHost = hostOf(lesson.from);
    if (host && lessonHost === host) {
      if (lesson.label === "accepted") domainAccept = true;
      else domainSkip = true;
    }
    const score = overlap(mailTokens, tokens(`${lesson.subject ?? ""}\n${lesson.text}`));
    if (lesson.label === "accepted") bestAccept = Math.max(bestAccept, score);
    else bestSkip = Math.max(bestSkip, score);
  }
  if (domainSkip && !domainAccept) return "skip";
  if (domainAccept && !domainSkip) return "accept";
  if (bestSkip >= 0.5 && bestSkip > bestAccept + 0.1) return "skip";
  if (bestAccept >= 0.5 && bestAccept >= bestSkip) return "accept";
  return "unsure";
}
