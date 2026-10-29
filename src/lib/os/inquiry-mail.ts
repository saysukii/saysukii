/** Mail that can sit in needs review. Automated support and invitations stay out. */

const INQUIRY_CUES =
  /\b(weddings?|bridal|elopement|ceremony|reception|bouquets?|flowers?|floral|florist|arrangements?|centerpieces?|install(?:ation)?|subscriptions?|concierge|photoshoots?|styled shoots?|brand activations?)\b/i;

const AUTOMATED_LOCAL =
  /^(?:no-?reply|noreply|notifications?|mailer-daemon|bounce|newsletter|donotreply|do-not-reply|billing|receipts?)@/i;

const AUTOMATED_DOMAIN =
  /@(?:[\w.-]+\.)*(?:railway\.(?:app|com)|github\.com|eventbrite\.com|mailchimp\.com|stripe\.com|vercel\.com|supabase\.(?:com|io)|linear\.app|notion\.so|linkedin\.com|facebookmail\.com|instagram\.com|tiktok\.com|squareup\.com|square\.com|paypal\.com|amazon\.com|google\.com|accounts\.google\.com)$/i;

const NON_INQUIRY = /\b(?:you(?:'|’)re invited|rsvp)\b/i;

const HARD_NOISE =
  /\b(?:unsubscribe|newsletter|password reset|verify your email|your receipt|order confirmation|tracking number|out of office|automatic reply|mailer-daemon|deployment failed|build failed|support ticket|wholesale|partnership opportunity|railway|your payment|payment to|social toolkit|i built|we built|our app|our platform|book a demo)\b/i;

export function inboundAsk(subject: string | null | undefined, body: string | null | undefined) {
  let text = body ?? "";
  text = text.split(/\nOn [^\n]{0,160} wrote:\s*/i)[0] ?? text;
  text = text.split(/\n-----Original Message-----/i)[0] ?? text;
  text = text.split(/\nFrom: [^\n]+\nSent: /i)[0] ?? text;
  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(">")) return false;
    if (/floral artist|saysukii\.com/i.test(trimmed)) return false;
    return true;
  });
  return `${subject ?? ""}\n${lines.join("\n")}`.trim();
}

export function senderEmail(from: string | null | undefined) {
  const raw = (from ?? "").trim().toLowerCase();
  return raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0] ?? raw;
}

export function isAutomatedSender(from: string | null | undefined) {
  const email = senderEmail(from);
  if (!email || !email.includes("@")) return false;
  if (email.endsWith("@saysukii.com")) return true;
  return AUTOMATED_LOCAL.test(email) || AUTOMATED_DOMAIN.test(email);
}

export function hasInquiryCue(text: string) {
  return INQUIRY_CUES.test(text);
}

export function belongsInReview(input: {
  from?: string | null | undefined;
  subject?: string | null | undefined;
  body?: string | null | undefined;
  confidence?: number | null | undefined;
}) {
  if (isAutomatedSender(input.from)) return false;
  const text = inboundAsk(input.subject, input.body);
  if (HARD_NOISE.test(text)) return false;
  const asked = hasInquiryCue(text);
  if (NON_INQUIRY.test(text) && !asked) return false;
  if (asked) return true;
  return (input.confidence ?? 0) >= 0.75;
}
