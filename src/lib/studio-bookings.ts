import { DEFAULT_CALENDAR, slotStarts, type CalendarSettings } from "@/lib/calendar-settings";

const STORAGE_KEY = "say-sukii-bookings";
const CAPTURE_KEY = "say-sukii-meeting-captures";

export type StudioBooking = {
  id: string;
  startsAt: string;
  name: string;
  email: string;
  note: string;
  allDay?: boolean;
  joinUrl?: string;
};

export type MeetingBrief = {
  email: string;
  slug: string;
  line: string;
  words: string;
};

export type MeetingCapture = {
  recording: boolean;
  done: boolean;
  summary: string;
};

const STUDIO_ZONE = "America/New_York";

export type BusyWindow = { start: string; end: string };

export function readBookings(): StudioBooking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StudioBooking[]) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => row?.startsAt && row.email) : [];
  } catch {
    return [];
  }
}

export function readMeetingCaptures(): Record<string, MeetingCapture> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CAPTURE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, MeetingCapture>) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, MeetingCapture] =>
          typeof entry[1]?.summary === "string" && typeof entry[1]?.done === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function writeMeetingCapture(id: string, capture: MeetingCapture) {
  const captures = { ...readMeetingCaptures(), [id]: capture };
  window.localStorage.setItem(CAPTURE_KEY, JSON.stringify(captures));
}

export function rememberBooking(draft: Omit<StudioBooking, "id">) {
  const booking: StudioBooking = { ...draft, id: crypto.randomUUID() };
  const rows = readBookings().filter(
    (row) => !(row.startsAt === booking.startsAt && row.email.toLowerCase() === booking.email.toLowerCase()),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...rows, booking]));
  return booking;
}

export function slotKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

export function monthCells(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), day));
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function isBookableDay(day: Date, settings: CalendarSettings = DEFAULT_CALENDAR, today = new Date()) {
  const hours = settings.days.find((item) => item.day === day.getDay());
  if (!hours?.open) return false;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + settings.horizonDays);
  const noon = new Date(day);
  noon.setHours(12, 0, 0, 0);
  return noon >= start && noon < end;
}

export function openDays(settings: CalendarSettings, count: number, today = new Date()) {
  const days: Date[] = [];
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  for (let step = 0; step < settings.horizonDays && days.length < count; step += 1) {
    const day = new Date(cursor);
    if (isBookableDay(day, settings, today)) days.push(day);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isStudioToday(day: Date, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return day.getFullYear() === read("year") && day.getMonth() + 1 === read("month") && day.getDate() === read("day");
}

export function daySlots(
  day: Date,
  taken: Set<string>,
  windows: BusyWindow[] = [],
  settings: CalendarSettings = DEFAULT_CALENDAR,
  now = new Date(),
) {
  const key = studioDay(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString());
  if (settings.maxPerDay > 0) {
    const held = windows.filter((window) => studioDay(window.start) === key).length;
    if (held >= settings.maxPerDay) return [];
  }
  const notice = settings.noticeHours * 60 * 60 * 1000;
  const buffer = settings.bufferMinutes * 60 * 1000;
  return slotStarts(settings, day)
    .map(({ hour, minute }) => {
      const start = studioInstant(day, hour, minute);
      const end = new Date(start.getTime() + settings.durationMinutes * 60 * 1000);
      const booked =
        taken.has(slotKey(start)) ||
        windows.some((window) => start < new Date(new Date(window.end).getTime() + buffer) && end > new Date(window.start));
      return {
        startsAt: start.toISOString(),
        label: formatStudioTime(start),
        range: `${formatStudioTime(start)} – ${formatStudioTime(end)}`,
        past: start.getTime() <= now.getTime() + notice,
        booked,
      };
    })
    .filter((slot) => !slot.past && !slot.booked);
}

function formatStudioTime(value: Date) {
  return value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: STUDIO_ZONE }).toLowerCase();
}

export function studioDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function studioClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatStudioTime(date);
}

function studioInstant(day: Date, hour: number, minute: number) {
  const guess = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const shown = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
  return new Date(guess - (shown - guess));
}

export function bookingStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${day} · ${time}`;
}

export function bookingWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${day} · ${time}`;
}

export function bookingWindow(startsAt: string, minutes: number) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const day = start
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: STUDIO_ZONE })
    .toLowerCase();
  const startTime = formatStudioTime(start);
  const endTime = formatStudioTime(end);
  const startClock = startTime.slice(-2) === endTime.slice(-2) ? startTime.replace(/ [ap]m$/, "") : startTime;
  return `${day} · ${startClock} – ${endTime}`;
}

export function scheduleMeetingUrl() {
  return "https://inside.saysukii.com/schedule";
}
