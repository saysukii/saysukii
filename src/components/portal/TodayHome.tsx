import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/os/inquiry-desk";
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
import type { TaskRow } from "@/integrations/supabase/types";
import {
  DESK_KIND_LABEL,
  dayGreeting,
  deskGlance,
  firstName,
  isDeskTask,
  longDate,
  toDeskTask,
  weekFloor,
  type DeskKind,
  type StudioToday,
  type TodayDeskTask,
  type TodayFloorItem,
  type TodayInquiry,
  type TodayProject,
} from "@/lib/os/studio-today";
import { cn } from "@/lib/utils";

const TASK_KINDS: DeskKind[] = ["inquiry", "production", "manual"];
const HOME_LABELS = {
  calendar: "calendar",
  floor: "week",
  desk: "tasks",
  glance: "detail",
} as const;

export type DeskTaskDraft = {
  title: string;
  linked_type: "inquiry" | "project" | "none";
  linked_id: string | null;
  due_at: string;
};

function shortDay(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
    .format(new Date(`${date}T12:00:00`))
    .toLowerCase();
}

function stamp(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
      <b>{item.title}</b>
      <p>{item.detail}</p>
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

export function TodayHome({
  data,
  name,
  email,
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
  const [tasking, setTasking] = useState(false);
  const [added, setAdded] = useState<TaskRow[]>([]);
  const [retired, setRetired] = useState<string[]>([]);
  const [pickedId, setPickedId] = useState(data.desk[0]?.id ?? "");
  const [day, setDay] = useState(() => {
    const now = new Date();
    return stamp(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const today = useMemo(() => {
    const now = new Date();
    return stamp(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

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
      weekFloor({ ...data, tasks: live, desk }, day, today).filter(
        (item) => !item.taskId || !retired.includes(item.taskId),
      ),
    [data, day, desk, live, retired, today],
  );
  const selected = desk.find((task) => task.id === pickedId) ?? desk[0] ?? null;
  const glance = selected ? deskGlance(selected) : null;
  const needProposal = data.counts.new + data.counts.contacted + data.counts.in_conversation;
  const followUp = data.counts.proposal_sent;
  const pendingCount = needProposal + followUp;
  const pendingLine = [
    needProposal ? `${needProposal} need a proposal` : null,
    followUp ? `${followUp} follow up` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const nextBooked = data.upcoming[0] ?? null;
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
            {dayGreeting()}, {firstName(name, email)}
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
          <strong>{desk.length || "—"}</strong>
          <p>{desk[0]?.title ?? "a quiet floor"}</p>
        </article>
        <article className="studio-metric is-sage">
          <p className="studio-kicker">outreach</p>
          <strong>—</strong>
          <p>a space we’ll open soon</p>
        </article>
        <article className="studio-metric is-sand">
          <p className="studio-kicker">pending</p>
          <strong>{pendingCount || "—"}</strong>
          <p>{pendingLine || "the path is clear"}</p>
        </article>
        <article className="studio-metric is-blush">
          <p className="studio-kicker">booked</p>
          <strong>{data.upcoming.length || "—"}</strong>
          <p className="is-clip">
            {nextBooked
              ? `${shortDay(nextBooked.event_date)} · ${nextBooked.event_name}`
              : "nothing on the books yet"}
          </p>
        </article>
      </div>

      <div className="studio-home-stage">
        <aside className="studio-home-day">
          <p className="studio-home-label">{HOME_LABELS.calendar}</p>
          <MonthBoard marks={data.calendarMarks} selected={day} onSelect={setDay} />
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
                  <b>{inquiry.client?.name}</b>
                  <span>inquiry date</span>
                </p>
              ))}
            </div>
          )}
        </aside>

        <div className="studio-home-floor">
          <div className="studio-timeline">
            <div className="studio-floor-head">
              <p className="studio-home-label">{HOME_LABELS.floor}</p>
            </div>

            {timeline.length === 0 ? (
              <p className="studio-empty">quiet week on the floor.</p>
            ) : (
              <div className="studio-floor-run">
                {floorGroups.map((group) => (
                  <section key={group.date} className={group.date === today ? "is-today" : undefined}>
                    <h4>{group.when}</h4>
                    <ol>
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <FloorBeat item={item} onPick={setPickedId} />
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
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
        marks={data.calendarMarks}
        onOpenChange={setAdding}
        onCreate={onCreateInquiry}
      />

      <AddDeskTask
        open={tasking}
        busy={savingTask}
        today={today}
        marks={data.calendarMarks}
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
          <em>{task.person ?? "studio"}</em>
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
          <h3>{glance.name}</h3>
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

function GlanceGo({ task }: { task: TodayDeskTask }) {
  if (task.inquiry) {
    return (
      <nav className="studio-home-glance-go" aria-label="open this record">
        <Link
          to="/pipeline/$id"
          params={{ id: task.inquiry.slug }}
          className="studio-home-glance-link is-blush"
        >
          open inquiry
        </Link>
        <Link
          to="/proposals/new"
          search={{ inquiry: task.inquiry.id }}
          className="studio-home-glance-link is-ink"
        >
          create proposal
        </Link>
      </nav>
    );
  }

  if (task.project) {
    return (
      <nav className="studio-home-glance-go" aria-label="open this record">
        <Link
          to="/projects/$id"
          params={{ id: task.project.id }}
          className="studio-home-glance-link is-blush"
        >
          see the work
        </Link>
      </nav>
    );
  }

  return null;
}

