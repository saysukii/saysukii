import { Copy, Plus, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  CLOCKS,
  clockLabel,
  DAY_NAMES,
  DEFAULT_CALENDAR,
  readLocalCalendar,
  writeLocalCalendar,
  type CalendarSettings,
  type DayHours,
} from "@/lib/calendar-settings";
import { saveCalendarSettings } from "@/lib/os/calendar-settings.functions";
import { useDevPreview } from "@/lib/use-dev-preview";

export function CalendarHours({ onSaved }: { onSaved?: () => void } = {}) {
  const devPreview = useDevPreview();
  const save = useServerFn(saveCalendarSettings);
  const [hours, setHours] = useState<CalendarSettings>(DEFAULT_CALENDAR);
  useEffect(() => {
    setHours(readLocalCalendar());
  }, []);

  const persist = useMutation({
    mutationFn: async (next: CalendarSettings) => {
      writeLocalCalendar(next);
      if (devPreview) return next;
      await save({ data: next });
      return next;
    },
    onSuccess: () => {
      toast.success("settings saved");
      onSaved?.();
    },
    onError: () => toast("saved on this browser"),
  });

  function updateDay(day: number, patch: Partial<DayHours>) {
    setHours((current) => ({
      ...current,
      days: current.days.map((item) => (item.day === day ? { ...item, ...patch } : item)),
    }));
  }

  function copyTimes(source: DayHours, days: number[]) {
    setHours((current) => ({
      ...current,
      days: current.days.map((item) =>
        days.includes(item.day)
          ? { ...item, open: true, start: source.start, end: source.end }
          : item,
      ),
    }));
  }

  return (
    <section className={cn("studio-hours", onSaved && "is-dialog")} aria-label="booking settings">
      <div className="studio-hours-block">
        <div className="studio-hours-fields is-top">
          <Field label="meeting preference">
            <select
              value={hours.meeting}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  meeting: event.target.value === "phone" ? "phone" : "meet",
                }))
              }
            >
              <option value="meet">google meeting</option>
              <option value="phone">phone call</option>
            </select>
          </Field>
          <Field label="length">
            <select
              value={hours.durationMinutes}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  durationMinutes: Number(
                    event.target.value,
                  ) as CalendarSettings["durationMinutes"],
                }))
              }
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </Field>
          <Field label="start times">
            <select
              value={hours.incrementMinutes}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  incrementMinutes: Number(
                    event.target.value,
                  ) as CalendarSettings["incrementMinutes"],
                }))
              }
            >
              <option value={15}>every 15 min</option>
              <option value={30}>every 30 min</option>
              <option value={60}>every hour</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="studio-hours-block">
        <div className="studio-hours-block-head">
          <p>weekly hours</p>
        </div>
        <div className="studio-hours-days">
          {hours.days.map((item) => {
            const name = DAY_NAMES[item.day];
            return (
              <div key={item.day} className="studio-hours-row">
                <span className={cn("studio-hours-mark", item.open && "is-on")} aria-hidden="true">
                  {name?.slice(0, 1)}
                </span>
                {item.open ? (
                  <>
                    <div className="studio-hours-window">
                      <Clock
                        label={`${name} starts`}
                        value={item.start}
                        onChange={(start) =>
                          updateDay(item.day, { start, end: laterEnd(start, item.end) })
                        }
                      />
                      <span>to</span>
                      <Clock
                        label={`${name} ends`}
                        value={item.end}
                        onChange={(end) => updateDay(item.day, { end })}
                        after={item.start}
                      />
                    </div>
                    <div className="studio-hours-actions">
                      <button
                        type="button"
                        className="studio-hours-icon"
                        aria-label={`close ${name}`}
                        onClick={() => updateDay(item.day, { open: false })}
                      >
                        <X aria-hidden="true" strokeWidth={1.5} />
                      </button>
                      <CopyTimes source={item} onApply={(days) => copyTimes(item, days)} />
                    </div>
                  </>
                ) : (
                  <>
                    <p>closed</p>
                    <button
                      type="button"
                      className="studio-hours-icon"
                      aria-label={`open ${name}`}
                      onClick={() => updateDay(item.day, { open: true })}
                    >
                      <Plus aria-hidden="true" strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="studio-hours-block">
        <p>scheduling</p>
        <div className="studio-hours-fields">
          <Field label="book ahead">
            <select
              value={hours.horizonDays}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  horizonDays: Number(event.target.value) as CalendarSettings["horizonDays"],
                }))
              }
            >
              <option value={14}>2 weeks</option>
              <option value={28}>4 weeks</option>
              <option value={42}>6 weeks</option>
              <option value={60}>60 days</option>
            </select>
          </Field>
          <Field label="notice">
            <select
              value={hours.noticeHours}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  noticeHours: Number(event.target.value) as CalendarSettings["noticeHours"],
                }))
              }
            >
              <option value={1}>1 hour</option>
              <option value={4}>4 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>1 day</option>
            </select>
          </Field>
          <Field label="buffer">
            <select
              value={hours.bufferMinutes}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  bufferMinutes: Number(event.target.value) as CalendarSettings["bufferMinutes"],
                }))
              }
            >
              <option value={0}>none</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
            </select>
          </Field>
          <Field label="per day">
            <select
              value={hours.maxPerDay}
              onChange={(event) =>
                setHours((current) => ({
                  ...current,
                  maxPerDay: Number(event.target.value) as CalendarSettings["maxPerDay"],
                }))
              }
            >
              <option value={0}>no limit</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={8}>8</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="studio-hours-save">
        <button
          type="button"
          className="studio-today-go"
          disabled={persist.isPending}
          onClick={() => persist.mutate(hours)}
        >
          {persist.isPending ? "saving…" : "save"}
        </button>
      </div>
    </section>
  );
}

function CopyTimes({ source, onApply }: { source: DayHours; onApply: (days: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPicked([]);
      }}
    >
      <PopoverTrigger
        className="studio-hours-icon"
        aria-label={`copy ${DAY_NAMES[source.day]} hours`}
      >
        <Copy aria-hidden="true" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent
        className="studio-hours-copy z-[80] w-60 rounded-2xl border-0 bg-[#fff8f9] p-3 text-[#24221f] shadow-[0_18px_40px_rgba(73,68,61,0.16)]"
        align="end"
        sideOffset={8}
      >
        <p>copy times to</p>
        <div>
          {DAY_NAMES.map((name, day) => {
            const locked = day === source.day;
            const on = locked || picked.includes(day);
            return (
              <button
                key={name}
                type="button"
                disabled={locked}
                aria-pressed={on}
                className={on ? "is-on" : undefined}
                onClick={() =>
                  setPicked((current) =>
                    current.includes(day)
                      ? current.filter((item) => item !== day)
                      : [...current, day],
                  )
                }
              >
                <span />
                {name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="studio-today-go"
          disabled={picked.length === 0}
          onClick={() => {
            onApply(picked);
            setOpen(false);
          }}
        >
          apply
        </button>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Clock({
  label,
  value,
  after,
  onChange,
}: {
  label?: string;
  value: string;
  after?: string;
  onChange: (value: string) => void;
}) {
  const choices = after ? CLOCKS.filter((item) => item > after) : CLOCKS;
  return (
    <select
      aria-label={label}
      value={choices.includes(value) ? value : choices[0]}
      onChange={(event) => onChange(event.target.value)}
    >
      {choices.map((item) => (
        <option key={item} value={item}>
          {clockLabel(item)}
        </option>
      ))}
    </select>
  );
}

function laterEnd(start: string, end: string) {
  return end > start ? end : (CLOCKS.find((item) => item > start) ?? end);
}
