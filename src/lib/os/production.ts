import type {
  AppRole,
  EventType,
  ProductionDayRow,
  ProductionItemRow,
  ProductionItemStatus,
  ProductionRow,
  ProductionShiftRow,
  ProductionStatus,
  ProductionStemRow,
  ProductionTaskRow,
} from "@/integrations/supabase/types";
import { STUDIO_ZONE } from "@/lib/studio-bookings";

/** the steps a production moves through, in order, as the studio says them */
export const PRODUCTION_STATUSES: Array<{ id: ProductionStatus; label: string }> = [
  { id: "pre_production", label: "pre-production" },
  { id: "production", label: "production" },
  { id: "post_production", label: "post-production" },
  { id: "wrapped", label: "wrapped" },
];

export const ITEM_STATUSES: Array<{ id: ProductionItemStatus; label: string }> = [
  { id: "todo", label: "to do" },
  { id: "in_progress", label: "in progress" },
  { id: "done", label: "done" },
];

/** the kinds of task the studio has used, offered first when naming a task's category */
export const TASK_CATEGORIES = [
  "supply + logistics",
  "studio prep",
  "floral prep",
  "floral design execution",
  "install",
  "breakdown",
  // post-production: cleaning buckets, resetting the studio
  "wrap-up",
];

/** the kinds of order item the studio has used */
export const ITEM_KINDS = [
  "installation",
  "arrangements",
  "reception",
  "centerpieces",
  "personals",
];

export function productionStatusLabel(status: ProductionStatus) {
  return PRODUCTION_STATUSES.find((item) => item.id === status)?.label ?? status;
}

/** "Say Sukii x Google x Monks", the name the link and the page carry */
export function productionTitle(projectName: string) {
  return `Say Sukii x ${projectName.trim() || "Project"}`;
}

/** an address-safe name: "Google x Monks: AI Agents Live" becomes "google-x-monks-ai-agents-live" */
export function productionSlug(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "production";
}

/** the first free address among the ones taken: google-x-monks, then google-x-monks-2, … */
export function freeSlug(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const next = `${base}-${n}`;
    if (!used.has(next)) return next;
  }
}

/** what a new production is called before the studio renames it: the brand, or the person */
export function defaultProjectName(client: { name?: string | null; organization?: string | null }) {
  return client.organization?.trim() || client.name?.trim() || "New project";
}

/** today's date in the studio's own time zone, as yyyy-mm-dd */
export function studioToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** the production's last day: its latest production day, or the latest date the event holds */
export function lastProductionDay(days: Array<{ day: string }>, holdDates: string[]) {
  const all = [...days.map((item) => item.day), ...holdDates].filter((value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value),
  );
  return all.length ? all.sort().at(-1)! : null;
}

/** the production's first day, for sorting "your events" soonest first */
export function firstProductionDay(days: Array<{ day: string }>, holdDates: string[]) {
  const all = [...days.map((item) => item.day), ...holdDates].filter((value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value),
  );
  return all.length ? all.sort()[0]! : null;
}

/** how long after the last production day ends the team keeps the production, for wrap-up */
export const POST_PRODUCTION_HOURS = 48;

const CLOCK = "(\\d{1,2})(?::?(\\d{2}))?\\s*(am|pm)?";

/** "11am", "11:30pm", "1130pm" as minutes into the day, taking am/pm from its partner if it has none */
function clockMinutes(hour: string, minute: string | undefined, meridiem: string | undefined) {
  let h = Number(hour) % 12;
  if (meridiem?.toLowerCase() === "pm") h += 12;
  return h * 60 + Number(minute ?? 0);
}

/**
 * When a production day starts and ends, from the hours written on it: "10:00am – 10:00pm",
 * "11am-1130pm", "6–10pm", a line each. A window past midnight ends the next day. A day with no
 * times written runs all day.
 */
export function dayWindow(hours: string) {
  const range = new RegExp(`${CLOCK}\\s*[–—-]\\s*${CLOCK}`, "gi");
  let start: number | null = null;
  let end: number | null = null;
  for (const match of hours.matchAll(range)) {
    const [, h1, m1, mer1, h2, m2, mer2] = match;
    if (!h1 || !h2 || (!mer1 && !mer2)) continue;
    const from = clockMinutes(h1, m1, mer1 ?? mer2);
    let to = clockMinutes(h2, m2, mer2 ?? mer1);
    if (to <= from) to += 24 * 60;
    start = start === null ? from : Math.min(start, from);
    end = end === null ? to : Math.max(end, to);
  }
  return { start: start ?? 0, end: end ?? 24 * 60 };
}

/** a wall-clock time on a studio day, minutes past midnight, as an instant */
function studioInstant(day: string, minutes: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.floor(minutes / (24 * 60)));
  const within = minutes % (24 * 60);
  const stamp = `${date.toISOString().slice(0, 10)}T${String(Math.floor(within / 60)).padStart(2, "0")}:${String(within % 60).padStart(2, "0")}`;
  return taskInputInstant(stamp);
}

export type ProductionSchedule = {
  /** when the first production day starts */
  start: string | null;
  /** when the last production day ends */
  end: string | null;
  /** when post-production is over and the production wraps */
  wraps: string | null;
};

/** when a production runs, from its production days, or the event's own dates when it has none */
export function productionSchedule(
  days: Array<{ day: string; hours?: string }>,
  holdDates: string[],
): ProductionSchedule {
  const rows = [
    ...days.map((row) => ({ day: row.day, hours: row.hours ?? "" })),
    ...holdDates.map((day) => ({ day, hours: "" })),
  ].filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day));
  if (!rows.length) return { start: null, end: null, wraps: null };
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const firstDay = sorted[0]!.day;
  const lastDay = sorted.at(-1)!.day;
  // a day can be written twice (a production day that's also the event date); its hours win
  const hoursOn = (day: string) =>
    rows
      .filter((row) => row.day === day)
      .map((row) => row.hours)
      .join("\n");
  const start = studioInstant(firstDay, dayWindow(hoursOn(firstDay)).start);
  const end = studioInstant(lastDay, dayWindow(hoursOn(lastDay)).end);
  const wraps = end
    ? new Date(Date.parse(end) + POST_PRODUCTION_HOURS * 3_600_000).toISOString()
    : null;
  return { start, end, wraps };
}

/**
 * Where a production is, on its own: pre-production until the first day starts, production through
 * the production days, post-production for 48 hours after the last day ends, then wrapped.
 */
export function productionPhase(schedule: ProductionSchedule, now = Date.now()): ProductionStatus {
  if (!schedule.start || !schedule.end || !schedule.wraps) return "pre_production";
  if (now < Date.parse(schedule.start)) return "pre_production";
  if (now < Date.parse(schedule.end)) return "production";
  if (now < Date.parse(schedule.wraps)) return "post_production";
  return "wrapped";
}

/**
 * When the hours email goes to the studio: as soon as the last shift on the schedule ends. A shift
 * that ends before it starts runs past midnight. Nothing's due without shifts, since there's nothing
 * to pay.
 */
export function hoursDueAt(shifts: Array<{ day: string; starts: string; ends: string }>) {
  if (!shifts.length) return null;
  const minutes = (clock: string) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(clock);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const ends = shifts.flatMap((shift) => {
    const from = minutes(shift.starts);
    const to = minutes(shift.ends);
    if (from === null || to === null) return [];
    const at = studioInstant(shift.day, to > from ? to : to + 24 * 60);
    return at ? [Date.parse(at)] : [];
  });
  return ends.length ? new Date(Math.max(...ends)).toISOString() : null;
}

/**
 * Who has something new or changed on a production that they haven't been sent: a place on it, a
 * shift, or a task not yet shared, or something of theirs taken away since.
 */
export function unsharedPeople(
  crew: Array<{ profile_id: string; notified_at: string | null; changed_at?: string | null }>,
  shifts: Array<{ profile_id: string; notified_at: string | null }>,
  taskPeople: Array<{ profile_id: string; notified_at?: string | null }>,
) {
  return [
    ...new Set([
      ...crew
        .filter(
          (row) =>
            !row.notified_at ||
            (row.changed_at && Date.parse(row.changed_at) > Date.parse(row.notified_at)),
        )
        .map((row) => row.profile_id),
      ...shifts.filter((shift) => !shift.notified_at).map((shift) => shift.profile_id),
      ...taskPeople.filter((row) => !row.notified_at).map((row) => row.profile_id),
    ]),
  ];
}

/** the team can open a production until it wraps */
export function teamCanOpen(phase: ProductionStatus) {
  return phase !== "wrapped";
}

/** what happens next, for the line under the steps: "production starts mon 11/30 · 10:00am" */
export function phaseNext(schedule: ProductionSchedule, phase: ProductionStatus) {
  if (!schedule.start) return "add production days and it moves along on its own.";
  if (phase === "pre_production") return `production starts ${taskWhen(schedule.start)}`;
  if (phase === "production") return `post-production starts ${taskWhen(schedule.end)}`;
  if (phase === "post_production") {
    return `wraps ${taskWhen(schedule.wraps)}, and the team can't open it after that`;
  }
  return `wrapped ${taskWhen(schedule.wraps)}`;
}

/** a pasted list of stems, one per line, without bullets, boxes, or blank lines */
export function readStemList(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•◦▪]|\[[ xX]?\]|☐|☑|✓|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** the hours a production day keeps, one window or note a line */
export function dayLines(hours: string) {
  return hours
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** "friday 10/24", the way the production pages name a day */
export function productionDayLabel(day: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`;
}

/** "mon 11/30", for tabs and roster columns */
export function shortDayLabel(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const date = new Date(`${day}T12:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`;
}

/** "10/24 – 10/28", or one day, or nothing when there are no dates */
export function productionDateRange(first: string | null, last: string | null) {
  if (!first) return "";
  // "11/30", the way the production days read
  const short = (value: string) => {
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${Number(match[1])}/${Number(match[2])}` : value;
  };
  return last && last !== first ? `${short(first)} – ${short(last)}` : short(first);
}

/** when a task happens, in the studio's time: "fri 10/24 · 6:00pm" */
export function taskWhen(startsAt: string | null) {
  if (!startsAt) return "";
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  const day = date
    .toLocaleDateString("en-US", {
      timeZone: STUDIO_ZONE,
      weekday: "short",
      month: "numeric",
      day: "numeric",
    })
    .toLowerCase()
    .replace(",", "");
  const time = date
    .toLocaleTimeString("en-US", { timeZone: STUDIO_ZONE, hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
  return `${day} · ${time}`;
}

/** the wall-clock value a datetime field shows for a stored time, in the studio's zone */
export function taskInputValue(startsAt: string | null) {
  if (!startsAt) return "";
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** a datetime field's wall-clock value, read as the studio's time, back to a stored instant */
export function taskInputInstant(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  // guess the instant as if the studio were on utc, then correct by the zone's offset at that moment
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const shown = taskInputValue(new Date(guess).toISOString());
  const [, sy, smo, sd, sh, smi] = (
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(shown) ?? []
  ).map(Number) as [number, number, number, number, number, number];
  const offset = Date.UTC(sy, smo - 1, sd, sh, smi) - guess;
  return new Date(guess - offset).toISOString();
}

/** what a member's bell says when the studio shares changes to a production they're on */
export const PRODUCTION_CHANGED = "changes were made to this production";

/** the line a member's bell and letter lead with */
export function assignmentHeadline(count: number, projectName: string) {
  if (count === 0) return `you're on the team for ${projectName}`;
  return `you're on ${count} ${count === 1 ? "task" : "tasks"} for ${projectName}`;
}

type WaitingAssignment = {
  /** empty when they were added to the production itself, not to a task */
  task_id: string | null;
  /** a shift they were scheduled for */
  shift_id?: string | null;
  profile_id: string;
  inquiry_id: string;
  assigned_at: string;
};

/**
 * Assignments still waiting on their letter, gathered into one letter per member per production.
 * A production someone is still assigning on (anything in the last two minutes) waits for the next
 * sweep, so a whole sitting lands as one letter.
 */
export function assignmentLetters(
  waiting: WaitingAssignment[],
  now = Date.now(),
  settleMs = 2 * 60 * 1000,
) {
  const groups = new Map<string, WaitingAssignment[]>();
  for (const row of waiting) {
    const key = `${row.profile_id}:${row.inquiry_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .filter((rows) => rows.every((row) => now - Date.parse(row.assigned_at) >= settleMs))
    .map((rows) => ({
      profile_id: rows[0]!.profile_id,
      inquiry_id: rows[0]!.inquiry_id,
      task_ids: rows.flatMap((row) => (row.task_id ? [row.task_id] : [])),
      shift_ids: rows.flatMap((row) => (row.shift_id ? [row.shift_id] : [])),
    }));
}

export type ProductionPerson = {
  id: string;
  name: string;
  /** only admins see a member's email */
  email: string | null;
  active: boolean;
  role: AppRole;
  /** in the studio, invited and not joined yet, or added and not invited yet */
  standing: PersonStanding;
};

export type PersonStanding = "joined" | "invited" | "added";

/** where someone stands from their profile: a chosen name means they've joined */
export function personStanding(profile: {
  full_name: string | null;
  invited_at?: string | null | undefined;
}): PersonStanding {
  if (profile.full_name?.trim()) return "joined";
  return profile.invited_at ? "invited" : "added";
}

/** the name to show: their own, else the one the studio added them under, else their email's */
export function personName(profile: {
  full_name: string | null;
  added_name?: string | null | undefined;
  email: string;
}) {
  return profile.full_name?.trim() || profile.added_name?.trim() || profile.email.split("@")[0]!;
}

export type ProductionTaskView = ProductionTaskRow & { people: string[] };

export type ProductionFileView = {
  id: string;
  name: string;
  kind: "logistics" | "vision";
  href: string | null;
  file_type: string | null;
  created_at: string;
};

/** a production as its page draws it, for an admin or for an assigned member */
export type ProductionView = {
  production: ProductionRow;
  title: string;
  path: string;
  event: {
    type: EventType;
    first: string | null;
    last: string | null;
    venueName: string;
    venueAddress: string;
    loadIn: string | null;
    /** empty for members: the client's name stays with the studio */
    clientName: string;
  };
  days: ProductionDayRow[];
  items: ProductionItemRow[];
  stems: ProductionStemRow[];
  tasks: ProductionTaskView[];
  files: ProductionFileView[];
  /** admins: everyone who can be assigned. members: whoever is on this production. */
  people: ProductionPerson[];
  /** who's on this production, whether or not they have a task yet */
  crew: string[];
  /** flowers the studio has used before, suggested first in the recipe */
  stemSuggestions: string[];
  /** who works when */
  shifts: ProductionShiftRow[];
  /** what each person is paid, by the hour or flat for the production; only admins get these */
  rates: Record<string, MemberRate>;
  /** admins: who has something new or changed since the last share, and hasn't been sent it */
  unshared: string[];
  /** admins: who has been sent this production before */
  told: string[];
  /** whether the viewer handles pay: rates, pay, and the hours for payroll */
  canPay: boolean;
  /** the vision's own pdf, holding only the chosen proposal pages */
  visionUrl: string | null;
  /** admins choose the proposal the vision comes from; members get none */
  proposals: Array<{ id: string; number: string; href: string | null }>;
  /** where it is, on its own: pre-production, production, post-production, or wrapped */
  status: ProductionStatus;
  schedule: ProductionSchedule;
  access: { open: boolean; lastDay: string | null };
  viewer: { id: string; role: AppRole };
};

/** what every production starts with for dress code, until the studio writes its own */
export const DEFAULT_DRESS_CODE =
  "in studio: cozy, comfortable, whatever you'd like\non site: all black";

export const STUDIO_ADDRESS =
  "Zero Empty Spaces, 800 Silks Run, Suite 1307, Hallandale Beach, FL 33009";

/** "Cara", the way the production pages name a teammate */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * The flowers the recipe suggests as you type, before the studio's own stems from past productions
 * join them. Lowercase, the way the recipe reads.
 */
export const FLOWERS = [
  "allium",
  "alstroemeria",
  "amaranthus",
  "anemone",
  "anthurium",
  "astilbe",
  "baby's breath",
  "bird of paradise",
  "bougainvillea",
  "calla lily",
  "carnation",
  "celosia",
  "chrysanthemum",
  "craspedia",
  "cymbidium orchid",
  "dahlia",
  "delphinium",
  "dendrobium orchid",
  "disbud mum",
  "eucalyptus",
  "eucalyptus baby blue",
  "fern",
  "freesia",
  "garden rose",
  "gerbera",
  "ginger",
  "gladiolus",
  "heliconia",
  "hellebore",
  "hydrangea",
  "hypericum",
  "italian ruscus",
  "kangaroo paw",
  "larkspur",
  "leucadendron",
  "lily",
  "lisianthus",
  "magnolia leaf",
  "monstera",
  "oncidium orchid",
  "orchid phalaenopsis",
  "palm areca",
  "palmetto fan",
  "peony",
  "pincushion protea",
  "pampas grass",
  "protea",
  "ranunculus",
  "rose",
  "ruscus",
  "scabiosa",
  "snapdragon",
  "spray rose",
  "statice",
  "stock",
  "sweet pea",
  "thistle",
  "tulip",
  "vanda orchid",
  "veronica",
  "waxflower",
];

/** the colors a stem is chosen in, with a swatch for each */
export const FLOWER_COLORS: Array<{ name: string; swatch: string }> = [
  { name: "white", swatch: "#ffffff" },
  { name: "ivory", swatch: "#f6efdf" },
  { name: "blush", swatch: "#f6d5d3" },
  { name: "light pink", swatch: "#f7b8c8" },
  { name: "pink", swatch: "#f28bab" },
  { name: "hot pink", swatch: "#ff4d94" },
  { name: "salmon", swatch: "#f59a82" },
  { name: "coral", swatch: "#f2785c" },
  { name: "peach", swatch: "#f8c19a" },
  { name: "orange", swatch: "#f08a24" },
  { name: "yellow", swatch: "#f7d23e" },
  { name: "red", swatch: "#d62f3a" },
  { name: "burgundy", swatch: "#7a1f35" },
  { name: "lavender", swatch: "#c8b5e6" },
  { name: "purple", swatch: "#7f4fa3" },
  { name: "blue", swatch: "#6f9bd8" },
  { name: "green", swatch: "#7fa36b" },
  { name: "painted", swatch: "conic-gradient(#ff4d94, #f7d23e, #6f9bd8, #7fa36b, #ff4d94)" },
];

/** the flowers to suggest for what's typed: starts-with first, then anywhere in the name */
export function flowerMatches(typed: string, known: string[], limit = 8) {
  const term = typed.trim().toLowerCase();
  const all = [...new Set([...known.map((name) => name.toLowerCase()), ...FLOWERS])];
  if (!term) return [];
  const starts = all.filter((name) => name.startsWith(term));
  const inside = all.filter((name) => !name.startsWith(term) && name.includes(term));
  return [...starts, ...inside].filter((name) => name !== term).slice(0, limit);
}

/** "brand activation", the way an event type reads on the page */
export function eventTypeLabel(type: EventType) {
  return type.replace(/_/g, " ");
}

/** the times a production day or task can start or end, every half hour from 5am past midnight */
export const PRODUCTION_TIMES: string[] = Array.from({ length: 44 }, (_, index) => {
  const minutes = 5 * 60 + index * 30;
  return pickerTime(
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
  );
});

/** "18:30" as the time picker shows it: "6:30 pm" */
export function pickerTime(clock: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return "";
  const hour = Number(match[1]);
  const half = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${match[2]} ${half}`;
}

/** "6:30 pm" back to "18:30" */
export function clockTime(picked: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(picked.trim());
  if (!match) return "";
  const hour = (Number(match[1]) % 12) + (match[3]!.toLowerCase() === "pm" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export type DayWindowDraft = { start: string; end: string; note: string };

/** a production day's hours as windows to edit: "10:00am – 10:00pm (museum 6–10pm)", a line each */
export function readDayWindows(hours: string): DayWindowDraft[] {
  const lines = dayLines(hours);
  if (!lines.length) return [{ start: "", end: "", note: "" }];
  return lines.map((line) => {
    const match =
      /^(\d{1,2}:\d{2}\s*[ap]m)\s*[–—-]\s*(\d{1,2}:\d{2}\s*[ap]m)\s*(?:\((.*)\))?\s*$/i.exec(line);
    if (!match) return { start: "", end: "", note: line };
    const tidy = (value: string) => value.toLowerCase().replace(/\s*([ap]m)$/, " $1");
    return { start: tidy(match[1]!), end: tidy(match[2]!), note: match[3]?.trim() ?? "" };
  });
}

/** the windows written back as a day's hours, the way the page and the schedule read them */
export function writeDayWindows(windows: DayWindowDraft[]) {
  return windows
    .map((window) => {
      const compact = (value: string) => value.replace(/\s+/g, "");
      const span =
        window.start && window.end
          ? `${compact(window.start)} – ${compact(window.end)}`
          : compact(window.start || window.end);
      const note = window.note.trim();
      if (span && note) return `${span} (${note})`;
      return span || note;
    })
    .filter(Boolean)
    .join("\n");
}

/** minutes a shift runs: "22:00" to "02:00" runs past midnight, four hours */
export function shiftMinutes(starts: string, ends: string) {
  const read = (clock: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const from = read(starts);
  const to = read(ends);
  if (from === null || to === null) return 0;
  return to > from ? to - from : to + 24 * 60 - from;
}

/** hours a shift runs, to the quarter hour as it reads: 8, 7.5, 4.25 */
export function shiftHours(starts: string, ends: string) {
  return Math.round((shiftMinutes(starts, ends) / 60) * 100) / 100;
}

/** "10:00am – 6:00pm" */
export function shiftSpan(starts: string, ends: string) {
  const short = (clock: string) => pickerTime(clock).replace(" ", "");
  return `${short(starts)} – ${short(ends)}`;
}

/** "8 hrs", "7.5 hrs", "1 hr" */
export function hoursLabel(hours: number) {
  const shown = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
  return `${shown} ${hours === 1 ? "hr" : "hrs"}`;
}

export type ShiftLike = {
  id?: string;
  profile_id: string;
  day: string;
  starts: string;
  ends: string;
  role: string;
  location: string;
};

/** how someone is paid: by the hour, or one flat amount for the production */
export type RatePer = "hour" | "production";
export type MemberRate = { cents: number; per: RatePer };

/** rows from production_rates, keyed by person, as the schedule reads them */
export function rateMap(rows: Array<{ profile_id: string; cents: number; per: string }>) {
  return Object.fromEntries(
    rows.map((row) => [
      row.profile_id,
      { cents: row.cents, per: row.per === "production" ? "production" : "hour" } as MemberRate,
    ]),
  ) as Record<string, MemberRate>;
}

/** "$28/hr", "$400 flat" */
export function rateLabel(rate: MemberRate | null | undefined) {
  if (!rate) return "no rate";
  const dollars = rate.cents / 100;
  const amount = `$${Number.isInteger(dollars) ? dollars.toLocaleString("en-US") : dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return rate.per === "hour" ? `${amount}/hr` : `${amount} flat`;
}

/** what a rate comes to for these hours: by the hour, or the flat amount once they work at all */
export function ratePay(rate: MemberRate | null | undefined, hours: number) {
  if (!rate) return null;
  if (rate.per === "production") return hours > 0 ? rate.cents : 0;
  return Math.round(hours * rate.cents);
}

export type HoursPerson = {
  profile_id: string;
  name: string;
  shifts: Array<ShiftLike & { hours: number }>;
  hours: number;
  /** how they're paid, when the studio has set it */
  rate: MemberRate | null;
  pay_cents: number | null;
};

/**
 * The hours for payroll, a person at a time, paid on the scheduled hours: each shift, the hours,
 * the rate, and what that comes to.
 */
export function hoursSummary(
  shifts: ShiftLike[],
  names: Map<string, string>,
  rates: Record<string, MemberRate>,
) {
  const byPerson = new Map<string, HoursPerson>();
  const sorted = [...shifts].sort((a, b) =>
    `${a.day}${a.starts}`.localeCompare(`${b.day}${b.starts}`),
  );
  for (const shift of sorted) {
    const person = byPerson.get(shift.profile_id) ?? {
      profile_id: shift.profile_id,
      name: names.get(shift.profile_id) ?? "a teammate",
      shifts: [],
      hours: 0,
      rate: rates[shift.profile_id] ?? null,
      pay_cents: null,
    };
    const hours = shiftHours(shift.starts, shift.ends);
    person.shifts.push({ ...shift, hours });
    person.hours = Math.round((person.hours + hours) * 100) / 100;
    byPerson.set(shift.profile_id, person);
  }
  const people = [...byPerson.values()]
    .map((person) => ({
      ...person,
      pay_cents: ratePay(person.rate, person.hours),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hours = Math.round(people.reduce((sum, person) => sum + person.hours, 0) * 100) / 100;
  const pay = people.some((person) => person.pay_cents != null)
    ? people.reduce((sum, person) => sum + (person.pay_cents ?? 0), 0)
    : null;
  return { people, hours, pay_cents: pay };
}

/** the hours as a spreadsheet a google sheet opens as is: a row a shift */
export function hoursCsv(projectName: string, summary: ReturnType<typeof hoursSummary>) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
  const rows = [
    [
      "production",
      "person",
      "date",
      "start",
      "end",
      "hours",
      "role",
      "location",
      "paid",
      "rate",
      "pay",
    ],
  ];
  for (const person of summary.people) {
    person.shifts.forEach((shift, index) => {
      const { rate } = person;
      // a flat rate is paid once, on the person's first shift, so the pay column still adds up
      const pay =
        rate?.per === "production" ? (index === 0 ? rate.cents : null) : ratePay(rate, shift.hours);
      rows.push([
        projectName,
        person.name,
        shift.day,
        pickerTime(shift.starts),
        pickerTime(shift.ends),
        String(shift.hours),
        shift.role,
        shift.location,
        rate ? (rate.per === "hour" ? "hourly" : "flat") : "",
        dollars(rate?.cents ?? null),
        dollars(pay),
      ]);
    });
  }
  return rows.map((row) => row.map(cell).join(",")).join("\n");
}
