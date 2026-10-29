import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import type { InquiryStep } from "@/lib/os/inquiry-steps";
import { cn } from "@/lib/utils";

export function InquiryFieldControl({
  step,
  values,
  disabled,
  onChange,
  onSelect,
  onToggle,
}: {
  step: InquiryStep;
  values: InquiryFormValues;
  disabled?: boolean;
  onChange: <K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) => void;
  onSelect?: (value: string) => void;
  onToggle?: (value: string) => void;
}) {
  if (step.kind === "text" || step.kind === "email" || step.kind === "tel") {
    return (
      <label className="auth-field">
        <span className="sr-only">{step.label}</span>
        <div className="auth-input">
          <input
            type={step.kind}
            value={String(values[step.field] ?? "")}
            placeholder={step.placeholder}
            autoFocus
            disabled={disabled}
            onChange={(event) => onChange(step.field, event.target.value)}
          />
        </div>
      </label>
    );
  }

  if (step.kind === "textarea") {
    return (
      <label className="auth-field">
        <span className="sr-only">{step.label}</span>
        <div className="auth-input auth-input--textarea">
          <textarea
            value={values.message}
            placeholder={step.placeholder}
            autoFocus
            disabled={disabled}
            rows={5}
            onChange={(event) => onChange("message", event.target.value)}
          />
        </div>
      </label>
    );
  }

  if (step.kind === "date") {
    return (
      <div className="inquire-date">
        <InquiryDatePicker
          value={values.event_date}
          time={values.event_time}
          disabled={disabled || values.event_date_tbd}
          onChange={(next) => onChange("event_date", next)}
          onTimeChange={(next) => onChange("event_time", next)}
        />
        <button
          type="button"
          className={cn("inquire-chip", values.event_date_tbd && "is-active")}
          disabled={disabled}
          onClick={() => {
            onChange("event_date_tbd", !values.event_date_tbd);
            if (!values.event_date_tbd) onChange("event_date", null);
          }}
        >
          Date is still TBD
        </button>
      </div>
    );
  }

  if (step.kind === "address") {
    return (
      <FloridaAddressPicker
        value={values.venue_text}
        disabled={Boolean(disabled)}
        placeholder={step.placeholder ?? "search a florida address"}
        onChange={(next) => onChange("venue_text", next)}
      />
    );
  }

  if (step.kind === "choice") {
    return (
      <div className="inquire-choices">
        {step.options.map((option) => {
          const active = String(values[step.field] ?? "") === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn("auth-google inquire-choice", active && "is-active")}
              disabled={disabled}
              onClick={() => onSelect?.(option.value)}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (step.kind === "multi") {
    return (
      <div className="inquire-choices">
        {step.options.map((option) => {
          const active = (values.sources ?? []).includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={cn("auth-google inquire-choice", active && "is-active")}
              disabled={disabled}
              onClick={() => onToggle?.(option.value)}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return null;
}
