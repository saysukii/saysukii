import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { format, parseISO, startOfToday } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const INQUIRE_EVENT_TIMES = [
  "8:00 am",
  "9:00 am",
  "10:00 am",
  "11:00 am",
  "12:00 pm",
  "1:00 pm",
  "2:00 pm",
  "3:00 pm",
  "4:00 pm",
  "5:00 pm",
  "6:00 pm",
  "7:00 pm",
  "8:00 pm",
  "9:00 pm",
  "10:00 pm",
] as const;

export const INQUIRE_DELIVERY_TIMES = [
  "10:00 am",
  "11:00 am",
  "12:00 pm",
  "1:00 pm",
  "2:00 pm",
] as const;

function formatDisplayDate(value: string, compact: boolean) {
  return format(parseISO(value), compact ? "MMM d, yyyy" : "MMMM d, yyyy");
}

export function InquiryDatePicker({
  value,
  time,
  times = INQUIRE_EVENT_TIMES,
  disabled = false,
  withTime = true,
  allowPast = false,
  compact = false,
  placeholder = "select a date",
  onChange,
  onTimeChange,
}: {
  value: string | null;
  time?: string | undefined;
  times?: readonly string[];
  disabled?: boolean | undefined;
  withTime?: boolean;
  allowPast?: boolean;
  compact?: boolean;
  placeholder?: string;
  onChange: (value: string | null) => void;
  onTimeChange?: (time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [timesOpen, setTimesOpen] = useState(withTime && Boolean(value) && !disabled);
  const readyOnMount = useRef(Boolean(value));
  const selected = useMemo(() => (value ? parseISO(value) : undefined), [value]);
  const today = startOfToday();
  const showTimes = withTime && Boolean(value) && !disabled;
  const summary = value
    ? withTime
      ? `${formatDisplayDate(value, compact)}${time ? ` · ${time}` : " · pick a time"}`
      : formatDisplayDate(value, compact)
    : placeholder;

  useEffect(() => {
    if (!showTimes) {
      setTimesOpen(false);
      return;
    }
    if (open) return;
    if (readyOnMount.current) {
      readyOnMount.current = false;
      setTimesOpen(true);
      return;
    }
    const wait = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    const id = window.setTimeout(() => setTimesOpen(true), wait);
    return () => window.clearTimeout(id);
  }, [showTimes, open]);

  return (
    <div className={cn("inquire-datetime", compact && "is-compact")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "auth-input inquire-date-trigger",
              open && "inquire-date-trigger--open",
              timesOpen && "inquire-date-trigger--timed",
              !value && "inquire-date-trigger--empty",
            )}
          >
            <CalendarDays
              className={cn("shrink-0 opacity-55", compact ? "size-3.5" : "size-4")}
              aria-hidden="true"
            />
            <span>{summary}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align={compact ? "start" : "center"}
          sideOffset={compact ? 6 : 8}
          collisionPadding={12}
          className="inquire-calendar-popover z-[80] w-fit border-0 p-0 shadow-none"
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? today}
            disabled={allowPast ? undefined : { before: today }}
            onSelect={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : null);
              setOpen(false);
            }}
            className="inquire-calendar"
          />
        </PopoverContent>
      </Popover>
      {withTime && (showTimes || timesOpen) ? (
        <div
          className={cn("inquire-times", timesOpen && showTimes && "is-open")}
          aria-hidden={!timesOpen}
        >
          <div className="inquire-times-inner">
            <p>time</p>
            <div className="inquire-times-grid">
              {times.map((slot, index) => (
                <button
                  key={slot}
                  type="button"
                  style={{ "--i": index } as CSSProperties}
                  className={cn(time === slot && "is-on")}
                  onClick={() => onTimeChange?.(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InquiryTimePicker({
  value,
  times = INQUIRE_EVENT_TIMES,
  disabled = false,
  placeholder = "time",
  onChange,
}: {
  value: string;
  times?: readonly string[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn("inquire-time-trigger", open && "is-open", !value && "is-empty")}
        >
          <Clock className="size-4 shrink-0 opacity-55" aria-hidden="true" />
          <span>{value || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="inquire-time-popover z-[80] w-auto border-0 p-0 shadow-none"
      >
        <div className="inquire-times-grid" role="listbox" aria-label="time">
          {times.map((slot) => (
            <button
              key={slot}
              type="button"
              role="option"
              aria-selected={value === slot}
              className={cn(value === slot && "is-on")}
              onClick={() => {
                onChange(slot);
                setOpen(false);
              }}
            >
              {slot}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
