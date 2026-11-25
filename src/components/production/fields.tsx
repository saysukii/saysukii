import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { InquiryDatePicker, InquiryTimePicker } from "@/components/inquiry/InquiryDatePicker";
import { ConfirmRemove } from "@/components/studio/ConfirmRemove";
import {
  clockTime,
  pickerTime,
  PRODUCTION_TIMES,
  readDayWindows,
  writeDayWindows,
  type DayWindowDraft,
} from "@/lib/os/production";
import { cn } from "@/lib/utils";

/**
 * A number with arrows to nudge it up or down. Typing saves when you leave the field; the arrows
 * save once you stop tapping, so a run of taps is one change.
 */
export function QtyStepper({
  value,
  onCommit,
  label,
  min = 0,
  placeholder = "",
  className,
  inputRef,
  onEnter,
  live = false,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  label: string;
  min?: number;
  placeholder?: string;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** enter does this (after saving what's typed) instead of just leaving the field */
  onEnter?: (next: number | null) => void;
  /** a draft field, not a saved one: every change goes straight through */
  live?: boolean;
}) {
  const shown = value == null ? "" : String(Number(value));
  const [draft, setDraft] = useState(shown);
  const timer = useRef<number | null>(null);
  const editing = useRef(false);

  useEffect(() => {
    // a draft field follows its owner, so clearing it after an add clears it here too
    if (live || (!editing.current && timer.current === null)) setDraft(shown);
  }, [shown, live]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function commit(next: string) {
    const clean = next.trim();
    const number = clean ? Math.max(min, Number(clean)) : null;
    if ((number == null ? "" : String(number)) === shown) return;
    onCommit(number);
  }

  function nudge(by: number) {
    const current = draft.trim() ? Number(draft) : 0;
    const next = String(Math.max(min, current + by));
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (live) {
      commit(next);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      commit(next);
    }, 600);
  }

  return (
    <span className={cn("studio-stepper", className)}>
      <input
        ref={inputRef}
        value={draft}
        inputMode="numeric"
        placeholder={placeholder}
        aria-label={label}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.]/g, "");
          setDraft(next);
          if (live) commit(next);
        }}
        onBlur={() => {
          editing.current = false;
          if (!live) commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            nudge(1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            nudge(-1);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (onEnter) {
              commit(draft);
              const clean = draft.trim();
              onEnter(clean ? Math.max(min, Number(clean)) : null);
            } else event.currentTarget.blur();
          }
        }}
      />
      <span className="studio-stepper-arrows">
        <button type="button" tabIndex={-1} aria-label={`more ${label}`} onClick={() => nudge(1)}>
          <ChevronUp aria-hidden="true" strokeWidth={1.75} />
        </button>
        <button type="button" tabIndex={-1} aria-label={`fewer ${label}`} onClick={() => nudge(-1)}>
          <ChevronDown aria-hidden="true" strokeWidth={1.75} />
        </button>
      </span>
    </span>
  );
}

/**
 * A production day, or a few at once: the dates from the same calendar as the inquiry form, with
 * "more days" under them, and the hours as windows from the time picker, each with a note if it
 * needs one, with "more hours that day" under them. Every day picked gets the same hours.
 */
export function DayEditor({
  day,
  hours,
  busy,
  submitLabel,
  onSave,
  onCancel,
  onRemove,
  removeLabel,
  removeNote,
  onSaved,
  variant = "card",
}: {
  day: string | null;
  hours: string;
  busy: boolean;
  submitLabel: string;
  /** a box for changing a day, or one line for adding them */
  variant?: "card" | "inline";
  onSave: (day: string, hours: string) => Promise<unknown> | void;
  onCancel?: () => void;
  onRemove?: () => void;
  /** "monday 11/30", for asking before it goes */
  removeLabel?: string;
  /** what else goes with it, like its shifts */
  removeNote?: string;
  /** after every day picked is saved */
  onSaved?: () => void;
}) {
  const [dates, setDates] = useState<Array<string | null>>([day]);
  const [windows, setWindows] = useState<DayWindowDraft[]>(() => readDayWindows(hours));
  // a day being changed stays one day; adding can take several
  const adding = !day;
  const picked = [...new Set(dates.filter((value): value is string => Boolean(value)))].sort();

  function setWindow(index: number, patch: Partial<DayWindowDraft>) {
    setWindows((current) =>
      current.map((window, at) => (at === index ? { ...window, ...patch } : window)),
    );
  }

  async function save() {
    if (!picked.length) return;
    const written = writeDayWindows(windows);
    for (const date of picked) await onSave(date, written);
    if (adding) {
      setDates([null]);
      setWindows([{ start: "", end: "", note: "" }]);
    }
    onSaved?.();
  }

  return (
    <div className={cn("studio-day-editor", `is-${variant}`)}>
      <div className="studio-day-dates">
        {dates.map((date, index) => (
          <div key={index} className="studio-day-date">
            <InquiryDatePicker
              value={date}
              withTime={false}
              allowPast
              compact
              placeholder={index ? "another day" : "pick the day"}
              onChange={(next) =>
                setDates((current) => current.map((value, at) => (at === index ? next : value)))
              }
            />
            {dates.length > 1 ? (
              <button
                type="button"
                className="studio-prod-x"
                aria-label="remove this day"
                onClick={() => setDates((current) => current.filter((_, at) => at !== index))}
              >
                <X aria-hidden="true" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        ))}
        {adding ? (
          <button
            type="button"
            className="studio-ghost studio-day-more"
            onClick={() => setDates((current) => [...current, null])}
          >
            <Plus aria-hidden="true" strokeWidth={1.5} />
            more days
          </button>
        ) : null}
      </div>
      <div className="studio-day-windows">
        {windows.map((window, index) => (
          <div key={index} className="studio-day-window">
            <InquiryTimePicker
              value={window.start}
              times={PRODUCTION_TIMES}
              compact
              placeholder="starts"
              onChange={(start) => setWindow(index, { start })}
            />
            <span className="studio-day-dash" aria-hidden="true">
              –
            </span>
            <InquiryTimePicker
              value={window.end}
              times={PRODUCTION_TIMES}
              compact
              placeholder="ends"
              onChange={(end) => setWindow(index, { end })}
            />
            <input
              className="studio-prod-input"
              value={window.note}
              placeholder="note: open access to the venue…"
              aria-label="note for these hours"
              onChange={(event) => setWindow(index, { note: event.target.value })}
            />
            {windows.length > 1 ? (
              <button
                type="button"
                className="studio-prod-x"
                aria-label="remove these hours"
                onClick={() => setWindows((current) => current.filter((_, at) => at !== index))}
              >
                <X aria-hidden="true" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="studio-ghost studio-day-more"
          onClick={() => setWindows((current) => [...current, { start: "", end: "", note: "" }])}
        >
          <Plus aria-hidden="true" strokeWidth={1.5} />
          more hours that day
        </button>
      </div>
      <div className="studio-day-go">
        <button
          type="button"
          className="studio-today-go is-pearl"
          disabled={!picked.length || busy}
          onClick={() => void save()}
        >
          {adding && picked.length > 1 ? `add ${picked.length} days` : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="studio-ghost" onClick={onCancel}>
            cancel
          </button>
        ) : null}
        {onRemove ? (
          <ConfirmRemove
            question={`remove ${removeLabel ?? "this day"}?`}
            detail={removeNote || undefined}
            disabled={busy}
            align="start"
            onConfirm={onRemove}
          >
            <button type="button" className="studio-ghost is-danger" disabled={busy}>
              remove day
            </button>
          </ConfirmRemove>
        ) : null}
      </div>
    </div>
  );
}

/** a task's day from the inquiry calendar and its time from the time picker: "2026-11-30T18:00" */
export function WhenPicker({
  value,
  onChange,
  allowPast = true,
}: {
  value: string;
  onChange: (next: string) => void;
  /** a task can sit in the past; a letter scheduled to send can't */
  allowPast?: boolean;
}) {
  const date = value.slice(0, 10) || null;
  const time = value.length > 10 ? pickerTime(value.slice(11, 16)) : "";
  return (
    <span className="studio-when-picker">
      <InquiryDatePicker
        value={date}
        withTime={false}
        allowPast={allowPast}
        compact
        placeholder="pick a day"
        onChange={(next) => onChange(next ? `${next}T${clockTime(time) || "09:00"}` : "")}
      />
      <InquiryTimePicker
        value={time}
        times={PRODUCTION_TIMES}
        compact
        disabled={!date}
        placeholder="time"
        onChange={(picked) => date && onChange(`${date}T${clockTime(picked)}`)}
      />
    </span>
  );
}
