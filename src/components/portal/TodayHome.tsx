import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState, useEffect, useLayoutEffect, useRef, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { TextShimmer } from "@/components/core/text-shimmer";
import { PersonName, isPersonType, markPerson, shownName } from "@/components/studio/PersonName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EVENT_LABEL, inquiryTime, initials, nextMove, recordSlug } from "@/lib/os/inquiry-desk";
import {
  BUDGET_RANGES,
  DIRECT_OUTREACH_SOURCE,
  type InquiryFormValues,
} from "@/lib/os/inquiry-form";
import {
  INTEREST_OPTIONS,
  mapInquiryClientType,
  mapInquiryEventType,
  type InquiryInterest,
} from "@/lib/os/inquiry-schema";
import type { InquiryMessageRow, TaskRow } from "@/integrations/supabase/types";
import {
  DESK_KIND_LABEL,
  dayGreeting,
  deskGlance,
  isDeskTask,
  longDate,
  toDeskTask,
  weekBounds,
  weekFloor,
  weekLabel,
  type DeskKind,
  type StudioToday,
  type TodayDeskTask,
  type TodayFloorItem,
  type TodayInquiry,
  type TodayProject,
  type TodayTalk,
} from "@/lib/os/studio-today";
import { saveClient } from "@/lib/os/clients.functions";
import { buildInquirySummaryFacts, resolveInquirySummaryText } from "@/lib/os/inquiry-summary";
import type { InquiryPipelineItem } from "@/lib/os/inquiries.functions";
import { useDevPreview } from "@/lib/use-dev-preview";
import { formatDateNumeric } from "@/lib/money";
import { readBookings, studioClock, studioDay } from "@/lib/studio-bookings";
import { cn } from "@/lib/utils";

const TASK_KINDS: DeskKind[] = ["inquiry", "production", "manual"];
const glanceShimmer = "[--base-color:#ff4d94] [--base-gradient-color:#ff1493]";
const HOME_LABELS = {
  calendar: "calendar",
  floor: "week",
  desk: "tasks",
  glance: "detail",
} as const;
const FLOOR_PREVIEW = 3;

export type DeskTaskDraft = {
  title: string;
  linked_type: "inquiry" | "project" | "none";
  linked_id: string | null;
  due_at: string;
};

function givenName(fullName: string | null | undefined) {
  const name = fullName?.trim().split(/\s+/)[0];
  if (name && !/^(studio|preview)$/i.test(name)) return name;
  return "Sukii";
}

function LineBits({ bits }: { bits: Array<{ text: string; person?: boolean }> }) {
  return bits.map((bit, index) =>
    bit.person ? <PersonName key={index} name={bit.text} /> : <span key={index}>{bit.text}</span>,
  );
}

function wroteWhen(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function shortDay(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
    .format(new Date(`${date}T12:00:00`))
    .toLowerCase();
}

function stamp(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return stamp(date.getFullYear(), date.getMonth(), date.getDate());
}

function MonthBoard({
  marks,
  selected,
  onSelect,
}: {
  marks: string[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const now = new Date();
  const today = stamp(now.getFullYear(), now.getMonth(), now.getDate());
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  useEffect(() => {
    const date = new Date(`${selected}T12:00:00`);
    setView({ year: date.getFullYear(), month: date.getMonth() });
  }, [selected]);
  const first = new Date(view.year, view.month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const marked = new Set(marks);
  const monthLabel = first.toLocaleString("en-US", { month: "long" });
  const cells = Array.from({ length: startPad + daysInMonth }, (_, index) => {
    if (index < startPad) return null;
    const day = index - startPad + 1;
    return stamp(view.year, view.month, day);
  });

  return (
    <div className="studio-cal">
      <div className="studio-cal-head">
        <button
          type="button"
          className="studio-cal-nav"
          aria-label="previous month"
          onClick={() => setView((current) => {
            const next = new Date(current.year, current.month - 1, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
          })}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <h3>{monthLabel}</h3>
        <button
          type="button"
          className="studio-cal-nav"
          aria-label="next month"
          onClick={() => setView((current) => {
            const next = new Date(current.year, current.month + 1, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
          })}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="studio-cal-week" aria-hidden="true">
        {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="studio-cal-grid">
        {cells.map((date, index) =>
          date ? (
            <button
              key={date}
              type="button"
              className={cn(
                date === today && "is-today",
                date < today && "is-past",
                date === selected && "is-on",
                marked.has(date) && "has-mark",
              )}
              aria-current={date === today ? "date" : undefined}
              aria-pressed={date === selected}
              aria-label={
                marked.has(date)
                  ? `${Number(date.slice(-2))} — on the books`
                  : `${Number(date.slice(-2))}`
              }
              onClick={() => onSelect(date)}
            >
              <span className="studio-cal-num">{Number(date.slice(-2))}</span>
              <i className="studio-cal-dot" aria-hidden="true" />
            </button>
          ) : (
            <span key={`pad-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}

function FloorBeat({
  item,
  onPick,
}: {
  item: TodayFloorItem;
  onPick: (id: string) => void;
}) {
  const copy = (
    <div>
      <b>{item.titlePerson ? <PersonName name={item.title} /> : item.title}</b>
      <p>{markPerson(item.detail, item.detailPerson)}</p>
    </div>
  );
  if (item.taskId) {
    return (
      <button type="button" onClick={() => onPick(item.taskId!)}>
        {copy}
      </button>
    );
  }
  return <div>{copy}</div>;
}

function FloorDay({
  date,
  when,
  today,
  items,
  open,
  onToggle,
  onPick,
}: {
  date: string;
  when: string;
  today: string;
  items: TodayFloorItem[];
  open: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  const shown = open ? items : items.slice(0, FLOOR_PREVIEW);
  return (
    <section className={date === today ? "is-today" : undefined} data-floor-day={date}>
      <h4>{when}</h4>
      <ol>
        {shown.map((item) => (
          <li key={item.id}>
            <FloorBeat item={item} onPick={onPick} />
          </li>
        ))}
      </ol>
      {items.length > FLOOR_PREVIEW ? (
        <button type="button" className="studio-floor-more" aria-expanded={open} onClick={onToggle}>
          {open ? "show less" : "view all"}
        </button>
      ) : null}
    </section>
  );
}

export function TodayHome({
  data,
  name,
  creating = false,
  completingId = null,
  savingTask = false,
  onCreateInquiry,
  onCompleteTask,
  onCreateTask,
}: {
  data: StudioToday;
  name?: string | null;
  email?: string | null;
  creating?: boolean;
  completingId?: string | null;
  savingTask?: boolean;
  onCreateInquiry: (values: InquiryFormValues) => Promise<void>;
  onCompleteTask: (id: string) => Promise<void>;
  onCreateTask: (values: DeskTaskDraft) => Promise<TaskRow>;
}) {
  const [adding, setAdding] = useState(false);
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [bookedOpen, setBookedOpen] = useState(false);
  const [tasking, setTasking] = useState(false);
  const [added, setAdded] = useState<TaskRow[]>([]);
  const [retired, setRetired] = useState<string[]>([]);
  const [pickedId, setPickedId] = useState(data.desk[0]?.id ?? "");
  const [day, setDay] = useState(() => {
    const now = new Date();
    return stamp(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [weekOf, setWeekOf] = useState(day);
  const [openDays, setOpenDays] = useState<string[]>([]);
  const [localTalks, setLocalTalks] = useState<TodayTalk[]>([]);
  const today = useMemo(() => {
    const now = new Date();
    return stamp(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  useEffect(() => {
    setLocalTalks(
      readBookings().map((row) => ({
        id: row.id,
        startsAt: row.startsAt,
        name: row.name,
        email: row.email,
        note: row.note,
      })),
    );
  }, []);
  const talks = useMemo(() => {
    const remote = data.appointments ?? [];
    const seen = new Set(remote.map((talk) => `${talk.startsAt}|${talk.email.toLowerCase()}`));
    return [
      ...remote,
      ...localTalks.filter((talk) => !seen.has(`${talk.startsAt}|${talk.email.toLowerCase()}`)),
    ];
  }, [data.appointments, localTalks]);
  const marks = useMemo(
    () => [...new Set([...data.calendarMarks, ...talks.map((talk) => studioDay(talk.startsAt)).filter(Boolean)])],
    [data.calendarMarks, talks],
  );

  const live = useMemo(() => {
    const extras = added.filter((task) => !data.tasks.some((item) => item.id === task.id));
    return [...data.tasks, ...extras];
  }, [added, data.tasks]);
  const desk = useMemo(
    () =>
      live
        .filter((task) => isDeskTask(task, today) && !retired.includes(task.id))
        .sort((left, right) => {
          const byDue = (left.due_at ?? left.created_at).localeCompare(right.due_at ?? right.created_at);
          if (byDue !== 0) return byDue;
          return left.created_at.localeCompare(right.created_at);
        })
        .map((task) => toDeskTask(task, data.waiting, data.projects)),
    [data.projects, data.waiting, live, retired, today],
  );
  const timeline = useMemo(
    () =>
      weekFloor({ ...data, tasks: live, desk, appointments: talks }, weekOf, today).filter(
        (item) => !item.taskId || !retired.includes(item.taskId),
      ),
    [data, desk, live, retired, talks, today, weekOf],
  );
  const selected = desk.find((task) => task.id === pickedId) ?? desk[0] ?? null;
  const glance = selected ? deskGlance(selected) : null;
  const freshLeads = data.waiting
    .filter((inquiry) => inquiry.origin === "form" && inquiry.status === "new" && !inquiry.studio_wrote)
    .sort((left, right) => right.received_at.localeCompare(left.received_at));
  const todayPlan = useMemo(() => {
    const covered = new Set(data.projects.map((project) => `${project.client_id}:${project.event_date}`));
    const organizations = new Set(
      [...data.waiting, ...data.projects]
        .map((row) => row.client)
        .filter((client) => client && client.type !== "individual")
        .map((client) => client.name.trim().toLowerCase()),
    );
    const meetings = talks
      .filter((talk) => studioDay(talk.startsAt) === today)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((talk) => {
        const clock = studioClock(talk.startsAt);
        return {
          id: talk.id,
          bits: [
            { text: talk.name, person: !organizations.has(talk.name.trim().toLowerCase()) },
            ...(clock ? [{ text: ` · ${clock}` }] : []),
          ],
        };
      });
    const events = [
      ...data.projects
        .filter((project) => project.event_date === today)
        .map((project) => ({ id: project.id, bits: [{ text: project.event_name }] })),
      ...data.waiting
        .filter(
          (inquiry) =>
            inquiry.event_date === today &&
            !inquiry.event_date_tbd &&
            !covered.has(`${inquiry.client_id}:${inquiry.event_date}`),
        )
        .map((inquiry) => {
          const person = isPersonType(inquiry.client?.type) && Boolean(inquiry.client?.name?.trim());
          return {
            id: inquiry.id,
            bits: [
              {
                text: person ? inquiry.client!.name.trim() : inquiry.client?.name?.trim() || EVENT_LABEL[inquiry.event_type],
                person,
              },
            ],
          };
        }),
    ];
    const due = live
      .filter((task) => task.status === "open" && task.due_at?.slice(0, 10) === today)
      .map((task) => ({ id: task.id, bits: [{ text: task.title }] }));
    return [...meetings, ...events, ...due];
  }, [data.projects, data.waiting, live, talks, today]);
  const booked = [...data.projects].sort((left, right) => left.event_date.localeCompare(right.event_date));
  const leadBits = freshLeads.map((lead) => ({
    id: lead.id,
    name: lead.client?.name?.trim() || "someone new",
    person: isPersonType(lead.client?.type),
  }));
  const bookedLine = booked
    .map((project) => `${shortDay(project.event_date)} ${project.event_name}`)
    .join(" · ");
  const needProposal = data.counts.new + data.counts.contacted + data.counts.in_conversation;
  const followUp = data.counts.proposal_sent;
  const pendingCount = needProposal + followUp;
  const pendingLine = [
    needProposal ? `${needProposal} need a proposal` : null,
    followUp ? `${followUp} follow up` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const floorGroups = useMemo(() => {
    const groups: Array<{ date: string; when: string; items: TodayFloorItem[] }> = [];
    for (const item of timeline) {
      const last = groups[groups.length - 1];
      if (last?.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, when: item.when, items: [item] });
    }
    return groups;
  }, [timeline]);
  const dayMarks = useMemo(() => {
    const inquiries = data.waiting.filter((item) => item.event_date === day);
    const projects = data.upcoming.filter((item) => item.event_date === day);
    return { inquiries, projects };
  }, [data.upcoming, data.waiting, day]);
  const floorRef = useRef<HTMLDivElement>(null);
  const floorPadRef = useRef<HTMLDivElement>(null);
  const parkedFloor = useRef<{ week: string; signature: string; top: number } | null>(null);
  const viewingNow = useMemo(() => {
    const bounds = weekBounds(weekOf);
    return today >= bounds.start && today <= bounds.end;
  }, [today, weekOf]);
  const floorWhen = weekLabel(weekOf, today);
  useLayoutEffect(() => {
    const floor = floorRef.current;
    const pad = floorPadRef.current;
    if (!floor) return;
    if (floorGroups.length === 0) {
      const weekKey = weekBounds(weekOf).start;
      if (pad) pad.style.height = "0px";
      if (parkedFloor.current?.week !== weekKey) {
        floor.scrollTop = 0;
        parkedFloor.current = { week: weekKey, signature: "", top: 0 };
      }
      return;
    }
    const weekKey = weekBounds(weekOf).start;
    const signature = floorGroups.map((group) => `${group.date}:${group.items.length}`).join("|");
    const parked = parkedFloor.current;
    const userMoved =
      parked?.week === weekKey && Math.abs(floor.scrollTop - parked.top) > 12;
    if (parked?.week === weekKey && parked.signature === signature) return;
    if (userMoved) {
      parkedFloor.current = { week: weekKey, signature, top: floor.scrollTop };
      return;
    }
    if (pad) pad.style.height = "0px";
    if (!viewingNow) {
      floor.scrollTop = 0;
      parkedFloor.current = { week: weekKey, signature, top: 0 };
      return;
    }
    const anchor = floorGroups.find((group) => group.date >= today)?.date;
    const target = anchor
      ? floor.querySelector<HTMLElement>(`[data-floor-day="${anchor}"]`)
      : null;
    if (!target) {
      floor.scrollTop = floor.scrollHeight;
      parkedFloor.current = { week: weekKey, signature, top: floor.scrollTop };
      return;
    }
    const top = Math.max(
      0,
      target.getBoundingClientRect().top - floor.getBoundingClientRect().top + floor.scrollTop,
    );
    const deficit = top > 8 ? Math.max(0, top + floor.clientHeight - floor.scrollHeight + 1) : 0;
    if (pad && deficit > 0) pad.style.height = `${deficit}px`;
    floor.scrollTop = top;
    parkedFloor.current = { week: weekKey, signature, top };
    requestAnimationFrame(() => {
      if (parkedFloor.current?.week !== weekKey || parkedFloor.current.signature !== signature) return;
      if (Math.abs(floor.scrollTop - top) > 2) floor.scrollTop = top;
    });
  }, [floorGroups, today, viewingNow, weekOf]);

  function chooseDay(date: string) {
    setDay(date);
    setWeekOf(date);
  }

  function moveWeek(delta: number) {
    const next = shiftDay(weekOf, delta * 7);
    setWeekOf(next);
    setDay(next);
  }

  async function retire(id: string) {
    setRetired((current) => (current.includes(id) ? current : [...current, id]));
    try {
      await onCompleteTask(id);
    } catch {
      setRetired((current) => current.filter((item) => item !== id));
    }
  }

  return (
    <div className="studio-home">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">{longDate()}</p>
          <h1>
            {dayGreeting()}, <PersonName name={givenName(name)} />
          </h1>
          <p>
            {desk.length === 0
              ? "the desk is clear. good place to be."
              : `${desk.length} ${desk.length === 1 ? "thing" : "things"} still need you — oldest first.`}
          </p>
        </div>
        <div className="studio-home-hello-go">
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add inquiry
          </button>
          <Link to="/pipeline" className="studio-today-go is-pearl">
            open the book
          </Link>
        </div>
      </header>

      <div className="studio-home-metrics">
        <article className="studio-metric is-mist">
          <p className="studio-kicker">today</p>
          <strong>{todayPlan.length || "—"}</strong>
          <p className="is-clip">{todayPlan[0] ? <LineBits bits={todayPlan[0].bits} /> : "a quiet day"}</p>
        </article>
        <button type="button" className="studio-metric is-sage" onClick={() => setLeadsOpen(true)}>
          <p className="studio-kicker">new leads</p>
          <strong>{freshLeads.length || "—"}</strong>
          <p className="is-clip">
            {leadBits.length === 0
              ? "no one new just yet"
              : leadBits.map((lead, index) => (
                  <span key={lead.id}>
                    {index > 0 ? " · " : null}
                    {shownName(lead.name, lead.person)}
                  </span>
                ))}
          </p>
        </button>
        <article className="studio-metric is-sand">
          <p className="studio-kicker">pending</p>
          <strong>{pendingCount || "—"}</strong>
          <p>{pendingLine || "the path is clear"}</p>
        </article>
        <button type="button" className="studio-metric is-blush" onClick={() => setBookedOpen(true)}>
          <p className="studio-kicker">booked</p>
          <strong>{booked.length || "—"}</strong>
          <p className="is-clip">{bookedLine || "nothing on the books yet"}</p>
        </button>
      </div>

      <Dialog open={leadsOpen} onOpenChange={setLeadsOpen}>
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">new leads</DialogTitle>
          <DialogDescription className="sr-only">
            they filled the form, and haven’t heard back yet.
          </DialogDescription>
          <div className="studio-task-form">
            <div className="studio-task-composer-title">
              <p>new leads</p>
            </div>
            <div className="studio-ask-grid studio-ask-stack-form">
              {freshLeads.length === 0 ? (
                <p className="studio-ask-label is-prompt">no one new just yet.</p>
              ) : (
                <div className="studio-lead-glance">
                  {freshLeads.map((lead) => {
                    const next = nextMove(lead.status);
                    return (
                      <GlanceListCard
                        key={lead.id}
                        name={lead.client?.name?.trim() || "someone new"}
                        person={isPersonType(lead.client?.type)}
                        hello={inquiryHello(lead).hello}
                        nextTitle={next.title}
                        nextNote={next.note}
                        action={
                          <Link
                            to="/pipeline/$id"
                            params={{ id: lead.slug }}
                            className="studio-ghost"
                            onClick={() => setLeadsOpen(false)}
                          >
                            <TextShimmer duration={1.2} className={glanceShimmer}>
                              open inquiry
                            </TextShimmer>
                          </Link>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bookedOpen} onOpenChange={setBookedOpen}>
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">booked</DialogTitle>
          <DialogDescription className="sr-only">the projects on the books.</DialogDescription>
          <div className="studio-task-form">
            <div className="studio-task-composer-title">
              <p>booked</p>
            </div>
            <div className="studio-ask-grid studio-ask-stack-form">
              {booked.length === 0 ? (
                <p className="studio-ask-label is-prompt">nothing on the books yet.</p>
              ) : (
                <div className="studio-lead-glance">
                  {booked.map((project) => {
                    const place = project.venue_text?.split(",")[0]?.trim() ?? "";
                    const hello = [formatDateNumeric(project.event_date), place].filter((part) => part && part !== "—").join(" · ");
                    const nextTask = live
                      .filter(
                        (task) =>
                          task.status === "open" && task.linked_type === "project" && task.linked_id === project.id,
                      )
                      .sort((left, right) => (left.due_at ?? "").localeCompare(right.due_at ?? ""))[0];
                    const nextTitle = nextTask?.title ?? "the date is held";
                    const nextNote = nextTask?.due_at
                      ? `due ${shortDay(nextTask.due_at.slice(0, 10))}`
                      : project.notes?.trim() || "the date is on the books.";
                    return (
                      <GlanceListCard
                        key={project.id}
                        name={project.event_name}
                        hello={hello}
                        nextTitle={nextTitle}
                        nextNote={nextNote}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="studio-home-stage">
        <aside className="studio-home-day">
          <p className="studio-home-label">{HOME_LABELS.calendar}</p>
          <MonthBoard marks={marks} selected={day} onSelect={chooseDay} />
          {(dayMarks.inquiries.length > 0 || dayMarks.projects.length > 0) && (
            <div className="studio-home-daymarks">
              {dayMarks.projects.map((project) => (
                <p key={project.id}>
                  <b>{project.event_name}</b>
                  <span>{project.venue_text ?? "venue tbd"}</span>
                </p>
              ))}
              {dayMarks.inquiries.map((inquiry) => (
                <p key={inquiry.id}>
                  <b>{shownName(inquiry.client?.name ?? "", isPersonType(inquiry.client?.type))}</b>
                  <span>inquiry date</span>
                </p>
              ))}
            </div>
          )}
        </aside>

        <div className="studio-home-floor">
          <div className="studio-floor-head">
            <p className="studio-home-label">{HOME_LABELS.floor}</p>
            <div className="studio-floor-nav">
              <button
                type="button"
                className="studio-cal-nav"
                aria-label="previous week"
                onClick={() => moveWeek(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className="studio-floor-when">{floorWhen}</span>
              {viewingNow ? null : (
                <button type="button" className="studio-floor-now" onClick={() => chooseDay(today)}>
                  this week
                </button>
              )}
              <button
                type="button"
                className="studio-cal-nav"
                aria-label="next week"
                onClick={() => moveWeek(1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="studio-floor-scroll" ref={floorRef}>
            <div className="studio-timeline">
              {timeline.length === 0 ? (
                <p className="studio-empty">quiet week on the floor.</p>
              ) : (
                <div className="studio-floor-run">
                  {floorGroups.map((group) => (
                    <FloorDay
                      key={group.date}
                      date={group.date}
                      when={group.when}
                      today={today}
                      items={group.items}
                      open={openDays.includes(group.date)}
                      onToggle={() =>
                        setOpenDays((current) =>
                          current.includes(group.date)
                            ? current.filter((item) => item !== group.date)
                            : [...current, group.date],
                        )
                      }
                      onPick={setPickedId}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="studio-floor-pad" ref={floorPadRef} aria-hidden="true" />
          </div>
        </div>
      </div>

      <section className="studio-home-tasks">
        <div className="studio-home-list">
          <div className="studio-panel-head">
            <p className="studio-home-label">{HOME_LABELS.desk}</p>
            <div className="studio-home-desk-go">
              <button
                type="button"
                className="studio-home-add"
                aria-label="add a task"
                aria-haspopup="dialog"
                aria-expanded={tasking}
                onClick={() => setTasking(true)}
              >
                <Plus aria-hidden="true" />
              </button>
              <span className="studio-home-count" aria-label={`${desk.length} still need you`}>
                {desk.length}
              </span>
            </div>
          </div>
          <div className="studio-home-feed">
            {desk.length === 0 ? <p className="studio-empty">nothing due today. the desk is clear.</p> : null}
            {desk.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                active={selected?.id === task.id}
                busy={completingId === task.id}
                onPick={() => setPickedId(task.id)}
                onComplete={() => retire(task.id)}
              />
            ))}
          </div>
        </div>

        <aside className="studio-home-glance">
          {selected && glance ? (
            <TaskGlance task={selected} glance={glance} />
          ) : (
            <p className="studio-empty">the desk is clear. good place to be.</p>
          )}
        </aside>
      </section>

      <AddInquiry
        open={adding}
        busy={creating}
        marks={marks}
        onOpenChange={setAdding}
        onCreate={onCreateInquiry}
      />

      <AddDeskTask
        open={tasking}
        busy={savingTask}
        today={today}
        marks={marks}
        inquiries={data.waiting}
        projects={data.projects}
        onOpenChange={setTasking}
        onCreate={async (values) => {
          const task = await onCreateTask(values);
          setAdded((current) => (current.some((item) => item.id === task.id) ? current : [task, ...current]));
          setPickedId(task.id);
        }}
      />
    </div>
  );
}

function dueStamp(date: string) {
  return new Date(`${date}T12:00:00`).toISOString();
}

function KindPicks({
  kind,
  onPick,
}: {
  kind: DeskKind;
  onPick: (value: DeskKind) => void;
}) {
  return (
    <div className="studio-task-kinds">
      {TASK_KINDS.map((value) => (
        <button
          key={value}
          type="button"
          className={cn(kind === value && "is-on", `is-${value}`)}
          aria-pressed={kind === value}
          onClick={() => onPick(value)}
        >
          {DESK_KIND_LABEL[value]}
        </button>
      ))}
    </div>
  );
}

function DueCalendar({
  marks,
  selected,
  onSelect,
}: {
  marks: string[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="studio-task-cal">
      <MonthBoard marks={marks} selected={selected} onSelect={onSelect} />
    </div>
  );
}

export function AddInquiry({
  open,
  busy,
  marks,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  marks: string[];
  onOpenChange: (open: boolean) => void;
  onCreate: (values: InquiryFormValues) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [interest, setInterest] = useState<InquiryInterest>("weddings");
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [dateTbd, setDateTbd] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [venue, setVenue] = useState("");
  const [guests, setGuests] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState("");

  const draft: InquiryFormValues = {
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    organization: organization.trim(),
    client_type: "individual",
    event_date: dateTbd ? null : eventDate,
    event_date_tbd: dateTbd,
    event_type: "wedding",
    venue_text: venue.trim(),
    guest_count: guests ? Number(guests) : null,
    budget_range: budgetRange,
    source: DIRECT_OUTREACH_SOURCE,
    message: message.trim(),
    interest,
  };

  const ready =
    draft.name.length > 0 &&
    draft.email.length > 0 &&
    draft.phone.length > 0 &&
    Boolean(budgetRange) &&
    draft.message.length > 0 &&
    (Boolean(eventDate) || dateTbd);

  const dateLabel = eventDate ? shortDay(eventDate) : "date";

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setOrganization("");
    setInterest("weddings");
    setEventDate(null);
    setDateTbd(false);
    setCalOpen(false);
    setVenue("");
    setGuests("");
    setBudgetRange("");
    setMessage("");
    setHint("");
  }

  function pickDate(date: string) {
    setEventDate(date);
    setDateTbd(false);
    setCalOpen(false);
    setHint("");
  }

  function pickTbd(next: boolean) {
    setDateTbd(next);
    if (next) {
      setEventDate(null);
      setCalOpen(false);
    }
    setHint("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!eventDate && !dateTbd) {
      setHint("choose a date, or mark it tbd.");
      return;
    }
    if (!budgetRange) {
      setHint("choose a budget.");
      return;
    }
    if (!ready || busy) return;
    await onCreate({
      ...draft,
      client_type: mapInquiryClientType(draft),
      event_type: mapInquiryEventType(draft),
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask" hideClose>
        <div className="studio-task-head">
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogTitle className="sr-only">add an inquiry</DialogTitle>
        <DialogDescription className="sr-only">from a dm, text, or email.</DialogDescription>
        <form className="studio-task-form" onSubmit={submit}>
          <label className="studio-task-composer-title">
            <span className="sr-only">who is this</span>
            <input
              autoFocus
              value={name}
              maxLength={160}
              autoComplete="name"
              placeholder="who is this…"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <AskChips options={INTEREST_OPTIONS} value={interest} onPick={setInterest} />
          <div className="studio-ask-grid is-two studio-ask-stack-form">
            <AskField label="email">
              <input
                type="email"
                value={email}
                maxLength={320}
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </AskField>
            <AskField label="phone">
              <input
                type="tel"
                value={phone}
                maxLength={40}
                autoComplete="tel"
                required
                onChange={(event) => setPhone(event.target.value)}
              />
            </AskField>
            <div className="studio-ask-field">
              <span className="studio-ask-label">date</span>
              <div className={cn("studio-ask-date", dateTbd && "is-tbd")}>
                <button
                  type="button"
                  className={cn("studio-ask-date-go", (calOpen || Boolean(eventDate)) && "is-on")}
                  aria-expanded={calOpen}
                  disabled={dateTbd}
                  onClick={() => setCalOpen((open) => !open)}
                >
                  {dateLabel}
                </button>
                <label className="studio-ask-check">
                  <input
                    type="checkbox"
                    checked={dateTbd}
                    onChange={(event) => pickTbd(event.target.checked)}
                  />
                  tbd
                </label>
              </div>
            </div>
            <AskField label="venue">
              <input value={venue} maxLength={240} onChange={(event) => setVenue(event.target.value)} />
            </AskField>
            {calOpen && !dateTbd ? (
              <div className="studio-ask-span">
                <DueCalendar marks={marks} selected={eventDate ?? ""} onSelect={pickDate} />
              </div>
            ) : null}
            <AskField label="organization">
              <input
                value={organization}
                maxLength={160}
                autoComplete="organization"
                onChange={(event) => setOrganization(event.target.value)}
              />
            </AskField>
            <AskField label="budget">
              <AskBudget value={budgetRange} onChange={setBudgetRange} />
            </AskField>
            <AskField label="guests">
              <input
                type="number"
                min={0}
                max={100000}
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
              />
            </AskField>
            <AskField label="vision" className="studio-ask-span">
              <textarea
                value={message}
                maxLength={6000}
                placeholder="the vision…"
                required
                onChange={(event) => setMessage(event.target.value)}
              />
            </AskField>
          </div>
          {hint ? <p className="studio-ask-hint">{hint}</p> : null}
          <div className="studio-ask-foot">
            <button type="submit" className="studio-today-go" disabled={!ready || busy}>
              {busy ? "saving…" : "create"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AskField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("studio-ask-field", className)}>
      <span className="studio-ask-label">{label}</span>
      {children}
    </label>
  );
}

function AskBudget({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = BUDGET_RANGES.find((option) => option.value === value);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("studio-ask-drop-go", !selected && "is-empty", open && "is-open")}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{selected ? selected.label.toLowerCase() : "select a range"}</span>
          <span className="studio-ask-drop-caret" aria-hidden="true">
            <ChevronDown strokeWidth={1.75} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        className="studio-ask-drop-list w-[var(--radix-popover-trigger-width)] border-0 p-0 shadow-none data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div role="listbox" aria-label="budget">
          {BUDGET_RANGES.map((option) => {
            const on = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={on}
                className={cn(on && "is-on")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label.toLowerCase()}</span>
                <Check className="studio-ask-drop-mark" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AskChips<T extends string>({
  options,
  value,
  onPick,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="studio-task-kinds studio-ask-offerings" role="listbox" aria-label="offering">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={value === option.value}
          className={cn(value === option.value && "is-on")}
          onClick={() => onPick(option.value)}
        >
          {option.label.toLowerCase()}
        </button>
      ))}
    </div>
  );
}

function AddDeskTask({
  open,
  busy,
  today,
  marks,
  inquiries,
  projects,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  today: string;
  marks: string[];
  inquiries: TodayInquiry[];
  projects: TodayProject[];
  onOpenChange: (open: boolean) => void;
  onCreate: (values: DeskTaskDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DeskKind>("manual");
  const [linkedId, setLinkedId] = useState("");
  const [dueOn, setDueOn] = useState(today);
  const [duePicked, setDuePicked] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  const people =
    kind === "inquiry"
      ? inquiries.map((inquiry) => ({
          id: inquiry.id,
          label: inquiry.client?.name ?? "inquiry",
        }))
      : kind === "production"
        ? projects.map((project) => ({
            id: project.id,
            label: project.event_name,
          }))
        : [];
  const needsLink = kind !== "manual";
  const ready = title.trim().length > 0 && (!needsLink || Boolean(linkedId));

  function reset() {
    setTitle("");
    setKind("manual");
    setLinkedId("");
    setDueOn(today);
    setDuePicked(false);
    setCalOpen(false);
  }

  function pickKind(value: DeskKind) {
    setKind(value);
    setLinkedId("");
  }

  function pickDue(date: string) {
    setDueOn(date);
    setDuePicked(true);
    setCalOpen(false);
  }

  const dueLabel = duePicked ? shortDay(dueOn) : "date";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    await onCreate({
      title: title.trim(),
      linked_type: kind === "inquiry" ? "inquiry" : kind === "production" ? "project" : "none",
      linked_id: needsLink ? linkedId : null,
      due_at: dueStamp(dueOn || today),
    });
    reset();
    onOpenChange(false);
  }

  const linkField =
    needsLink ? (
      people.length === 0 ? (
        <p className="studio-empty">nothing to attach yet.</p>
      ) : (
        <select value={linkedId} onChange={(event) => setLinkedId(event.target.value)}>
          <option value="">{kind === "inquiry" ? "choose an inquiry" : "choose a project"}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
      )
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal" hideClose>
        <div className="studio-task-head">
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogTitle className="sr-only">add a task</DialogTitle>
        <DialogDescription className="sr-only">
          a note for today, or a move on an inquiry or booked job.
        </DialogDescription>
        <form className="studio-task-form" onSubmit={submit}>
          <label className="studio-task-composer-title">
            <span className="studio-task-check" aria-hidden="true" />
            <span className="sr-only">what needs doing</span>
            <input
              autoFocus
              value={title}
              maxLength={240}
              placeholder="what needs doing…"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="studio-task-toolbar">
            <KindPicks kind={kind} onPick={pickKind} />
            <button
              type="button"
              className={cn("studio-task-chip", calOpen && "is-on")}
              aria-expanded={calOpen}
              onClick={() => setCalOpen((open) => !open)}
            >
              {dueLabel}
            </button>
            <button type="submit" className="studio-today-go" disabled={!ready || busy}>
              {busy ? "saving…" : "create"}
            </button>
          </div>
          {needsLink ? <div className="studio-task-composer-link">{linkField}</div> : null}
          {calOpen ? <DueCalendar marks={marks} selected={dueOn} onSelect={pickDue} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  active,
  busy,
  onPick,
  onComplete,
}: {
  task: TodayDeskTask;
  active: boolean;
  busy: boolean;
  onPick: () => void;
  onComplete: () => void;
}) {
  return (
    <div className={cn("studio-home-row", active && "is-on")}>
      <button
        type="button"
        className="studio-home-check"
        role="checkbox"
        aria-checked="false"
        aria-label={`complete ${task.title}`}
        disabled={busy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onComplete();
        }}
      />
      <button type="button" className="studio-home-row-pick" onClick={onPick}>
        <span className="studio-home-row-copy">
          <b>{task.title}</b>
          <em>
            {task.person
              ? shownName(
                  task.person,
                  isPersonType(task.inquiry?.client?.type) || isPersonType(task.project?.client?.type),
                )
              : "studio"}
          </em>
          <small>
            <span className={cn("studio-home-kind", `is-${task.kind}`)}>{DESK_KIND_LABEL[task.kind]}</span>
            {dueHint(task)}
          </small>
        </span>
      </button>
    </div>
  );
}

function dueHint(task: TodayDeskTask) {
  const due = task.due_at?.slice(0, 10);
  if (!due) return " · today";
  const now = new Date();
  const today = stamp(now.getFullYear(), now.getMonth(), now.getDate());
  if (due < today) return " · overdue";
  return " · today";
}

function dash(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : "–";
}

function TaskGlance({
  task,
  glance,
}: {
  task: TodayDeskTask;
  glance: ReturnType<typeof deskGlance>;
}) {
  if (task.inquiry) return <InquiryRecordGlance inquiry={task.inquiry} task={task} />;

  return (
    <>
      <div className="studio-home-glance-top">
        <p className="studio-home-label">{HOME_LABELS.glance}</p>
        <GlanceGo task={task} />
      </div>
      <div className={cn("studio-home-glance-who", `is-${task.kind}`)}>
        <span className="studio-desk-avatar is-lg" aria-hidden="true">
          {initials(glance.name)}
        </span>
        <div>
          <h3>
            {shownName(
              glance.name,
              isPersonType(task.inquiry?.client?.type) ||
                (isPersonType(task.project?.client?.type) && glance.name === task.project?.client?.name),
            )}
          </h3>
          <p>{glance.kicker}</p>
        </div>
      </div>
      <dl className="studio-facts">
        <div>
          <dt>date</dt>
          <dd className={glance.date ? undefined : "is-empty"}>{dash(glance.date)}</dd>
        </div>
        <div>
          <dt>place</dt>
          <dd className={glance.place ? undefined : "is-empty"}>{dash(glance.place)}</dd>
        </div>
        <div>
          <dt>figure</dt>
          <dd className={glance.figure ? undefined : "is-empty"}>{dash(glance.figure)}</dd>
        </div>
        <div>
          <dt>reach</dt>
          <dd className="studio-facts-stack">
            <span className={glance.phone ? undefined : "is-empty"}>{dash(glance.phone)}</span>
            <span className={glance.email ? undefined : "is-empty"}>{dash(glance.email)}</span>
          </dd>
        </div>
      </dl>
      <div className="studio-home-vision">
        <p className="studio-kicker">vision</p>
        <p className={glance.vision ? undefined : "is-empty"}>{dash(glance.vision)}</p>
      </div>
    </>
  );
}

function inquiryHello(inquiry: InquiryPipelineItem) {
  const time = inquiryTime(inquiry.message);
  const when = inquiry.event_date_tbd
    ? "date tbd"
    : [formatDateNumeric(inquiry.event_date), time].filter((part) => part && part !== "—").join(" · ");
  const place = inquiry.venue_text?.split(",")[0]?.trim() ?? "";
  return {
    hello: [when, place].filter(Boolean).join(" · "),
    eventWhen: inquiry.event_date_tbd ? "tbd" : when || "—",
  };
}

function glanceSummary(inquiry: InquiryPipelineItem) {
  const saved = inquiry.summary_text?.trim();
  if (saved) return saved;
  const inbound: InquiryMessageRow | null = inquiry.message
    ? {
        id: inquiry.id,
        inquiry_id: inquiry.id,
        direction: "inbound",
        channel: "form",
        subject: null,
        body: inquiry.message,
        from_address: inquiry.client?.email ?? null,
        to_address: null,
        gmail_message_id: null,
        gmail_thread_id: null,
        author: inquiry.client?.name ?? null,
        sent_at: inquiry.received_at,
        status: "received",
        created_by: null,
        created_at: inquiry.received_at,
      }
    : null;
  return resolveInquirySummaryText(
    buildInquirySummaryFacts({
      status: inquiry.status,
      contacted_at: inquiry.contacted_at,
      messages: inbound ? [inbound] : [],
      proposals: inquiry.proposal_sent_at ? [{ status: "sent", created_at: inquiry.proposal_sent_at }] : [],
    }),
  );
}

function GlanceListCard({
  name,
  person = false,
  hello,
  nextTitle,
  nextNote,
  action,
}: {
  name: string;
  person?: boolean;
  hello: string;
  nextTitle: string;
  nextNote: string;
  action?: ReactNode;
}) {
  return (
    <article className="studio-home-glance">
      <header className="studio-glance-head">
        <div>
          <b>{shownName(name, person)}</b>
          {hello ? (
            <p>
              <TextShimmer duration={1.2} className={glanceShimmer}>
                {hello}
              </TextShimmer>
            </p>
          ) : null}
        </div>
        {action}
      </header>
      <article className="studio-glance-card is-next">
        <p className="studio-glance-label">
          <span className="studio-next-mark" aria-hidden="true" />
          up next
        </p>
        <b>{nextTitle}</b>
        <p>{nextNote}</p>
      </article>
    </article>
  );
}

function InquiryRecordGlance({ inquiry, task }: { inquiry: InquiryPipelineItem; task: TodayDeskTask }) {
  const client = inquiry.client;
  const name = client?.name ?? "client";
  const { hello, eventWhen } = inquiryHello(inquiry);
  const next = nextMove(inquiry.status);
  const summary = glanceSummary(inquiry);

  const place = inquiry.venue_text?.trim() || "—";
  const figure = inquiry.budget_range?.trim() || "—";

  return (
    <>
      <GlanceHead name={name} hello={hello} task={task} person={isPersonType(client?.type)} />
      {summary ? <SummaryCard summary={summary} /> : null}
      <article className="studio-glance-card is-next">
        <p className="studio-glance-label">
          <span className="studio-next-mark" aria-hidden="true" />
          up next
        </p>
        <b>{next.title}</b>
        <p>{next.note}</p>
      </article>
      <div className="studio-glance-split">
        <article className="studio-glance-card">
          <p className="studio-glance-label">the moment</p>
          <dl>
            <div>
              <dt>date</dt>
              <dd>{eventWhen}</dd>
            </div>
            <div>
              <dt>place</dt>
              <dd>{place}</dd>
            </div>
            <div>
              <dt>investment</dt>
              <dd>{figure}</dd>
            </div>
          </dl>
          <ClientForm inquiry={inquiry} eventWhen={eventWhen} />
        </article>
        <article className="studio-glance-card">
          <p className="studio-glance-label">client details</p>
          <dl>
            <div>
              <dt>name</dt>
              <dd>{shownName(name, isPersonType(client?.type))}</dd>
            </div>
            <div>
              <dt>email</dt>
              <dd>{dash(client?.email)}</dd>
            </div>
            {client?.phone ? (
              <div>
                <dt>phone</dt>
                <dd>{client.phone}</dd>
              </div>
            ) : null}
          </dl>
          <ClientFile clientName={client?.name} />
        </article>
      </div>
    </>
  );
}

function GlanceHead({
  name,
  hello,
  task,
  person = false,
}: {
  name: string;
  hello: string;
  task: TodayDeskTask;
  person?: boolean;
}) {
  return (
    <header className="studio-glance-head">
      <div>
        <b>{shownName(name, person)}</b>
        {hello ? (
          <p>
            <TextShimmer duration={1.2} className={glanceShimmer}>
              {hello}
            </TextShimmer>
          </p>
        ) : null}
      </div>
      <GlanceGo task={task} />
    </header>
  );
}

function SummaryLabel() {
  return (
    <p className="studio-glance-label" title="written by studio intelligence">
      <span className="studio-summary-mark" aria-hidden="true" />
      summary
      <span className="sr-only">written by studio intelligence</span>
    </p>
  );
}

function SummaryCard({ summary }: { summary: string }) {
  return (
    <article className="studio-glance-card">
      <SummaryLabel />
      <p>{summary}</p>
    </article>
  );
}

function ClientFile({ clientName }: { clientName?: string | null }) {
  if (!clientName) return null;
  return (
    <Link to="/clients/$id" params={{ id: recordSlug(clientName) }} className="studio-ghost">
      <TextShimmer duration={1.2} className={glanceShimmer}>
        client file
      </TextShimmer>
    </Link>
  );
}

function answeredVision(message: string | null) {
  return (message ?? "")
    .split("\n")
    .filter((line) => !/^(Size|Time|Recipient):/i.test(line.trim()))
    .join("\n")
    .trim();
}

function ClientForm({ inquiry, eventWhen }: { inquiry: InquiryPipelineItem; eventWhen: string }) {
  const client = inquiry.client;
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const submitClient = useServerFn(saveClient);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const keepClient = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("this client could not be opened.");
      const name = form.name.trim();
      const email = form.email.trim();
      if (!name || !email) throw new Error("name and email hold the record.");
      if (devPreview) {
        toast.message("preview mode — client not saved");
        return client;
      }
      return submitClient({
        data: {
          id: client.id,
          name,
          email,
          phone: form.phone,
          organization: client.organization,
          type: client.type,
          source: client.source,
          notes: client.notes,
        },
      });
    },
    onSuccess: () => {
      if (!devPreview) toast.success("client updated");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!client) return null;
  const vision = answeredVision(inquiry.message);

  return (
    <>
      <button
        type="button"
        className="studio-ghost"
        aria-expanded={open}
        onClick={() => {
          setForm({ name: client.name, email: client.email ?? "", phone: client.phone ?? "" });
          setOpen(true);
        }}
      >
        <TextShimmer duration={1.2} className={glanceShimmer}>
          client form
        </TextShimmer>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">client form</DialogTitle>
          <DialogDescription className="sr-only">their details, and what they answered.</DialogDescription>
          <form
            className="studio-task-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              keepClient.mutate();
            }}
          >
            <label className="studio-task-composer-title">
              <span className="sr-only">name</span>
              <input
                autoFocus
                value={form.name}
                maxLength={160}
                autoComplete="name"
                placeholder="who is this…"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <div className="studio-ask-grid is-two">
              <label className="studio-ask-field">
                <span className="studio-ask-label">email</span>
                <input
                  type="email"
                  value={form.email}
                  maxLength={320}
                  autoComplete="email"
                  required
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>
              <label className="studio-ask-field">
                <span className="studio-ask-label">phone</span>
                <input
                  type="tel"
                  value={form.phone}
                  maxLength={40}
                  autoComplete="tel"
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </label>
              <span className="studio-ask-label studio-ask-span">they answered</span>
              <ReadAnswer label="interest" value={EVENT_LABEL[inquiry.event_type]} />
              <ReadAnswer label="date" value={eventWhen || "tbd"} />
              {inquiry.venue_text ? <ReadAnswer label="venue" value={inquiry.venue_text} wide /> : null}
              {inquiry.budget_range ? <ReadAnswer label="budget" value={inquiry.budget_range} /> : null}
              {inquiry.guest_count ? <ReadAnswer label="guests" value={String(inquiry.guest_count)} /> : null}
              {inquiry.source ? <ReadAnswer label="source" value={inquiry.source} /> : null}
              {vision ? <ReadAnswer label="vision" value={vision} wide lines /> : null}
            </div>
            <div className="studio-ask-foot">
              <button
                type="submit"
                className="studio-today-go"
                disabled={keepClient.isPending || !form.name.trim() || !form.email.trim()}
              >
                {keepClient.isPending ? "saving…" : "keep"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadAnswer({
  label,
  value,
  wide = false,
  lines = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  lines?: boolean;
}) {
  return (
    <label className={cn("studio-ask-field", wide && "studio-ask-span")}>
      <span className="studio-ask-label">{label}</span>
      {lines ? <textarea readOnly value={value} /> : <input readOnly value={value} />}
    </label>
  );
}

function GlanceGo({ task }: { task: TodayDeskTask }) {
  if (task.inquiry) {
    return (
      <nav className="studio-home-glance-go" aria-label="open this record">
        <Link
          to="/pipeline/$id"
          params={{ id: task.inquiry.slug }}
          className="studio-ghost"
        >
          <TextShimmer duration={1.2} className={glanceShimmer}>
            open inquiry
          </TextShimmer>
        </Link>
      </nav>
    );
  }

  return null;
}

