/**
 * The words of every letter the studio sends a client. Each one starts as the app's own and the
 * studio can rewrite it in the templates section; what's saved there is exactly what sends.
 */
export type EmailTemplateId =
  | "connect"
  | "after-meeting"
  | "proposal"
  | "invoice"
  | "balance-invoice"
  | "booked"
  | "paid-in-full"
  | "balance-soon"
  | "balance-today"
  | "call-booked";

/** "write": the studio picks it in the composer. "preview": it opens to be checked first. "automatic": it sends itself. */
export type EmailTemplateGroup = "write" | "preview" | "automatic";

export type EmailTemplate = {
  id: EmailTemplateId;
  subject: string;
  /** the big line at the top of a designed email; letters written in the composer have none */
  headline: string;
  body: string;
};

export type EmailTemplateInfo = EmailTemplate & {
  name: string;
  group: EmailTemplateGroup;
  /** when it goes out */
  when: string;
  /** the placeholders it fills in */
  fills: string[];
  /** false for a letter written in the composer, which has no headline */
  designed: boolean;
  /** the studio has saved its own words for it */
  saved?: boolean;
};

export const EMAIL_TEMPLATE_GROUPS: Array<{ id: EmailTemplateGroup; label: string }> = [
  { id: "write", label: "letters you write" },
  { id: "preview", label: "checked before sending" },
  { id: "automatic", label: "sent on their own" },
];

export const EMAIL_TEMPLATES: EmailTemplateInfo[] = [
  {
    id: "connect",
    name: "let's connect!",
    group: "write",
    when: "pick it in the conversation",
    fills: ["{name}", "{calendar}"],
    designed: false,
    subject: "let's connect!",
    headline: "",
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
    group: "write",
    when: "pick it in the conversation",
    fills: ["{name}", "{{job.title}}"],
    designed: false,
    subject: "thank you for connecting!",
    headline: "",
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
    group: "preview",
    when: "emailing the proposal",
    fills: ["{name}", "{{job.title}}"],
    designed: false,
    subject: "your proposal",
    headline: "",
    body: "{name} —\n\nyour proposal is ready. it holds the flowers, the scale, and the investment for the day.",
  },
  {
    id: "invoice",
    name: "your invoice",
    group: "preview",
    when: "sending an invoice from the invoice tab · the pay button is added below it",
    fills: ["{name}", "{invoice}"],
    designed: false,
    subject: "your invoice · {invoice}",
    headline: "",
    body: [
      "hi {name},",
      "",
      "your invoice is ready. you can view the details and pay securely right from the link below.",
      "",
      "thank you so much!",
    ].join("\n"),
  },
  {
    id: "balance-invoice",
    name: "your remaining balance",
    group: "preview",
    when: "send invoice link, on a signed proposal",
    fills: ["{name}", "{occasion}", "{due}", "{invoice}"],
    designed: true,
    subject: "your remaining balance · {invoice}",
    headline: "your remaining balance",
    body: "hi {name}, here's the invoice for the remaining balance for your {occasion}, due {due}. you can pay it right from your invoice.",
  },
  {
    id: "booked",
    name: "your project is booked",
    group: "automatic",
    when: "once the deposit (or the full amount) is paid · with the proposal, signed agreement + receipt",
    fills: ["{name}", "{invoice}", "{occasion}"],
    designed: true,
    subject: "your project is booked · receipt for {invoice}",
    headline: "your project is booked",
    body: [
      "thank you, {name}. your project is on the books.",
      "",
      "your proposal, signed service agreement + receipt are attached for your records. we'll be in touch soon with next steps.",
    ].join("\n"),
  },
  {
    id: "paid-in-full",
    name: "thank you",
    group: "automatic",
    when: "once the remaining balance is paid · with the receipt",
    fills: ["{name}", "{invoice}", "{occasion}"],
    designed: true,
    subject: "thank you · receipt for {invoice}",
    headline: "thank you",
    body: "thank you, {name}. your receipt is attached.",
  },
  {
    id: "balance-soon",
    name: "a gentle reminder",
    group: "automatic",
    when: "five days before the balance is due",
    fills: ["{name}", "{occasion}", "{due}", "{invoice}"],
    designed: true,
    subject: "a gentle reminder · your balance for {invoice}",
    headline: "your balance is due soon",
    body: "hi {name}, a gentle reminder that the remaining balance for your {occasion} is due {due}, 30 days before the big day.",
  },
  {
    id: "balance-today",
    name: "due today",
    group: "automatic",
    when: "the day the balance is due",
    fills: ["{name}", "{occasion}", "{due}", "{invoice}"],
    designed: true,
    subject: "due today · your balance for {invoice}",
    headline: "your balance is due today",
    body: "hi {name}, the remaining balance for your {occasion} is due today, 30 days before the big day. you can pay it right from your invoice.",
  },
  {
    id: "call-booked",
    name: "you're booked",
    group: "automatic",
    when: "when someone books a call · with the meeting attached",
    fills: ["{name}", "{when}"],
    designed: true,
    subject: "you’re booked · {when}",
    headline: "you're booked",
    body: [
      "thank you for making time. looking forward to connecting with you soon! <3",
      "",
      "if this is an event or wedding -- in our initial consultation, we will discuss your overall vision and needs to follow up with an accurate proposal quote.",
      "",
      "please have any inspiration images you have readily available for our meeting. you may also email them to info@saysukii.com.",
    ].join("\n"),
  },
];

const TEMPLATE_IDS = new Set<string>(EMAIL_TEMPLATES.map((item) => item.id));

export function isEmailTemplateId(value: string): value is EmailTemplateId {
  return TEMPLATE_IDS.has(value);
}

export function defaultEmailTemplate(id: EmailTemplateId): EmailTemplateInfo {
  return EMAIL_TEMPLATES.find((item) => item.id === id)!;
}

/** every template, with the studio's saved words over the app's own */
export function mergeEmailTemplates(
  saved: ReadonlyArray<Partial<Omit<EmailTemplate, "id">> & { id: string }>,
): EmailTemplateInfo[] {
  const byId = new Map(saved.map((item) => [item.id, item]));
  return EMAIL_TEMPLATES.map((item) => {
    const mine = byId.get(item.id);
    if (!mine?.body?.trim()) return { ...item };
    return {
      ...item,
      saved: true,
      subject: mine.subject?.trim() || item.subject,
      headline: item.designed ? mine.headline?.trim() || item.headline : "",
      body: mine.body,
    };
  });
}

export function templateFirstName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export type TemplateValues = Partial<
  Record<"name" | "job" | "calendar" | "invoice" | "occasion" | "due" | "when", string>
>;

/** fills in a template's placeholders; one it has no value for stays as written */
export function fillTemplate(text: string, values: TemplateValues) {
  return text.replace(
    /\{\{job\.title\}\}|\{(name|calendar|invoice|occasion|due|when)\}/g,
    (found, key) => {
      const value = key ? values[key as keyof TemplateValues] : values.job;
      return value ?? found;
    },
  );
}

/** a template's subject, headline, and words, filled in */
export function templateWords(template: EmailTemplate, values: TemplateValues) {
  return {
    subject: fillTemplate(template.subject, values),
    headline: fillTemplate(template.headline, values),
    body: fillTemplate(template.body, values),
  };
}

/**
 * The fixed start of a subject, up to its first placeholder: "your project is booked · receipt for".
 * Gmail routing uses it to know a letter the app sent on its own.
 */
export function subjectStart(subject: string) {
  return subject.split(/\{/)[0]!.trim();
}
