import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { EMPTY_INQUIRY_DRAFT, interestLabel, toInquirySubmitValues } from "@/lib/os/inquiry-schema";
import { readInquiryDrafts, resolveInquirySteps, type InquiryDrafts } from "@/lib/os/inquiry-draft";
import {
  formatInquiryDate,
  formatInquiryPhone,
  isInquiryEmail,
  isInquiryPhone,
  isStepComplete,
  personalizeInquiryHelp,
  personalizeInquiryLabel,
  type InquiryStep,
} from "@/lib/os/inquiry-steps";
import { cn } from "@/lib/utils";

type GuideChange = <K extends keyof InquiryFormValues>(
  field: K,
  value: InquiryFormValues[K],
) => void;

function canSendInquiry(values: InquiryFormValues) {
  if (values.name.trim().length < 2) return false;
  if (!isInquiryEmail(values.email)) return false;
  if (values.phone.trim() && !isInquiryPhone(values.phone)) return false;
  if (!values.interest) return false;
  if (!values.event_date && !values.event_date_tbd) return false;
  return true;
}

export function InquiryGuide({
  onSubmit,
  disabled = false,
  showHoneypot = false,
  drafts: draftsProp,
}: {
  onSubmit: (values: InquiryFormValues) => Promise<void>;
  disabled?: boolean;
  showHoneypot?: boolean;
  drafts?: InquiryDrafts;
}) {
  const drafts = useMemo(() => draftsProp ?? readInquiryDrafts(), [draftsProp]);
  const [values, setValues] = useState<InquiryFormValues>(EMPTY_INQUIRY_DRAFT);
  const [index, setIndex] = useState(0);
  const steps = useMemo(
    () => resolveInquirySteps(values.interest, drafts),
    [values.interest, drafts],
  );
  const step = steps[Math.min(index, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    if (index > steps.length - 1) setIndex(Math.max(steps.length - 1, 0));
  }, [index, steps.length]);

  function change<K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  const last = step?.kind === "review";
  const complete = step ? isStepComplete(step, values) : false;
  const ready = last
    ? canSendInquiry(values)
    : step?.id === "interest"
      ? complete
      : import.meta.env.DEV || complete;
  /** Enter moves on, like the continue button; the last step waits for a click to send. */
  function onEnter(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) return;
    // in the notes box Enter is a new line; cmd/ctrl + enter moves on
    if (target.closest("textarea") && !(event.metaKey || event.ctrlKey)) return;
    if (last || disabled || !ready) return;
    event.preventDefault();
    setIndex((current) => current + 1);
  }

  const title = step ? personalizeInquiryLabel(step, "") : undefined;
  const help = step ? personalizeInquiryHelp(step, "") : undefined;

  return (
    <section className="auth-panel inquire-panel inquire-guide inquire-guide--path">
      <div className="inquire-guide-top">
        <div className="inquire-guide-dashes" aria-hidden="true">
          {steps.map((item, itemIndex) => (
            <i key={item.id} className={itemIndex <= index ? "is-on" : undefined} />
          ))}
        </div>
        {index > 0 ? (
          <button
            type="button"
            className="auth-text-action"
            disabled={disabled}
            onClick={() => setIndex((current) => current - 1)}
          >
            Back
          </button>
        ) : null}
      </div>

      <div className="auth-form inquire-form" onKeyDown={onEnter}>
        <div className="auth-panel-heading inquire-heading">
          <h2>{title}</h2>
          {help ? <p className="inquire-step-note">{help}</p> : null}
        </div>

        {showHoneypot ? (
          <label className="inquire-honeypot" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={values.website ?? ""}
              onChange={(event) => change("website", event.target.value)}
            />
          </label>
        ) : null}

        <div className="inquire-guide-body">
          {last ? (
            <Review values={values} />
          ) : step ? (
            <GuideField
              step={step}
              values={values}
              disabled={disabled}
              hideLabel
              onChange={change}
            />
          ) : null}
        </div>

        <div className="inquire-actions">
          <button
            type="button"
            className="auth-submit inquire-continue"
            disabled={disabled || !ready}
            onClick={() => {
              if (last) {
                void onSubmit(
                  toInquirySubmitValues({
                    ...values,
                    phone: formatInquiryPhone(values.phone),
                    website: values.website ?? "",
                  }),
                );
                return;
              }
              setIndex((current) => current + 1);
            }}
          >
            <span>{last ? (disabled ? "sending…" : "send inquiry") : "continue"}</span>
            <i>
              <ArrowRight size={16} />
            </i>
          </button>
        </div>
      </div>
    </section>
  );
}

function Review({ values }: { values: InquiryFormValues }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const stop = scroller.querySelector<HTMLElement>("[data-review-stop]");
    const vision = scroller.querySelector<HTMLElement>("[data-review-vision]");
    if (!stop) {
      scroller.style.maxHeight = "";
      return;
    }

    const box = scroller.getBoundingClientRect();
    const stopBottom = stop.getBoundingClientRect().bottom - box.top;
    const visionHeight = vision?.getBoundingClientRect().height ?? 0;
    const peek = visionHeight > 0 ? Math.min(Math.max(visionHeight / 2, 22), 36) : 0;
    scroller.style.maxHeight = `${Math.ceil(stopBottom + peek)}px`;
  }, [values]);

  return (
    <div ref={scrollerRef} className="inquire-review">
      <dl>
        <div>
          <dt>Name</dt>
          <dd>{values.name || "—"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{values.email || "—"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{values.phone ? formatInquiryPhone(values.phone) || values.phone : "—"}</dd>
        </div>
        <div>
          <dt>Interested in</dt>
          <dd>
            {interestLabel(values.interest ?? "")}
            {values.event_setting ? ` · ${values.event_setting}` : ""}
          </dd>
        </div>
        <div
          data-review-stop={
            !values.venue_text && !values.budget_range && !values.arrangement_size ? "" : undefined
          }
        >
          <dt>Date</dt>
          <dd>{formatInquiryDate(values) || "—"}</dd>
        </div>
        {values.venue_text || values.venue_tbd ? (
          <div data-review-stop={!values.budget_range && !values.arrangement_size ? "" : undefined}>
            <dt>Place</dt>
            <dd>{values.venue_tbd ? "TBD" : values.venue_text}</dd>
          </div>
        ) : null}
        {values.budget_range || values.arrangement_size ? (
          <div data-review-stop="">
            <dt>Figure</dt>
            <dd>{values.arrangement_size || values.budget_range}</dd>
          </div>
        ) : null}
        {values.space ? (
          <div>
            <dt>Space</dt>
            <dd>
              {values.space === "other" && values.space_other?.trim()
                ? `${values.space} — ${values.space_other.trim()}`
                : values.space}
            </dd>
          </div>
        ) : null}
        {values.cadence ? (
          <div>
            <dt>Refresh</dt>
            <dd>{values.cadence}</dd>
          </div>
        ) : null}
        {values.recipient ? (
          <div>
            <dt>Recipient</dt>
            <dd>{values.recipient}</dd>
          </div>
        ) : null}
        <div data-review-vision="">
          <dt>
            {values.interest === "deliveries"
              ? "Card"
              : values.interest === "subscriptions"
                ? "Anything else"
                : "Vision"}
          </dt>
          <dd>{values.message.trim() || "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

function GuideField({
  step,
  values,
  disabled,
  hideLabel,
  onChange,
}: {
  step: InquiryStep;
  values: InquiryFormValues;
  disabled?: boolean;
  hideLabel?: boolean;
  onChange: GuideChange;
}) {
  if (step.kind === "choice" || step.kind === "multi") {
    const selected = step.kind === "choice" ? String(values[step.field] ?? "") : "";
    const chips =
      step.field === "budget_range" ||
      step.field === "arrangement_size" ||
      step.field === "sources";
    return (
      <fieldset className="auth-field inquire-guide-set">
        {hideLabel ? (
          <legend className="sr-only">{step.label}</legend>
        ) : (
          <legend>{step.label}</legend>
        )}
        <div
          className={cn("inquire-picks", chips ? "inquire-picks--chips" : "inquire-picks--rows")}
        >
          {step.options.map((option) => {
            const on =
              step.kind === "choice"
                ? selected === option.value
                : (values.sources ?? []).includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={cn(on && "is-on")}
                disabled={disabled}
                onClick={() => {
                  if (step.kind === "choice") onChange(step.field, option.value as never);
                  else {
                    const current = values.sources ?? [];
                    onChange(
                      "sources",
                      current.includes(option.value)
                        ? current.filter((item) => item !== option.value)
                        : [...current, option.value],
                    );
                  }
                }}
              >
                <span>{option.label}</span>
                {on ? <Check className="size-3.5" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        {step.kind === "choice" && step.otherField && selected === "other" ? (
          <label className="auth-field inquire-other">
            <span className="sr-only">Other</span>
            <div className="auth-input">
              <input
                value={String(values[step.otherField] ?? "")}
                placeholder={step.otherPlaceholder ?? "Tell us a little more"}
                disabled={disabled}
                autoFocus
                onChange={(event) => {
                  if (step.kind === "choice" && step.otherField)
                    onChange(step.otherField, event.target.value);
                }}
              />
            </div>
          </label>
        ) : null}
      </fieldset>
    );
  }

  if (step.kind === "date") {
    return (
      <div className="inquire-date">
        {hideLabel ? null : <span className="inquire-guide-label">{step.label}</span>}
        <InquiryDatePicker
          value={values.event_date}
          time={values.event_time}
          withTime={step.withTime !== false}
          disabled={disabled || values.event_date_tbd}
          onChange={(next) => {
            onChange("event_date_tbd", false);
            if (!next) {
              onChange("event_date", null);
              onChange("event_time", "");
              return;
            }
            if (values.interest !== "events") {
              onChange("event_date", next);
              onChange("event_dates", []);
              return;
            }
            const held = [values.event_date, ...(values.event_dates ?? [])].filter(
              (date): date is string => Boolean(date),
            );
            if (held.includes(next)) return;
            if (!values.event_date) onChange("event_date", next);
            else onChange("event_dates", [...(values.event_dates ?? []), next]);
          }}
          onTimeChange={(next) => onChange("event_time", next)}
        />
        {values.interest === "events" &&
        (values.event_date || (values.event_dates?.length ?? 0) > 0) ? (
          <div className="inquire-date-list">
            {[values.event_date, ...(values.event_dates ?? [])]
              .filter((date): date is string => Boolean(date))
              .map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => {
                    if (date === values.event_date) {
                      const rest = values.event_dates ?? [];
                      onChange("event_date", rest[0] ?? null);
                      onChange("event_dates", rest.slice(1));
                      return;
                    }
                    onChange(
                      "event_dates",
                      (values.event_dates ?? []).filter((item) => item !== date),
                    );
                  }}
                >
                  {formatInquiryDate({
                    ...values,
                    event_date: date,
                    event_dates: [],
                    event_time: "",
                  }) || date}
                  <X aria-hidden="true" strokeWidth={1.5} />
                  <span className="sr-only">remove this date</span>
                </button>
              ))}
          </div>
        ) : null}
        <button
          type="button"
          className={cn("auth-text-action", values.event_date_tbd && "is-on")}
          disabled={disabled}
          onClick={() => {
            onChange("event_date_tbd", !values.event_date_tbd);
            if (!values.event_date_tbd) {
              onChange("event_date", null);
              onChange("event_dates", []);
              onChange("event_time", "");
            }
          }}
        >
          Date is still TBD
        </button>
      </div>
    );
  }

  if (step.kind === "textarea") {
    return (
      <label className="inquire-letter-paper">
        {hideLabel ? <span className="sr-only">{step.label}</span> : <span>{step.label}</span>}
        <textarea
          value={values.message}
          placeholder={step.placeholder}
          disabled={disabled}
          rows={5}
          maxLength={step.maxLength}
          onChange={(event) => onChange("message", event.target.value)}
        />
      </label>
    );
  }

  if (step.kind === "address") {
    return (
      <div className="auth-field">
        {hideLabel ? null : <span>{step.label}</span>}
        <FloridaAddressPicker
          value={values.venue_tbd ? "" : values.venue_text}
          disabled={disabled || Boolean(values.venue_tbd)}
          placeholder={values.venue_tbd ? "tbd" : step.placeholder}
          onChange={(next) => {
            onChange("venue_tbd", false);
            onChange("venue_text", next);
          }}
        />
        <button
          type="button"
          className={cn("auth-text-action", values.venue_tbd && "is-on")}
          disabled={disabled}
          onClick={() => {
            const next = !values.venue_tbd;
            onChange("venue_tbd", next);
            if (next) onChange("venue_text", "");
          }}
        >
          Venue is still TBD
        </button>
      </div>
    );
  }

  if (step.kind === "text" || step.kind === "email" || step.kind === "tel") {
    return (
      <ContactField
        step={step}
        values={values}
        disabled={disabled}
        hideLabel={hideLabel}
        onChange={onChange}
      />
    );
  }

  return null;
}

function ContactField({
  step,
  values,
  disabled,
  hideLabel,
  onChange,
}: {
  step: Extract<InquiryStep, { kind: "text" | "email" | "tel" }>;
  values: InquiryFormValues;
  disabled?: boolean | undefined;
  hideLabel?: boolean | undefined;
  onChange: GuideChange;
}) {
  const [emailChecked, setEmailChecked] = useState(false);
  const [phoneChecked, setPhoneChecked] = useState(false);
  const raw = String(values[step.field] ?? "");
  const issue =
    step.kind === "email" && emailChecked && raw.trim() && !isInquiryEmail(raw)
      ? "that doesn’t look like an email yet."
      : step.kind === "tel" && phoneChecked && raw.trim() && !isInquiryPhone(raw)
        ? "use a ten digit number"
        : undefined;

  return (
    <label className="auth-field">
      {hideLabel ? <span className="sr-only">{step.label}</span> : <span>{step.label}</span>}
      <div className={cn("auth-input", issue && "has-error")}>
        <input
          type={step.kind}
          inputMode={step.kind === "tel" ? "tel" : step.kind === "email" ? "email" : "text"}
          autoComplete={
            step.kind === "tel"
              ? "tel"
              : step.kind === "email"
                ? "email"
                : step.field === "name"
                  ? "name"
                  : "off"
          }
          value={raw}
          placeholder={step.placeholder}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (step.kind === "email") setEmailChecked(false);
            if (step.kind === "tel") setPhoneChecked(false);
            onChange(step.field, step.kind === "tel" ? formatInquiryPhone(next) : next);
          }}
          onBlur={() => {
            if (step.kind === "email") setEmailChecked(true);
            if (step.kind === "tel") {
              setPhoneChecked(true);
              if (raw.trim()) onChange("phone", formatInquiryPhone(raw));
            }
          }}
        />
      </div>
      {issue ? <small>{issue}</small> : null}
    </label>
  );
}
