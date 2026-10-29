import { useMemo, useState } from "react";

import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import {
  EMPTY_INQUIRY_DRAFT,
  type InquiryInterest,
  toInquirySubmitValues,
} from "@/lib/os/inquiry-schema";
import { buildInquirySteps, isStepComplete } from "@/lib/os/inquiry-steps";

const ROOMS: Array<{
  value: InquiryInterest;
  title: string;
  line: string;
  wash: string;
}> = [
  { value: "weddings", title: "Weddings", line: "Vows, procession, the room.", wash: "#f4b8c0" },
  {
    value: "events",
    title: "Events",
    line: "Dinners, activations, brand worlds.",
    wash: "#e7c48a",
  },
  { value: "deliveries", title: "Deliveries", line: "A gift at the door.", wash: "#b7c9a8" },
  { value: "subscriptions", title: "Subscriptions", line: "Flowers on a rhythm.", wash: "#c7b3d6" },
  {
    value: "set_design",
    title: "Set + styling",
    line: "Still life, campaign, set.",
    wash: "#9eb6c4",
  },
];

export function InquiryAtelier({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (values: InquiryFormValues) => Promise<void>;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<InquiryFormValues>(EMPTY_INQUIRY_DRAFT);
  const room = ROOMS.find((item) => item.value === values.interest);

  const walls = useMemo(() => {
    if (!values.interest) return [];
    return buildInquirySteps(values.interest).filter(
      (step) => step.id !== "interest" && step.kind !== "review",
    );
  }, [values.interest]);

  const [wall, setWall] = useState(0);
  const step = walls[wall];
  const ready = walls.length > 0 && walls.every((item) => isStepComplete(item, values));

  function change<K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  if (!room || !step) {
    return (
      <section className="rooms">
        <p>Walk in</p>
        <h1>Pick a room.</h1>
        <div className="rooms-grid">
          {ROOMS.map((item) => (
            <button
              key={item.value}
              type="button"
              style={{ background: item.wash }}
              disabled={disabled}
              onClick={() => {
                change("interest", item.value);
                setWall(0);
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.line}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="wall" style={{ background: room.wash }}>
      <header className="wall-top">
        <button
          type="button"
          onClick={() => {
            change("interest", "");
            setWall(0);
          }}
        >
          Leave room
        </button>
        <p>
          {room.title} · wall {wall + 1} / {walls.length}
        </p>
      </header>

      <div className="wall-body">
        <h2>{step.label}</h2>
        {step.hint ? <p className="wall-hint">{step.hint}</p> : null}

        {step.kind === "text" ||
        step.kind === "email" ||
        step.kind === "tel" ||
        step.kind === "address" ? (
          <input
            className="wall-line"
            type={step.kind === "email" ? "email" : step.kind === "tel" ? "tel" : "text"}
            value={String(values[step.field] ?? "")}
            placeholder="Write on the wall"
            disabled={disabled}
            autoFocus
            onChange={(event) => change(step.field, event.target.value)}
          />
        ) : null}

        {step.kind === "textarea" ? (
          <textarea
            className="wall-line wall-line--long"
            value={values.message}
            placeholder="Write on the wall"
            disabled={disabled}
            rows={4}
            onChange={(event) => change("message", event.target.value)}
          />
        ) : null}

        {step.kind === "date" ? (
          <div className="wall-date">
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

        {step.kind === "choice" || step.kind === "multi" ? (
          <div className={`wall-tiles ${step.id === "arrangement_size" ? "wall-tiles--shop" : ""}`}>
            {step.options.map((option) => {
              const on =
                step.kind === "choice"
                  ? String(values[step.field] ?? "") === option.value
                  : (values.sources ?? []).includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={on ? "is-on" : undefined}
                  disabled={disabled}
                  onClick={() => {
                    if (step.kind === "choice") change(step.field, option.value as never);
                    else {
                      const current = values.sources ?? [];
                      change(
                        "sources",
                        current.includes(option.value)
                          ? current.filter((item) => item !== option.value)
                          : [...current, option.value],
                      );
                    }
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <footer className="wall-nav">
        <button
          type="button"
          disabled={disabled || wall === 0}
          onClick={() => setWall((current) => current - 1)}
        >
          Previous wall
        </button>
        {wall < walls.length - 1 ? (
          <button
            type="button"
            disabled={disabled || (!step.optional && !isStepComplete(step, values))}
            onClick={() => setWall((current) => current + 1)}
          >
            Next wall
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || !ready}
            onClick={() => void onSubmit(toInquirySubmitValues(values))}
          >
            {disabled ? "Sending…" : "Leave this in the room"}
          </button>
        )}
      </footer>
    </section>
  );
}
