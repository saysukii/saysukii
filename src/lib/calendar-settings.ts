const STORAGE_KEY = "say-sukii-calendar-settings";

export type DayHours = {
  day: number;
  open: boolean;
  start: string;
  end: string;
};

export type CalendarSettings = {
  days: DayHours[];
  meeting: "meet" | "phone";
  durationMinutes: 15 | 30 | 45 | 60;
  incrementMinutes: 15 | 30 | 60;
  horizonDays: 14 | 28 | 42 | 60;
  noticeHours: 1 | 4 | 12 | 24;
  bufferMinutes: 0 | 15 | 30;
  maxPerDay: 0 | 2 | 4 | 6 | 8;
};

const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export const DAY_NAMES = WEEK;

export const CLOCKS = Array.from({ length: 24 }, (_, hour) => [0, 30].map((minute) => clock(hour, minute))).flat();

export const DEFAULT_CALENDAR: CalendarSettings = {
  days: WEEK.map((_, day) => ({
    day,
    open: day >= 1 && day <= 5,
    start: "11:00",
    end: "16:00",
  })),
  meeting: "meet",
  durationMinutes: 30,
  incrementMinutes: 30,
  horizonDays: 28,
  noticeHours: 4,
  bufferMinutes: 0,
  maxPerDay: 0,
};

export function clock(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function clockLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date(2026, 0, 1, hour, minute);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

export function hasLocalCalendar() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) != null;
}

export function readLocalCalendar(): CalendarSettings {
  if (typeof window === "undefined") return DEFAULT_CALENDAR;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CALENDAR;
    return normalizeCalendar(JSON.parse(raw));
  } catch {
    return DEFAULT_CALENDAR;
  }
}

export function writeLocalCalendar(settings: CalendarSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeCalendar(settings)));
}

export function normalizeCalendar(value: unknown): CalendarSettings {
  const record = value && typeof value === "object" ? (value as Partial<CalendarSettings>) : {};
  const incoming = Array.isArray(record.days) ? record.days : [];
  const days = DEFAULT_CALENDAR.days.map((fallback) => {
    const match = incoming.find((item) => item && item.day === fallback.day);
    if (!match) return fallback;
    return {
      day: fallback.day,
      open: Boolean(match.open),
      start: validClock(match.start) ?? fallback.start,
      end: validClock(match.end) ?? fallback.end,
    };
  });
  const meeting = record.meeting;
  const duration = record.durationMinutes;
  const increment = record.incrementMinutes;
  const horizon = record.horizonDays;
  const notice = record.noticeHours;
  const buffer = record.bufferMinutes;
  const maxPerDay = record.maxPerDay;
  return {
    days,
    meeting: meeting === "phone" ? "phone" : "meet",
    durationMinutes: duration === 15 || duration === 45 || duration === 60 ? duration : 30,
    incrementMinutes: increment === 15 || increment === 60 ? increment : 30,
    horizonDays: horizon === 14 || horizon === 42 || horizon === 60 ? horizon : 28,
    noticeHours: notice === 1 || notice === 12 || notice === 24 ? notice : 4,
    bufferMinutes: buffer === 15 || buffer === 30 ? buffer : 0,
    maxPerDay: maxPerDay === 2 || maxPerDay === 4 || maxPerDay === 6 || maxPerDay === 8 ? maxPerDay : 0,
  };
}

function validClock(value: unknown) {
  return typeof value === "string" && CLOCKS.includes(value) ? value : null;
}

export function meetingLabel(meeting: CalendarSettings["meeting"]) {
  return meeting === "phone" ? "phone call" : "google meeting";
}

export function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function slotStarts(settings: CalendarSettings, day: Date) {
  const hours = settings.days.find((item) => item.day === day.getDay());
  if (!hours?.open) return [];
  const from = minutes(hours.start);
  const to = minutes(hours.end);
  const starts: { hour: number; minute: number }[] = [];
  const step = settings.incrementMinutes;
  for (let cursor = from; cursor + settings.durationMinutes <= to; cursor += step) {
    starts.push({ hour: Math.floor(cursor / 60), minute: cursor % 60 });
  }
  return starts;
}
