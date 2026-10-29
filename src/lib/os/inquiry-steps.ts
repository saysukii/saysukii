import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import {
  ARRANGEMENT_SIZES,
  CADENCE_OPTIONS,
  EVENT_BUDGETS,
  EVENT_SETTING_OPTIONS,
  INTEREST_OPTIONS,
  SOURCE_OPTIONS,
  SPACE_OPTIONS,
  WEDDING_BUDGETS,
  interestLabel,
} from "@/lib/os/inquiry-schema";

export type InquiryChoiceOption = { value: string; label: string };

type StepBase = {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string | undefined;
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
      maxLength?: number;
    })
  | (StepBase & {
      kind: "date";
      field: "event_date";
      withTime?: boolean;
    })
  | (StepBase & {
      kind: "address";
      field: "venue_text";
      placeholder: string;
    })
  | (StepBase & {
      kind: "choice";
      field:
        "interest" | "event_setting" | "arrangement_size" | "budget_range" | "space" | "cadence";
      options: InquiryChoiceOption[];
      otherField?: "space_other" | "cadence_other";
      otherPlaceholder?: string;
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

  const review: InquiryStep = {
    id: "review",
    kind: "review",
    label: "are you ready to move forward?",
  };

  function sourceStep(label: string, hint: string): InquiryStep {
    return {
      id: "source",
      kind: "multi",
      field: "sources",
      label,
      options: SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      required: true,
      hint,
    };
  }

  const eventDate: InquiryStep = {
    id: "event_date",
    kind: "date",
    field: "event_date",
    label: "When is it — date and time?",
    required: true,
    withTime: true,
  };

  const venueOptional: InquiryStep = {
    id: "venue_text",
    kind: "address",
    field: "venue_text",
    label: "Where will it take place?",
    placeholder: "",
    required: false,
    optional: true,
  };

  const visionHint =
    "a feeling, a few floral varieties you love, or a link — whatever helps me see it with you!";

  if (!interest) return sharedStart;

  if (interest === "events") {
    return [
      ...sharedStart,
      {
        id: "event_setting",
        kind: "choice",
        field: "event_setting",
        label: "Is this a private or corporate event?",
        options: EVENT_SETTING_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        })),
        required: true,
        hint: "so we understand the tone — a dinner at home vs a brand in a room?",
      },
      eventDate,
      { ...venueOptional, label: "Where will it take place? venue/location?" },
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "what is your budget?",
        options: EVENT_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "minimum investment for events + activations is $1,000.",
      },
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "Tell us about the vision.",
        placeholder: "Mood, flowers, scale — or a link to references.",
        required: true,
        hint: visionHint,
      },
      sourceStep("How did you hear about us?", "pick any that are true."),
      review,
    ];
  }

  if (interest === "weddings") {
    return [
      ...sharedStart,
      {
        ...eventDate,
        label: "what date is the wedding?",
        hint: undefined,
        withTime: false,
      },
      { ...venueOptional, label: "what is the venue/location?" },
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "what is your budget?",
        options: WEDDING_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "minimum investment for full-service weddings start at $6,000.",
      },
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "please share a little about the vision",
        placeholder: "A feeling, a few varieties, or a link.",
        required: true,
        hint: visionHint,
      },
      sourceStep("how did you hear about us?", "pick any that are true"),
      review,
    ];
  }

  if (interest === "deliveries") {
    return [
      ...sharedStart,
      {
        id: "arrangement_size",
        kind: "choice",
        field: "arrangement_size",
        label: "what size feels best?",
        options: ARRANGEMENT_SIZES.map((option) => ({ value: option.value, label: option.label })),
        required: true,
      },
      {
        ...eventDate,
        label: "When should it arrive?",
        hint: "we need at least 48 hours advance notice to approve delivery request. we deliver on wed–fri, 10am–2pm in most of miami-dade and broward county",
        withTime: false,
      },
      {
        id: "venue_text",
        kind: "address",
        field: "venue_text",
        label: "what is the delivery address?",
        placeholder: "",
        required: true,
        hint: "delivery $35 additional, pick up option available",
      },
      {
        id: "recipient",
        kind: "text",
        field: "recipient",
        label: "what is the recipient's name?",
        placeholder: "Recipient name",
        required: true,
      },
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "would you like to add a small card? please include message here.",
        placeholder: "",
        required: false,
        optional: true,
        maxLength: 160,
        hint: "think short + sweet like a tweet (160 characters ish or less)",
      },
      sourceStep("How did you hear about us?", "pick any that are true."),
      review,
    ];
  }

  if (interest === "subscriptions") {
    return [
      ...sharedStart,
      {
        id: "space",
        kind: "choice",
        field: "space",
        label: "what space are we activating?",
        options: SPACE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
        otherField: "space_other",
        otherPlaceholder: "tell us the space",
        required: true,
      },
      {
        ...eventDate,
        label: "What date would you like to start?",
        hint: "we can always shift this after our consultation.",
        withTime: false,
      },
      {
        id: "cadence",
        kind: "choice",
        field: "cadence",
        label: "how often would you like to refresh your space?",
        options: CADENCE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
        otherField: "cadence_other",
        otherPlaceholder: "tell us how often",
        required: true,
      },
      sourceStep("How did you hear about us?", "pick any that are true."),
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "Is there anything else you'd like to share?",
        placeholder: "",
        required: false,
        optional: true,
      },
      review,
    ];
  }

  if (interest === "set_design") {
    return [
      ...sharedStart,
      {
        ...eventDate,
        label: "what date is the shoot or installation?",
        hint: undefined,
        withTime: false,
      },
      { ...venueOptional, label: "Where will it take place -- venue/location?" },
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "what is your working budget?",
        options: EVENT_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
      },
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "please Tell us about the vision.",
        placeholder: "A feeling, a few varieties, or a link.",
        required: true,
        hint: visionHint,
      },
      sourceStep("How did you hear about us?", "pick any that are true."),
      review,
    ];
  }

  return [
    ...sharedStart,
    sourceStep("How did you hear about us?", "pick any that are true."),
    review,
  ];
}

export function inquiryFirstName(name: string) {
  const token = name.trim().split(/\s+/).find(Boolean) ?? "";
  return token.replace(/[.,!?]+$/g, "");
}

export function personalizeInquiryLabel(step: InquiryStep, _firstName: string) {
  return step.label;
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
  const dates = [values.event_date, ...(values.event_dates ?? [])].filter((date): date is string =>
    Boolean(date),
  );
  if (!dates.length) return "";
  const days = dates.map((date) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(`${date}T12:00:00`)),
  );
  const day = days.join(", ");
  return values.event_time && days.length === 1 ? `${day} · ${values.event_time}` : day;
}

export function formatStepAnswer(step: InquiryStep, values: InquiryFormValues) {
  if (step.kind === "review") return "";
  if (step.kind === "date") return formatInquiryDate(values) || "";
  if (step.field === "venue_text" && values.venue_tbd) return "TBD";
  if (step.kind === "multi") {
    return (values.sources ?? [])
      .map((value) => step.options.find((option) => option.value === value)?.label ?? value)
      .join(", ");
  }
  if (step.kind === "choice") {
    const raw = String(values[step.field] ?? "");
    const label =
      step.options.find((option) => option.value === raw)?.label ??
      (step.field === "interest" ? interestLabel(values.interest ?? "") : raw);
    if (step.otherField && raw === "other") {
      const detail = String(values[step.otherField] ?? "").trim();
      return detail ? `${label} — ${detail}` : label;
    }
    return label;
  }
  return String(values[step.field] ?? "").trim();
}

export function isStepComplete(step: InquiryStep, values: InquiryFormValues) {
  if (step.kind === "review") return true;
  if (step.optional) return true;
  if (step.kind === "date") {
    if (values.event_date_tbd) return true;
    if (!values.event_date) return false;
    return step.withTime === false || Boolean(values.event_time);
  }
  if (step.kind === "multi") return (values.sources?.length ?? 0) > 0;
  if (step.kind === "email") return isInquiryEmail(values.email);
  if (step.kind === "tel") return isInquiryPhone(values.phone);
  if (step.kind === "choice") {
    const value = String(values[step.field] ?? "").trim();
    if (!value) return false;
    if (step.otherField && value === "other")
      return String(values[step.otherField] ?? "").trim().length > 0;
    return true;
  }
  return String(values[step.field] ?? "").trim().length > 0;
}
