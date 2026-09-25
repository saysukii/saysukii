import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import {
  ARRANGEMENT_SIZES,
  EVENT_BUDGETS,
  EVENT_SETTING_OPTIONS,
  INTEREST_OPTIONS,
  SOURCE_OPTIONS,
  WEDDING_BUDGETS,
  interestLabel,
} from "@/lib/os/inquiry-schema";

export type InquiryChoiceOption = { value: string; label: string };

type StepBase = {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
};

export type InquiryStep =
  | (StepBase & {
      kind: "text" | "email" | "tel";
      field: "name" | "email" | "phone" | "recipient";
      placeholder: string;
    })
  | (StepBase & {
      kind: "textarea";
      field: "message";
      placeholder: string;
    })
  | (StepBase & {
      kind: "date";
      field: "event_date";
    })
  | (StepBase & {
      kind: "address";
      field: "venue_text";
      placeholder: string;
    })
  | (StepBase & {
      kind: "choice";
      field: "interest" | "event_setting" | "arrangement_size" | "budget_range";
      options: InquiryChoiceOption[];
    })
  | (StepBase & {
      kind: "multi";
      field: "sources";
      options: InquiryChoiceOption[];
    })
  | (StepBase & { kind: "review"; field?: never });

export function buildInquirySteps(interest: InquiryFormValues["interest"]): InquiryStep[] {
  const sharedStart: InquiryStep[] = [
    {
      id: "name",
      kind: "text",
      field: "name",
      label: "What’s your name?",
      placeholder: "Type your full name",
      required: true,
    },
    {
      id: "email",
      kind: "email",
      field: "email",
      label: "What’s the best email to reach you?",
      placeholder: "you@email.com",
      required: true,
    },
    {
      id: "phone",
      kind: "tel",
      field: "phone",
      label: "What’s a good phone number?",
      placeholder: "(305) 555-0100",
      required: true,
    },
    {
      id: "interest",
      kind: "choice",
      field: "interest",
      label: "I am interested in:",
      options: INTEREST_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      required: true,
    },
  ];

  const sourceAndReview: InquiryStep[] = [
    {
      id: "source",
      kind: "multi",
      field: "sources",
      label: "How did you hear about us?",
      options: SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      required: true,
      hint: "just so i know how you found the studio — pick any that are true.",
    },
    { id: "review", kind: "review", label: "are you ready to move forward?" },
  ];

  const eventDate: InquiryStep = {
    id: "event_date",
    kind: "date",
    field: "event_date",
    label: "When is it — date and time?",
    required: true,
  };

  const venueOptional: InquiryStep = {
    id: "venue_text",
    kind: "address",
    field: "venue_text",
    label: "Where will it take place?",
    placeholder: "",
    required: false,
    optional: true,
    hint: "so i can picture the room and the drive.",
  };

  const vision: InquiryStep = {
    id: "message",
    kind: "textarea",
    field: "message",
    label: "Tell us about the vision.",
    placeholder: "Mood, flowers, scale — or a link to references.",
    required: true,
    hint: "a feeling, a few flowers, or a link — whatever helps me see it with you.",
  };

  if (!interest) return sharedStart;

  if (interest === "events") {
    return [
      ...sharedStart,
      {
        id: "event_setting",
        kind: "choice",
        field: "event_setting",
        label: "Is this a private or corporate event?",
        options: EVENT_SETTING_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "so i know the tone — a dinner at home vs a brand in a room.",
      },
      eventDate,
      venueOptional,
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "What budget range feels right?",
        options: EVENT_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "events typically start around $1,000.",
      },
      vision,
      ...sourceAndReview,
    ];
  }

  if (interest === "weddings") {
    return [
      ...sharedStart,
      {
        ...eventDate,
        label: "When is the wedding — date and time?",
        hint: "even a season is enough if the day isn’t set.",
      },
      venueOptional,
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "What budget range feels right?",
        options: WEDDING_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "full-service weddings typically start at $6,000.",
      },
      vision,
      ...sourceAndReview,
    ];
  }

  if (interest === "deliveries") {
    return [
      ...sharedStart,
      {
        id: "arrangement_size",
        kind: "choice",
        field: "arrangement_size",
        label: "Which size feels right?",
        options: ARRANGEMENT_SIZES.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "i choose the stems — you’re choosing the scale.",
      },
      {
        ...eventDate,
        label: "When should it arrive — date and time?",
        hint: "wed–fri, 10am–2pm in miami-dade and broward.",
      },
      {
        id: "venue_text",
        kind: "address",
        field: "venue_text",
        label: "Where should we deliver?",
        placeholder: "",
        required: true,
        hint: "the door it should go to. delivery is +$25–$40 in miami-dade and broward.",
      },
      {
        id: "recipient",
        kind: "text",
        field: "recipient",
        label: "Who is it for?",
        placeholder: "Recipient name",
        required: true,
        hint: "for the card, and so the front desk knows who it’s for.",
      },
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "Any notes for the arrangement?",
        placeholder: "Occasion, colors, flowers, or a short card message.",
        required: true,
        hint: "a card message, colors you love, or flowers to lean toward.",
      },
      ...sourceAndReview,
    ];
  }

  if (interest === "subscriptions") {
    return [
      ...sharedStart,
      {
        ...eventDate,
        label: "When would you like to start — date and time?",
        hint: "we can always shift this once we talk.",
      },
      {
        id: "venue_text",
        kind: "address",
        field: "venue_text",
        label: "Where should we deliver?",
        placeholder: "",
        required: false,
        optional: true,
        hint: "home, office, or wherever you want flowers to land.",
      },
      {
        ...vision,
        label: "What are you hoping for?",
        placeholder: "Cadence, colors, vibe — whatever helps.",
        hint: "how often, what colors, how wild — so i know the rhythm.",
      },
      ...sourceAndReview,
    ];
  }

  if (interest === "set_design") {
    return [
      ...sharedStart,
      {
        ...eventDate,
        label: "When is the shoot or install — date and time?",
        hint: "the day we’re in the room — not when the mood board is due.",
      },
      venueOptional,
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "What budget range feels right?",
        options: EVENT_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "so i can sketch something that actually fits.",
      },
      vision,
      ...sourceAndReview,
    ];
  }

  return [...sharedStart, ...sourceAndReview];
}

export function inquiryFirstName(name: string) {
  const token = name.trim().split(/\s+/).find(Boolean) ?? "";
  return token.replace(/[.,!?]+$/g, "");
}

export function personalizeInquiryLabel(step: InquiryStep, firstName: string) {
  if (!firstName || step.id === "name") return step.label;

  switch (step.id) {
    case "email":
      return `hi ${firstName}, what’s the best email to reach you?`;
    case "phone":
      return "and a good phone number?";
    case "interest":
      return `what are you interested in, ${firstName}?`;
    case "event_setting":
      return "is this a private or corporate event?";
    case "event_date":
      if (/wedding/i.test(step.label)) return `${firstName}, when is the wedding — date and time?`;
      if (/arrive/i.test(step.label)) return "when should it arrive — date and time?";
      if (/start/i.test(step.label)) return `when would you like to start, ${firstName}?`;
      if (/shoot|install/i.test(step.label)) return "when is the shoot or install — date and time?";
      return `${firstName}, when is it — date and time?`;
    case "venue_text":
      if (/deliver/i.test(step.label)) return "where should we deliver?";
      return "and where will it take place?";
    case "budget_range":
      return "what budget range feels right?";
    case "arrangement_size":
      return `which size feels right, ${firstName}?`;
    case "recipient":
      return "who is it for?";
    case "message":
      if (/hoping/i.test(step.label)) return `what are you hoping for, ${firstName}?`;
      if (/notes/i.test(step.label)) return "any notes for the arrangement?";
      return `tell us about the vision, ${firstName}.`;
    case "source":
      return "how did you hear about us?";
    case "review":
      return "are you ready to move forward?";
    default:
      return step.label;
  }
}

export function personalizeInquiryHelp(step: InquiryStep, _firstName: string) {
  if (step.kind === "review") return undefined;
  return "hint" in step ? step.hint : undefined;
}

export const FALLBACK_INQUIRY_STEP: InquiryStep = {
  id: "name",
  kind: "text",
  field: "name",
  label: "What’s your name?",
  placeholder: "Type your full name",
  required: true,
};

export function isInquiryEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function inquiryPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

export function isInquiryPhone(value: string) {
  return inquiryPhoneDigits(value).length === 10;
}

export function formatInquiryPhone(value: string) {
  const digits = inquiryPhoneDigits(value);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatInquiryDate(values: InquiryFormValues) {
  if (values.event_date_tbd) return "TBD";
  if (!values.event_date) return "";
  const day = new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
    new Date(`${values.event_date}T12:00:00`),
  );
  return values.event_time ? `${day} · ${values.event_time}` : day;
}

export function formatStepAnswer(step: InquiryStep, values: InquiryFormValues) {
  if (step.kind === "review") return "";
  if (step.kind === "date") return formatInquiryDate(values) || "";
  if (step.kind === "multi") {
    return (values.sources ?? [])
      .map((value) => step.options.find((option) => option.value === value)?.label ?? value)
      .join(", ");
  }
  if (step.kind === "choice") {
    const raw = String(values[step.field] ?? "");
    return step.options.find((option) => option.value === raw)?.label ?? (step.field === "interest" ? interestLabel(values.interest ?? "") : raw);
  }
  return String(values[step.field] ?? "").trim();
}

export function isStepComplete(step: InquiryStep, values: InquiryFormValues) {
  if (step.kind === "review") return true;
  if (step.optional) return true;
  if (step.kind === "date") return values.event_date_tbd || (Boolean(values.event_date) && Boolean(values.event_time));
  if (step.kind === "multi") return (values.sources?.length ?? 0) > 0;
  if (step.kind === "email") return isInquiryEmail(values.email);
  if (step.kind === "tel") return isInquiryPhone(values.phone);
  if (step.kind === "choice") return Boolean(String(values[step.field] ?? "").trim());
  return String(values[step.field] ?? "").trim().length > 0;
}
