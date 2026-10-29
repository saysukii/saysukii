import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { EMPTY_INQUIRY_DRAFT, toInquirySubmitValues } from "@/lib/os/inquiry-schema";
import {
  FALLBACK_INQUIRY_STEP,
  buildInquirySteps,
  formatStepAnswer,
  isStepComplete,
  type InquiryStep,
} from "@/lib/os/inquiry-steps";

type Line = { id: string; role: "studio" | "client"; text: string };

const STUDIO: Record<string, string> = {
  name: "Hi love — who am I speaking with?",
  email: "Beautiful. What’s the best email for you?",
  phone: "And a number, in case we need to call.",
  interest: "What are you dreaming up with us?",
  event_setting: "Private or corporate?",
  event_date: "When should we hold the date?",
  venue_text: "Where is this living?",
  budget_range: "What range feels honest for this?",
  arrangement_size: "Which size should we compose?",
  recipient: "Who is receiving it?",
  message: "Tell me anything the flowers should know.",
  source: "How did you find us? Tap every one that fits, then send.",
  review: "I’ll text this to the studio. Send it?",
};

function studioLine(step: InquiryStep) {
  return STUDIO[step.id] ?? step.label;
}

export function InquiryThread({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (values: InquiryFormValues) => Promise<void>;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<InquiryFormValues>(EMPTY_INQUIRY_DRAFT);
  const [stepId, setStepId] = useState("name");
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: "studio-name", role: "studio", text: "Hi love — who am I speaking with?" },
  ]);
  const [waiting, setWaiting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const steps = useMemo(() => buildInquirySteps(values.interest), [values.interest]);
  const found = steps.findIndex((step) => step.id === stepId);
  const step = steps[found === -1 ? 0 : found] ?? FALLBACK_INQUIRY_STEP;

  useEffect(() => {
    if (!steps.some((item) => item.id === stepId)) setStepId("interest");
  }, [stepId, steps]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, waiting, stepId]);

  function change<K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function revealNext(from: InquiryStep, nextValues: InquiryFormValues) {
    const nextSteps = buildInquirySteps(nextValues.interest);
    const index = nextSteps.findIndex((item) => item.id === from.id);
    const next = nextSteps[index + 1];
    if (!next) return;
    setDraft("");
    setWaiting(true);
    window.setTimeout(() => {
      setLines((current) => [
        ...current,
        { id: `studio-${next.id}-${current.length}`, role: "studio", text: studioLine(next) },
      ]);
      setStepId(next.id);
      setWaiting(false);
    }, 380);
  }

  function commit(from: InquiryStep, nextValues = values) {
    const answer = formatStepAnswer(from, nextValues);
    if (!from.optional && from.kind !== "review" && !isStepComplete(from, nextValues)) return;
    if (from.kind !== "review" && answer) {
      setLines((current) => [
        ...current,
        { id: `client-${from.id}-${current.length}`, role: "client", text: answer },
      ]);
    }
    if (from.kind === "review") {
      void onSubmit(toInquirySubmitValues(nextValues));
      return;
    }
    revealNext(from, nextValues);
  }

  function sendText(event?: FormEvent) {
    event?.preventDefault();
    if (
      step.kind === "text" ||
      step.kind === "email" ||
      step.kind === "tel" ||
      step.kind === "textarea"
    ) {
      const next = { ...values, [step.field]: draft.trim() };
      setValues(next);
      commit(step, next);
      return;
    }
    if (step.kind === "address") {
      const next = { ...values, venue_text: draft.trim() };
      setValues(next);
      commit(step, next);
      return;
    }
    if (step.kind === "date") {
      commit(step);
      return;
    }
    if (step.kind === "multi" || step.kind === "review") {
      commit(step);
    }
  }

  function selectChoice(value: string) {
    if (step.kind !== "choice") return;
    const next = { ...values, [step.field]: value };
    setValues(next);
    commit(step, next);
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendText();
  }

  const usesComposer =
    step.kind === "text" ||
    step.kind === "email" ||
    step.kind === "tel" ||
    step.kind === "textarea" ||
    step.kind === "address";

  return (
    <section className="imessage">
      <header className="imessage-top">
        <span className="imessage-avatar">S</span>
        <div>
          <strong>Sukii</strong>
          <p>Say Sukii · iMessage</p>
        </div>
      </header>

      <div ref={logRef} className="imessage-log">
        {lines.map((line) => (
          <div key={line.id} className={`imessage-row imessage-row--${line.role}`}>
            {line.role === "studio" ? <span className="imessage-dot">S</span> : null}
            <p>{line.text}</p>
          </div>
        ))}
        {waiting ? (
          <div className="imessage-row imessage-row--studio">
            <span className="imessage-dot">S</span>
            <p className="imessage-typing">
              <i />
              <i />
              <i />
            </p>
          </div>
        ) : null}
      </div>

      {!waiting ? (
        <footer className="imessage-dock">
          {step.kind === "choice" || step.kind === "multi" ? (
            <div className="imessage-suggest">
              {step.options.map((option) => {
                const active =
                  step.kind === "multi" && (values.sources ?? []).includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active ? "is-on" : undefined}
                    disabled={disabled}
                    onClick={() =>
                      step.kind === "choice"
                        ? selectChoice(option.value)
                        : change(
                            "sources",
                            (values.sources ?? []).includes(option.value)
                              ? (values.sources ?? []).filter((item) => item !== option.value)
                              : [...(values.sources ?? []), option.value],
                          )
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.kind === "date" ? (
            <div className="imessage-date">
              <InquiryDatePicker
                compact
                withTime={false}
                value={values.event_date}
                disabled={disabled || values.event_date_tbd}
                placeholder="Select a date"
                onChange={(next) => {
                  change("event_date", next);
                  change("event_date_tbd", false);
                }}
              />
              <button
                type="button"
                className={values.event_date_tbd ? "is-on" : undefined}
                onClick={() => {
                  change("event_date_tbd", !values.event_date_tbd);
                  if (!values.event_date_tbd) change("event_date", null);
                }}
              >
                TBD
              </button>
            </div>
          ) : null}

          <form className="imessage-bar" onSubmit={sendText}>
            {usesComposer ? (
              step.kind === "textarea" ? (
                <textarea
                  rows={1}
                  value={draft}
                  placeholder="iMessage"
                  disabled={disabled}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKey}
                />
              ) : (
                <input
                  type={step.kind === "email" ? "email" : step.kind === "tel" ? "tel" : "text"}
                  value={draft}
                  placeholder="iMessage"
                  disabled={disabled}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKey}
                />
              )
            ) : (
              <p>{step.kind === "review" ? "Ready when you are." : step.hint || " "}</p>
            )}
            {step.optional ? (
              <button type="button" className="imessage-skip" onClick={() => commit(step)}>
                Skip
              </button>
            ) : null}
            {step.kind === "choice" ? null : (
              <button
                type="submit"
                className="imessage-go"
                disabled={
                  disabled ||
                  (usesComposer && !draft.trim() && !step.optional) ||
                  (step.kind === "date" && !isStepComplete(step, values)) ||
                  (step.kind === "multi" && !isStepComplete(step, values))
                }
                aria-label="Send"
              />
            )}
          </form>
        </footer>
      ) : null}
    </section>
  );
}
