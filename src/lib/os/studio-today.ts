import type { ClientRow, EventType, InquiryStatus, ProjectRow, TaskRow } from "@/integrations/supabase/types";
import type { InquiryPipelineItem } from "@/lib/os/inquiries.functions";
import { isBookInquiry } from "@/lib/os/inquiry-detection";
import { EVENT_LABEL, daysWaiting, nextMove, waitingTone, visionNote, inquiryTime } from "@/lib/os/inquiry-desk";

export type TodayAging = "fresh" | "due" | "overdue";

export type TodayInquiry = InquiryPipelineItem & {
  days_waiting: number;
  aging: TodayAging;
};

export type TodayProject = ProjectRow & {
  client: ClientRow | null;
  same_weekend: boolean;
};

export type DeskKind = "inquiry" | "production" | "manual";

export type TodayDeskTask = TaskRow & {
  kind: DeskKind;
  person: string | null;
  inquiry: InquiryPipelineItem | null;
  project: TodayProject | (ProjectRow & { client: ClientRow | null }) | null;
};

export type TodayFloorItem = {
  id: string;
  date: string;
  when: string;
  title: string;
  detail: string;
  kind: DeskKind | "event";
  taskId?: string;
};

export type DeskGlance = {
  name: string;
  kicker: string;
  date: string | null;
  place: string | null;
  figure: string | null;
  vision: string | null;
  phone: string | null;
  email: string | null;
};

export type StudioToday = {
  counts: Record<InquiryStatus, number>;
  waiting: TodayInquiry[];
  upcoming: TodayProject[];
  inboundWeek: number[];
  byEvent: Array<{ type: EventType; label: string; count: number }>;
  calendarMarks: string[];
  tasks: TaskRow[];
  desk: TodayDeskTask[];
  projects: TodayProject[];
};

export const DESK_KIND_LABEL: Record<DeskKind, string> = {
  inquiry: "inquiry",
  production: "production",
  manual: "studio note",
};

function dateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function aging(days: number): TodayAging {
  if (days >= 4) return "overdue";
  if (days >= 2) return "due";
  return "fresh";
}

function needsStudio(status: InquiryStatus) {
  return status !== "booked" && status !== "closed";
}

function weekendKey(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  if (![0, 5, 6].includes(day)) return null;
  const fromFriday = day === 0 ? 2 : day - 5;
  date.setDate(date.getDate() - fromFriday);
  return dateOnly(date);
}

export function firstName(fullName: string | null | undefined, _email?: string | null) {
  const name = fullName?.trim().split(/\s+/)[0];
  if (name && !/^(studio|preview)$/i.test(name)) return name.toLowerCase();
  return "sukii";
}

export function dayGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5 || hour >= 21) return "late night";
  if (hour < 12) return "good morning";
  if (hour < 17) return "good afternoon";
  return "good evening";
}

export function longDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function deskKind(task: Pick<TaskRow, "linked_type">): DeskKind {
  if (task.linked_type === "inquiry") return "inquiry";
  if (task.linked_type === "project") return "production";
  return "manual";
}

export function weekBounds(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const start = dateOnly(date);
  date.setDate(date.getDate() + 6);
  return { start, end: dateOnly(date) };
}

export function weekDays(weekOf: string) {
  const { start } = weekBounds(weekOf);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${start}T12:00:00`);
    date.setDate(date.getDate() + index);
    return dateOnly(date);
  });
}

export function weekLabel(weekOf: string, today: string) {
  const { start, end } = weekBounds(weekOf);
  if (today >= start && today <= end) return "this week";
  const fmt = (value: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
      .format(new Date(`${value}T12:00:00`))
      .toLowerCase();
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatFloorWhen(iso: string, today: string) {
  const day = iso.slice(0, 10);
  if (day === today) return "today";
  const date = new Date(`${day}T12:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  return `${weekday} ${date.getDate()}`;
}

function floorPerson(
  task: TaskRow,
  inquiries: TodayInquiry[],
  projects: TodayProject[],
) {
  if (task.linked_type === "inquiry" && task.linked_id) {
    return inquiries.find((inquiry) => inquiry.id === task.linked_id)?.client?.name ?? null;
  }
  if (task.linked_type === "project" && task.linked_id) {
    return projects.find((project) => project.id === task.linked_id)?.client?.name ?? null;
  }
  return null;
}

export function weekFloor(
  data: Pick<StudioToday, "projects" | "waiting" | "tasks" | "desk">,
  weekOf: string,
  today: string,
): TodayFloorItem[] {
  const { start, end } = weekBounds(weekOf);
  const currentWeek = today >= start && today <= end;
  const items: TodayFloorItem[] = [];

  for (const project of data.projects) {
    if (project.event_date < start || project.event_date > end) continue;
    items.push({
      id: `event-${project.id}`,
      date: project.event_date,
      when: formatFloorWhen(project.event_date, today),
      title: project.event_name,
      detail: ["event", project.client?.name ?? project.venue_text].filter(Boolean).join(" · "),
      kind: "event",
      taskId: data.desk.find((task) => task.linked_id === project.id)?.id,
    });
  }

  const covered = new Set(data.projects.map((project) => `${project.client_id}:${project.event_date}`));
  for (const inquiry of data.waiting) {
    if (!inquiry.event_date || inquiry.event_date_tbd) continue;
    if (inquiry.event_date < start || inquiry.event_date > end) continue;
    if (covered.has(`${inquiry.client_id}:${inquiry.event_date}`)) continue;
    items.push({
      id: `inquiry-${inquiry.id}`,
      date: inquiry.event_date,
      when: formatFloorWhen(inquiry.event_date, today),
      title: inquiry.client?.name ?? EVENT_LABEL[inquiry.event_type],
      detail: ["event", EVENT_LABEL[inquiry.event_type]].join(" · "),
      kind: "event",
      taskId: data.desk.find((task) => task.linked_id === inquiry.id)?.id,
    });
  }

  for (const task of data.tasks) {
    if (task.status !== "open") continue;
    const due = dueDay(task.due_at);
    const date = due ?? today;
    const inWeek = date >= start && date <= end;
    const overdueHere = currentWeek && due !== null && due < today;
    if (!inWeek && !overdueHere && !(currentWeek && !due)) continue;
    const kind = deskKind(task);
    const whenDate = inWeek ? date : today;
    items.push({
      id: `task-${task.id}`,
      date: whenDate,
      when: formatFloorWhen(whenDate, today),
      title: task.title,
      detail: [DESK_KIND_LABEL[kind], floorPerson(task, data.waiting, data.projects)].filter(Boolean).join(" · "),
      kind,
      taskId: task.id,
    });
  }

  return items.sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) return byDate;
    const rank = (kind: TodayFloorItem["kind"]) => (kind === "event" ? 0 : 1);
    const byKind = rank(left.kind) - rank(right.kind);
    if (byKind !== 0) return byKind;
    return left.title.localeCompare(right.title);
  });
}

function dueDay(dueAt: string | null) {
  return dueAt?.slice(0, 10) ?? null;
}

export function isDeskTask(task: TaskRow, today: string) {
  if (task.status !== "open") return false;
  const due = dueDay(task.due_at);
  return !due || due <= today;
}

export function toDeskTask(
  task: TaskRow,
  inquiries: TodayInquiry[],
  projects: TodayProject[],
): TodayDeskTask {
  const inquiry =
    task.linked_type === "inquiry" && task.linked_id
      ? (inquiries.find((item) => item.id === task.linked_id) ?? null)
      : null;
  const project =
    task.linked_type === "project" && task.linked_id
      ? (projects.find((item) => item.id === task.linked_id) ?? null)
      : null;
  return {
    ...task,
    kind: deskKind(task),
    person: inquiry?.client?.name ?? project?.client?.name ?? null,
    inquiry,
    project,
  };
}

function sortOldestFirst(left: TaskRow, right: TaskRow) {
  const a = left.due_at ?? left.created_at;
  const b = right.due_at ?? right.created_at;
  const byDue = a.localeCompare(b);
  if (byDue !== 0) return byDue;
  return left.created_at.localeCompare(right.created_at);
}

export function glanceBits(inquiry: TodayInquiry) {
  const time = inquiryTime(inquiry.message);
  return {
    next: nextMove(inquiry.status),
    event: EVENT_LABEL[inquiry.event_type],
    date: inquiry.event_date_tbd
      ? "date tbd"
      : [new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(`${inquiry.event_date}T12:00:00`)), time]
          .filter(Boolean)
          .join(" · "),
    place: inquiry.venue_text,
    figure: inquiry.budget_range,
    vision: visionNote(inquiry.message),
    email: inquiry.client?.email,
    phone: inquiry.client?.phone,
    tone: waitingTone(inquiry.days_waiting),
  };
}

export function deskGlance(task: TodayDeskTask): DeskGlance {
  if (task.inquiry) {
    const days = daysWaiting(task.inquiry.received_at);
    const bits = glanceBits({ ...task.inquiry, days_waiting: days, aging: aging(days) });
    return {
      name: task.inquiry.client?.name ?? "client",
      kicker: `${bits.event} · ${task.title}`,
      date: bits.date,
      place: bits.place ?? null,
      figure: bits.figure ?? null,
      vision: bits.vision || null,
      phone: bits.phone ?? null,
      email: bits.email ?? null,
    };
  }

  if (task.project) {
    return {
      name: task.project.client?.name ?? task.project.event_name,
      kicker: `${task.project.event_name} · ${task.title}`,
      date: new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
        new Date(`${task.project.event_date}T12:00:00`),
      ),
      place: task.project.venue_text,
      figure: null,
      vision: task.project.notes,
      phone: task.project.client?.phone ?? null,
      email: task.project.client?.email ?? null,
    };
  }

  return {
    name: task.title,
    kicker: task.person ?? "the desk",
    date: task.due_at
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(task.due_at))
      : null,
    place: null,
    figure: null,
    vision: null,
    phone: null,
    email: null,
  };
}

export function assembleStudioToday(input: {
  inquiries: InquiryPipelineItem[];
  projects: Array<ProjectRow & { client?: ClientRow | null }>;
  tasks?: TaskRow[];
  now?: Date;
}): StudioToday {
  const now = input.now ?? new Date();
  const today = dateOnly(now);
  const inquiries = input.inquiries.filter(isBookInquiry);
  const statuses: InquiryStatus[] = [
    "new",
    "contacted",
    "in_conversation",
    "proposal_sent",
    "booked",
    "closed",
  ];
  const counts = Object.fromEntries(
    statuses.map((status) => [status, inquiries.filter((item) => item.status === status).length]),
  ) as Record<InquiryStatus, number>;

  const waiting = inquiries
    .filter((inquiry) => needsStudio(inquiry.status))
    .map((inquiry) => {
      const days = daysWaiting(inquiry.received_at);
      return { ...inquiry, days_waiting: days, aging: aging(days) };
    })
    .sort((left, right) => right.days_waiting - left.days_waiting);

  const weekendCounts = new Map<string, number>();
  for (const project of input.projects) {
    const key = weekendKey(project.event_date);
    if (!key) continue;
    weekendCounts.set(key, (weekendCounts.get(key) ?? 0) + 1);
  }

  const projects: TodayProject[] = input.projects
    .slice()
    .sort((left, right) => left.event_date.localeCompare(right.event_date))
    .map((project) => {
      const key = weekendKey(project.event_date);
      return {
        ...project,
        client: project.client ?? null,
        same_weekend: key ? (weekendCounts.get(key) ?? 0) > 1 : false,
      };
    });

  const upcoming = projects.filter((project) => project.event_date >= today);

  const inboundWeek = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const stamp = dateOnly(day);
    return inquiries.filter((inquiry) => inquiry.received_at.slice(0, 10) === stamp).length;
  });

  const byEvent = (Object.keys(EVENT_LABEL) as EventType[])
    .map((type) => ({
      type,
      label: EVENT_LABEL[type],
      count: inquiries.filter((inquiry) => needsStudio(inquiry.status) && inquiry.event_type === type).length,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);

  const calendarMarks = [
    ...new Set(
      [
        ...input.projects.map((project) => project.event_date),
        ...inquiries
          .filter((inquiry) => inquiry.event_date && !inquiry.event_date_tbd)
          .map((inquiry) => inquiry.event_date as string),
      ].filter(Boolean),
    ),
  ];

  const inquiryById = new Map(inquiries.map((inquiry) => [inquiry.id, inquiry]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const desk: TodayDeskTask[] = [...(input.tasks ?? [])]
    .filter((task) => isDeskTask(task, today))
    .sort(sortOldestFirst)
    .map((task) => {
      const kind = deskKind(task);
      const inquiry =
        task.linked_type === "inquiry" && task.linked_id ? (inquiryById.get(task.linked_id) ?? null) : null;
      const project =
        task.linked_type === "project" && task.linked_id ? (projectById.get(task.linked_id) ?? null) : null;
      return {
        ...task,
        kind,
        person: inquiry?.client?.name ?? project?.client?.name ?? null,
        inquiry,
        project,
      };
    });

  return {
    counts,
    waiting,
    upcoming,
    inboundWeek,
    byEvent,
    calendarMarks,
    desk,
    projects,
    tasks: [...(input.tasks ?? [])].sort((left, right) => {
      if (left.status !== right.status) return left.status === "open" ? -1 : 1;
      if (left.due_at && right.due_at) return left.due_at.localeCompare(right.due_at);
      if (left.due_at) return -1;
      if (right.due_at) return 1;
      return left.created_at.localeCompare(right.created_at);
    }),
  };
}
