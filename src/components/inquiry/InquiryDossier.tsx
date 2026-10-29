import { useEffect, useMemo, useState } from "react";

import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { EMPTY_INQUIRY_DRAFT, toInquirySubmitValues } from "@/lib/os/inquiry-schema";
import {
  FALLBACK_INQUIRY_STEP,
  buildInquirySteps,
  isStepComplete,
  type InquiryStep,
} from "@/lib/os/inquiry-steps";

function rowLabel(step: InquiryStep) {
  if (step.id === "name") return "From";
  if (step.id === "email") return "Email";
  if (step.id === "phone") return "Telephone";
  if (step.id === "interest") return "Matter";
  if (step.id === "event_setting") return "Nature";
  if (step.id === "event_date") return "Date";
  if (step.id === "venue_text") return "Place";
  if (step.id === "budget_range" || step.id === "arrangement_size") return "Figure";
  if (step.id === "recipient") return "For";
  if (step.id === "message") return "Note";
  if (step.id === "source") return "Heard via";
  return step.label;
}

export function InquiryDossier({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (values: InquiryFormValues) => Promise<void>;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<InquiryFormValues>(EMPTY_INQUIRY_DRAFT);
  const [stepId, setStepId] = useState("name");

  const steps = useMemo(
    () => buildInquirySteps(values.interest).filter((step) => step.kind !== "review"),
    [values.interest],
  );
  const found = steps.findIndex((step) => step.id === stepId);
  const index = found === -1 ? 0 : found;
  const step = steps[index] ?? FALLBACK_INQUIRY_STEP;
  const complete = steps.every((item) => isStepComplete(item, values));

  useEffect(() => {
    if (!steps.some((item) => item.id === stepId)) setStepId(steps[0]?.id ?? "name");
  }, [stepId, steps]);

  function change<K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function writeChoice(nextStep: InquiryStep, value: string) {
    if (nextStep.kind === "choice") {
      change(nextStep.field, value as never);
      return;
    }
    if (nextStep.kind === "multi") {
      const current = values.sources ?? [];
      change(
        "sources",
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      );
    }
  }

  return (
    <article className="letter">
      <header className="letter-head">
        <p>Say Sukii</p>
        <p>Miami · Inquiry</p>
      </header>
      <h1>To the studio</h1>
      <p className="letter-lead">
        Fill the blanks on this page. The current line is in ink. Click any other line to go back.
      </p>

      <ol className="letter-lines">
        {steps.map((item, itemIndex) => {
          const active = item.id === step.id;
          return (
            <li key={item.id} className={active ? "is-current" : undefined}>
              <button
                type="button"
                className="letter-jump"
                disabled={disabled}
                onClick={() => setStepId(item.id)}
              >
                {rowLabel(item)}
              </button>

              {item.kind === "text" ||
              item.kind === "email" ||
              item.kind === "tel" ||
              item.kind === "address" ? (
                <input
                  type={item.kind === "email" ? "email" : item.kind === "tel" ? "tel" : "text"}
                  value={String(values[item.field] ?? "")}
                  placeholder="................................"
                  disabled={disabled}
                  autoFocus={active}
                  onFocus={() => setStepId(item.id)}
                  onChange={(event) => change(item.field, event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      isStepComplete(item, { ...values, [item.field]: event.currentTarget.value })
                    ) {
                      const next = steps[itemIndex + 1];
                      if (next) setStepId(next.id);
                    }
                  }}
                />
              ) : null}

              {item.kind === "textarea" ? (
                <textarea
                  value={values.message}
                  placeholder="write in the margin…"
                  disabled={disabled}
                  rows={active ? 4 : 2}
                  onFocus={() => setStepId(item.id)}
                  onChange={(event) => change("message", event.target.value)}
                />
              ) : null}

              {item.kind === "date" ? (
                <div className="letter-date">
                  <InquiryDatePicker
                    compact
                    withTime={false}
                    value={values.event_date}
                    disabled={disabled || values.event_date_tbd}
                    placeholder="select a date"
                    onChange={(next) => {
                      setStepId(item.id);
                      change("event_date", next);
                      change("event_date_tbd", false);
                    }}
                  />
                  <button
                    type="button"
                    className={values.event_date_tbd ? "is-circled" : undefined}
                    onClick={() => {
                      setStepId(item.id);
                      change("event_date_tbd", !values.event_date_tbd);
                      if (!values.event_date_tbd) change("event_date", null);
                    }}
                  >
                    date to be decided
                  </button>
                </div>
              ) : null}

              {item.kind === "choice" || item.kind === "multi" ? (
                <div className="letter-words">
                  {item.options.map((option) => {
                    const on =
                      item.kind === "choice"
                        ? String(values[item.field] ?? "") === option.value
                        : (values.sources ?? []).includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={on ? "is-circled" : undefined}
                        disabled={disabled}
                        onClick={() => {
                          setStepId(item.id);
                          writeChoice(item, option.value);
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <footer className="letter-foot">
        <p>
          {index + 1} / {steps.length}
        </p>
        <button
          type="button"
          className="letter-stamp"
          disabled={disabled || !complete}
          onClick={() => void onSubmit(toInquirySubmitValues(values))}
        >
          {disabled ? "Filing…" : "Stamp & send"}
        </button>
      </footer>
    </article>
  );
}
