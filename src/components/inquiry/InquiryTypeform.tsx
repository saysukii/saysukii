import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check } from "lucide-react";

import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import {
  ARRANGEMENT_SIZES,
  EMPTY_INQUIRY_DRAFT,
  EVENT_BUDGETS,
  EVENT_SETTING_OPTIONS,
  INTEREST_OPTIONS,
  SOURCE_OPTIONS,
  WEDDING_BUDGETS,
  interestLabel,
  toInquirySubmitValues,
} from "@/lib/os/inquiry-schema";
import { cn } from "@/lib/utils";

type ChoiceOption = { value: string; label: string };

type StepBase = {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
};

type Step =
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
      options: ChoiceOption[];
    })
  | (StepBase & {
      kind: "multi";
      field: "sources";
      options: ChoiceOption[];
    })
  | (StepBase & { kind: "review"; field?: never });

function buildSteps(interest: InquiryFormValues["interest"]): Step[] {
  const sharedStart: Step[] = [
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

  const sourceAndReview: Step[] = [
    {
      id: "source",
      kind: "multi",
      field: "sources",
      label: "How did you hear about us?",
      options: SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      required: true,
      hint: "Select as many as you like.",
    },
    { id: "review", kind: "review", label: "Ready to send?" },
  ];

  const eventDate: Step = {
    id: "event_date",
    kind: "date",
    field: "event_date",
    label: "When is it?",
    required: true,
  };

  const venueOptional: Step = {
    id: "venue_text",
    kind: "address",
    field: "venue_text",
    label: "Where will it take place?",
    placeholder: "Search Florida venues and addresses",
    required: false,
    optional: true,
  };

  const vision: Step = {
    id: "message",
    kind: "textarea",
    field: "message",
    label: "Tell us about the vision.",
    placeholder: "Mood, flowers, scale — or a link to references.",
    required: true,
  };

  if (!interest) {
    return sharedStart;
  }

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
        hint: "Events typically start around $1,000.",
      },
      vision,
      ...sourceAndReview,
    ];
  }

  if (interest === "weddings") {
    return [
      ...sharedStart,
      { ...eventDate, label: "When is the wedding?" },
      venueOptional,
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "What budget range feels right?",
        options: WEDDING_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
        hint: "Full-service weddings typically start at $6,000.",
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
        hint: "Arrangements are designer’s choice.",
      },
      {
        ...eventDate,
        label: "When should it arrive?",
        hint: "Deliveries are Wednesday–Friday, 10am–2pm in Miami-Dade and Broward.",
      },
      {
        id: "venue_text",
        kind: "address",
        field: "venue_text",
        label: "Where should we deliver?",
        placeholder: "Search a Florida address",
        required: true,
        hint: "Delivery is +$25–$40 in Miami-Dade and Broward.",
      },
      {
        id: "recipient",
        kind: "text",
        field: "recipient",
        label: "Who is it for?",
        placeholder: "Recipient name",
        required: true,
      },
      {
        id: "message",
        kind: "textarea",
        field: "message",
        label: "Any notes for the arrangement?",
        placeholder: "Occasion, colors, flowers, or a short card message.",
        required: true,
      },
      ...sourceAndReview,
    ];
  }

  if (interest === "subscriptions") {
    return [
      ...sharedStart,
      { ...eventDate, label: "When would you like to start?" },
      {
        id: "venue_text",
        kind: "address",
        field: "venue_text",
        label: "Where should we deliver?",
        placeholder: "Search a Florida address",
        required: false,
        optional: true,
      },
      {
        ...vision,
        label: "What are you hoping for?",
        placeholder: "Cadence, colors, vibe — whatever helps.",
      },
      ...sourceAndReview,
    ];
  }

  if (interest === "set_design") {
    return [
      ...sharedStart,
      { ...eventDate, label: "When is the shoot or install?" },
      venueOptional,
      {
        id: "budget_range",
        kind: "choice",
        field: "budget_range",
        label: "What budget range feels right?",
        options: EVENT_BUDGETS.map((option) => ({ value: option.value, label: option.label })),
        required: true,
      },
      vision,
      ...sourceAndReview,
    ];
  }

  return [...sharedStart, ...sourceAndReview];
}

const FALLBACK_STEP: Step = {
  id: "name",
  kind: "text",
  field: "name",
  label: "What’s your name?",
  placeholder: "Type your full name",
  required: true,
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatReviewDate(values: InquiryFormValues) {
  if (values.event_date_tbd) return "TBD";
  if (!values.event_date) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
    new Date(`${values.event_date}T12:00:00`),
  );
}

const allowEmptySteps = import.meta.env.DEV;

export function InquiryTypeform({
  onSubmit,
  disabled = false,
  showHoneypot = false,
}: {
  onSubmit: (values: InquiryFormValues) => Promise<void>;
  disabled?: boolean;
  showHoneypot?: boolean;
}) {
  const [stepId, setStepId] = useState("name");
  const [values, setValues] = useState<InquiryFormValues>(EMPTY_INQUIRY_DRAFT);
  const [answeredSteps, setAnsweredSteps] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  const steps = useMemo(() => buildSteps(values.interest), [values.interest]);
  const foundIndex = steps.findIndex((item) => item.id === stepId);
  const index = foundIndex === -1 ? 0 : foundIndex;
  const step = steps[index] ?? steps[0] ?? FALLBACK_STEP;
  const progress = ((index + 1) / Math.max(steps.length, 1)) * 100;

  useEffect(() => {
    if (!steps.some((item) => item.id === stepId)) {
      setStepId(
        steps.some((item) => item.id === "interest") ? "interest" : (steps[0]?.id ?? "name"),
      );
    }
  }, [stepId, steps]);

  useEffect(() => setError(""), [stepId]);

  const canContinue = useMemo(() => {
    if (allowEmptySteps) return true;
    if (step.kind === "review") return true;
    if (step.kind === "date") return values.event_date_tbd || Boolean(values.event_date);
    if (step.kind === "choice") return answeredSteps.has(step.id);
    if (step.kind === "multi") return (values.sources?.length ?? 0) > 0;
    if (step.optional) return true;
    const current = values[step.field];
    if (step.kind === "email") return isEmail(String(current ?? ""));
    return String(current ?? "").trim().length > 0;
  }, [answeredSteps, step, values]);

  function updateField<K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function selectChoice(
    field: "interest" | "event_setting" | "arrangement_size" | "budget_range",
    value: string,
  ) {
    updateField(field, value as never);
    setAnsweredSteps((current) => new Set(current).add(step.id));
  }

  function toggleSource(value: string) {
    const current = values.sources ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    updateField("sources", next);
    setAnsweredSteps((answered) => {
      const copy = new Set(answered);
      if (next.length) copy.add("source");
      else copy.delete("source");
      return copy;
    });
  }

  function validateCurrentStep() {
    if (allowEmptySteps) return "";
    if (step.kind === "review") return "";
    if (step.kind === "date") {
      if (!values.event_date_tbd && !values.event_date) return "Choose a date or mark it as TBD.";
      return "";
    }
    if (step.optional) return "";
    if (step.kind === "choice") return answeredSteps.has(step.id) ? "" : "Choose one to continue.";
    if (step.kind === "multi") {
      return (values.sources?.length ?? 0) > 0 ? "" : "Choose at least one.";
    }
    const current = String(values[step.field] ?? "").trim();
    if (!current) return "This answer helps us respond thoughtfully.";
    if (step.kind === "email" && !isEmail(current)) return "Enter a valid email address.";
    return "";
  }

  async function goNext() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (step.kind === "review") {
      await onSubmit(toInquirySubmitValues(values));
      return;
    }
    const next = steps[index + 1];
    if (next) setStepId(next.id);
  }

  function goBack() {
    const previous = steps[index - 1];
    if (previous) setStepId(previous.id);
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (step.kind === "textarea") return;
    event.preventDefault();
    void goNext();
  }

  const textValue =
    step.kind === "text" || step.kind === "email" || step.kind === "tel"
      ? String(values[step.field] ?? "")
      : "";

  return (
    <section className="auth-panel inquire-panel">
      <div className="auth-panel-shine" />

      <div className="inquire-flow">
        <div className="inquire-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="inquire-step-meta">
          <span>
            {index + 1} / {steps.length}
          </span>
          {index > 0 ? (
            <button type="button" className="auth-text-action" onClick={goBack} disabled={disabled}>
              Back
            </button>
          ) : null}
        </div>

        <div className="auth-form inquire-form" onKeyDown={onEnter}>
          <div className="auth-panel-heading inquire-heading">
            <h2>{step.label}</h2>
            {step.kind !== "review" && step.hint ? (
              <p className="inquire-step-note">{step.hint}</p>
            ) : null}
          </div>

          {step.kind === "text" || step.kind === "email" || step.kind === "tel" ? (
            <label className="auth-field">
              <span className="sr-only">{step.label}</span>
              <div className="auth-input">
                <input
                  type={step.kind}
                  value={textValue}
                  placeholder={step.placeholder}
                  autoFocus
                  disabled={disabled}
                  onChange={(event) => updateField(step.field, event.target.value)}
                />
              </div>
            </label>
          ) : null}

          {step.kind === "textarea" ? (
            <label className="auth-field">
              <span className="sr-only">{step.label}</span>
              <div className="auth-input auth-input--textarea">
                <textarea
                  value={values.message}
                  placeholder={step.placeholder}
                  autoFocus
                  disabled={disabled}
                  rows={5}
                  onChange={(event) => updateField("message", event.target.value)}
                />
              </div>
            </label>
          ) : null}

          {step.kind === "date" ? (
            <div className="inquire-date">
              <InquiryDatePicker
                value={values.event_date}
                time={values.event_time}
                disabled={disabled || values.event_date_tbd}
                onChange={(next) => updateField("event_date", next)}
                onTimeChange={(next) => updateField("event_time", next)}
              />
              <button
                type="button"
                className={cn("inquire-chip", values.event_date_tbd && "is-active")}
                disabled={disabled}
                onClick={() => {
                  updateField("event_date_tbd", !values.event_date_tbd);
                  if (!values.event_date_tbd) updateField("event_date", null);
                }}
              >
                Date is still TBD
              </button>
            </div>
          ) : null}

          {step.kind === "address" ? (
            <FloridaAddressPicker
              value={values.venue_text}
              disabled={disabled}
              placeholder={step.placeholder}
              onChange={(next) => updateField("venue_text", next)}
            />
          ) : null}

          {step.kind === "choice" ? (
            <div className="inquire-choices">
              {step.options.map((option) => {
                const active =
                  answeredSteps.has(step.id) && String(values[step.field] ?? "") === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn("auth-google inquire-choice", active && "is-active")}
                    disabled={disabled}
                    onClick={() => selectChoice(step.field, option.value)}
                  >
                    <span>{option.label}</span>
                    {active ? <Check className="size-4" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.kind === "multi" ? (
            <div className="inquire-choices">
              {step.options.map((option) => {
                const active = (values.sources ?? []).includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn("auth-google inquire-choice", active && "is-active")}
                    disabled={disabled}
                    onClick={() => toggleSource(option.value)}
                  >
                    <span>{option.label}</span>
                    {active ? <Check className="size-4" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.kind === "review" ? (
            <div className="inquire-review">
              <dl>
                <div>
                  <dt>Name</dt>
                  <dd>{values.name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{values.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{values.phone}</dd>
                </div>
                <div>
                  <dt>Interested in</dt>
                  <dd>
                    {interestLabel(values.interest ?? "")}
                    {values.event_setting ? ` · ${values.event_setting}` : ""}
                  </dd>
                </div>
                {values.arrangement_size ? (
                  <div>
                    <dt>Size</dt>
                    <dd>{values.arrangement_size}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{values.interest === "deliveries" ? "Delivery" : "Date"}</dt>
                  <dd>{formatReviewDate(values)}</dd>
                </div>
                {values.venue_text ? (
                  <div>
                    <dt>{values.interest === "deliveries" ? "Address" : "Location"}</dt>
                    <dd>{values.venue_text}</dd>
                  </div>
                ) : null}
                {values.recipient ? (
                  <div>
                    <dt>Recipient</dt>
                    <dd>{values.recipient}</dd>
                  </div>
                ) : null}
                {values.budget_range && values.interest !== "deliveries" ? (
                  <div>
                    <dt>Budget</dt>
                    <dd>{values.budget_range}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {error ? (
            <p className="inquire-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="inquire-actions">
            {step.kind !== "review" && step.optional ? (
              <button
                type="button"
                className="auth-text-action inquire-skip"
                disabled={disabled}
                onClick={() => {
                  const next = steps[index + 1];
                  if (next) setStepId(next.id);
                }}
              >
                Skip
              </button>
            ) : null}
            <button
              type="button"
              className="auth-submit inquire-continue"
              disabled={disabled || !canContinue}
              onClick={() => void goNext()}
            >
              <span>
                {step.kind === "review" ? (disabled ? "Sending…" : "Send inquiry") : "Continue"}
              </span>
              <i>
                <ArrowRight size={16} />
              </i>
            </button>
          </div>

          {step.kind !== "textarea" && step.kind !== "review" ? (
            <p className="inquire-hint">Press Enter ↵</p>
          ) : null}
        </div>

        {showHoneypot ? (
          <label className="absolute -left-[10000px]" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={values.website ?? ""}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
