import type { ClientType, EventType } from "@/integrations/supabase/types";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";

export type InquiryInterest =
  | "weddings"
  | "events"
  | "deliveries"
  | "subscriptions"
  | "set_design";

export const INTEREST_OPTIONS: Array<{
  value: InquiryInterest;
  label: string;
  eventType: EventType;
}> = [
  { value: "weddings", label: "Weddings", eventType: "wedding" },
  { value: "events", label: "Events + activations", eventType: "brand_activation" },
  { value: "deliveries", label: "Deliveries", eventType: "other" },
  { value: "subscriptions", label: "Subscriptions", eventType: "subscription" },
  { value: "set_design", label: "Set design + styling", eventType: "photoshoot" },
];

export const EVENT_SETTING_OPTIONS = [
  { value: "private", label: "Private event" },
  { value: "corporate", label: "Corporate event" },
] as const;

export const SOURCE_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "the streets", label: "The streets" },
  { value: "google search", label: "Google search" },
  { value: "returning client", label: "Returning client" },
  { value: "referral", label: "Referral" },
] as const;

export const ARRANGEMENT_SIZES = [
  { value: "$175 — love (petite)", label: "$175 — love (petite)" },
  { value: "$275 — lovee (standard)", label: "$275 — lovee (standard)" },
  { value: "$375 — loveee (large)", label: "$375 — loveee (large)" },
  { value: "$475 — loveeee (x-large)", label: "$475 — loveeee (x-large)" },
] as const;

export const WEDDING_BUDGETS = [
  { value: "Under $6,000", label: "Under $6,000" },
  { value: "$6,000–$10,000", label: "$6,000–$10,000" },
  { value: "$10,000–$20,000", label: "$10,000–$20,000" },
  { value: "$20,000+", label: "$20,000+" },
] as const;

export const EVENT_BUDGETS = [
  { value: "Under $4,000", label: "Under $4,000" },
  { value: "$4,000–$6,000", label: "$4,000–$6,000" },
  { value: "$6,000–$10,000", label: "$6,000–$10,000" },
  { value: "$10,000–$20,000", label: "$10,000–$20,000" },
  { value: "$20,000+", label: "$20,000+" },
] as const;

export const EMPTY_INQUIRY_DRAFT: InquiryFormValues = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  client_type: "individual",
  event_date: null,
  event_date_tbd: false,
  event_time: "",
  event_type: "wedding",
  venue_text: "",
  guest_count: null,
  budget_range: "",
  source: "",
  message: "",
  website: "",
  interest: "",
  event_setting: "",
  arrangement_size: "",
  recipient: "",
  sources: [],
};

export function interestLabel(interest: InquiryInterest | "") {
  return INTEREST_OPTIONS.find((option) => option.value === interest)?.label ?? "Inquiry";
}

export function mapInquiryEventType(values: InquiryFormValues): EventType {
  if (values.interest === "events") {
    if (values.event_setting === "corporate") return "corporate";
    if (values.event_setting === "private") return "private";
    return "brand_activation";
  }
  return INTEREST_OPTIONS.find((option) => option.value === values.interest)?.eventType ?? "other";
}

export function mapInquiryClientType(values: InquiryFormValues): ClientType {
  if (values.event_setting === "corporate") return "corporate";
  if (values.interest === "set_design") return "brand";
  return "individual";
}

export function toInquirySubmitValues(values: InquiryFormValues): InquiryFormValues {
  const details = [
    values.arrangement_size ? `Size: ${values.arrangement_size}` : "",
    values.event_time ? `Time: ${values.event_time}` : "",
    values.recipient ? `Recipient: ${values.recipient}` : "",
    values.message.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    name: values.name,
    email: values.email,
    phone: values.phone,
    organization: "",
    client_type: mapInquiryClientType(values),
    event_date: values.event_date,
    event_date_tbd: values.event_date_tbd,
    event_type: mapInquiryEventType(values),
    venue_text: values.venue_text,
    guest_count: null,
    budget_range:
      values.interest === "deliveries" ? values.arrangement_size || values.budget_range : values.budget_range,
    source: values.sources?.length ? values.sources.join(", ") : values.source,
    message: details,
    website: values.website ?? "",
  };
}
