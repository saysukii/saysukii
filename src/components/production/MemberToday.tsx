import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { HowWeFlowCard } from "@/components/portal/HowWeFlow";
import { TodayTour, TOUR_OPEN_EVENT } from "@/components/portal/TodayTour";
import { BloomWait, releaseLoginBloom } from "@/components/portal/StudioLoader";
import { MonthBoard } from "@/components/portal/TodayHome";
import { ProductionListRow } from "@/components/production/ProductionListRow";
import { PersonName } from "@/components/studio/PersonName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductionShiftRow, ProductionTaskRow } from "@/integrations/supabase/types";
import {
  hoursLabel,
  productionDayLabel,
  shiftHours,
  shiftSpan,
  studioToday,
  taskInputValue,
  taskWhen,
} from "@/lib/os/production";
import {
  dayGreeting,
  formatFloorWhen,
  longDate,
  weekBounds,
  weekLabel,
} from "@/lib/os/studio-today";
import { useProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

const slugOf = (path: string) => path.split("/").pop() ?? "";

/** the studio day a task falls on, or nothing for an anytime task */
const taskDay = (task: Pick<ProductionTaskRow, "starts_at">) =>
  task.starts_at ? taskInputValue(task.starts_at).slice(0, 10) : null;

/** "10a–6p", short enough for a calendar line */
function tinySpan(starts: string, ends: string) {
  return shiftSpan(starts, ends)
    .replace(/:00/g, "")
    .replace(/am/g, "a")
    .replace(/pm/g, "p")
    .replace(/ – /, "–");
}

function shiftDays(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * A member's today: four numbers for their day and week, the productions they're on (the way the
 * productions page lists them), and their calendar and week, with their shifts and tasks under
 * each event. Everything they need opens from here.
 */
export function MemberToday({ name }: { name: string | null }) {
  const api = useProductionApi();
  const queryClient = useQueryClient();
  const key = ["os", "my-productions"];
  const mine = useQuery({ queryKey: key, queryFn: () => api.mine() });
  const [busy, setBusy] = useState<string | null>(null);
  const [todoOpen, setTodoOpen] = useState(false);
  const today = studioToday();
  const [day, setDay] = useState(today);
  const [weekOf, setWeekOf] = useState(today);
  const given = name?.trim().split(/\s+/)[0] ?? "";

  useEffect(() => {
    if (mine.data || mine.isError) releaseLoginBloom();
  }, [mine.data, mine.isError]);

  const productions = useMemo(() => mine.data?.productions ?? [], [mine.data]);
  type Production = (typeof productions)[number];
  type Shift = { shift: ProductionShiftRow; production: Production };
  type Task = { task: ProductionTaskRow; production: Production };

  const shifts: Shift[] = useMemo(
    () =>
      productions
        .flatMap((production) => (production.shifts ?? []).map((shift) => ({ shift, production })))
        .sort((a, b) =>
          `${a.shift.day}${a.shift.starts}`.localeCompare(`${b.shift.day}${b.shift.starts}`),
        ),
    [productions],
  );
  const tasks: Task[] = useMemo(
    () =>
      productions
        .flatMap((production) => production.tasks.map((task) => ({ task, production })))
        .sort((a, b) => (a.task.starts_at ?? "9").localeCompare(b.task.starts_at ?? "9")),
    [productions],
  );
  const open = tasks.filter(({ task }) => task.status === "open");

  // the four numbers
  const todayShifts = shifts.filter(({ shift }) => shift.day === today);
  const todayTasks = open.filter(({ task }) => taskDay(task) === today);
  const thisWeek = weekBounds(today);
  const weekShifts = shifts.filter(
    ({ shift }) => shift.day >= thisWeek.start && shift.day <= thisWeek.end,
  );
  const weekHours = weekShifts.reduce(
    (sum, { shift }) => sum + shiftHours(shift.starts, shift.ends),
    0,
  );
  const nextShift = shifts.find(({ shift }) => shift.day >= today);

  // the calendar marks every day they work or have something due
  const marks = useMemo(
    () => [
      ...new Set([
        ...shifts.map(({ shift }) => shift.day),
        ...tasks.flatMap(({ task }) => {
          const on = taskDay(task);
          return on ? [on] : [];
        }),
      ]),
    ],
    [shifts, tasks],
  );

  // the week: each day with something on it, and under it each event with their shift and tasks
  const week = useMemo(() => {
    const { start, end } = weekBounds(weekOf);
    const days: Array<{
      date: string;
      events: Array<{
        production: Production;
        shifts: ProductionShiftRow[];
        tasks: ProductionTaskRow[];
      }>;
    }> = [];
    for (let date = start; date <= end; date = shiftDays(date, 1)) {
      const events = productions.flatMap((production) => {
        const theirShifts = (production.shifts ?? [])
          .filter((shift) => shift.day === date)
          .sort((a, b) => a.starts.localeCompare(b.starts));
        const theirTasks = production.tasks.filter((task) => taskDay(task) === date);
        return theirShifts.length || theirTasks.length
          ? [{ production, shifts: theirShifts, tasks: theirTasks }]
          : [];
      });
      if (events.length) days.push({ date, events });
    }
    return days;
  }, [productions, weekOf]);
  const viewingNow = today >= weekBounds(weekOf).start && today <= weekBounds(weekOf).end;
  const dayShifts = shifts.filter(({ shift }) => shift.day === day);
  const dayTasks = tasks.filter(({ task }) => taskDay(task) === day);

  function chooseDay(date: string) {
    setDay(date);
    setWeekOf(date);
  }

  function moveWeek(delta: number) {
    const next = shiftDays(weekOf, delta * 7);
    setWeekOf(next);
    setDay(next);
  }

  async function toggle(id: string, done: boolean) {
    setBusy(id);
    try {
      await api.setTaskDone(id, done);
      if (done) toast.success("done");
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "that didn't save. try again.");
    } finally {
      setBusy(null);
    }
  }

  if (mine.isPending) return <BloomWait label="opening today" />;

  const check = (task: ProductionTaskRow) => (
    <button
      type="button"
      className="studio-prod-check"
      role="checkbox"
      aria-checked={task.status === "done"}
      aria-label={`${task.status === "done" ? "reopen" : "check off"} ${task.title}`}
      disabled={busy === task.id}
      onClick={() => void toggle(task.id, task.status !== "done")}
    >
      {task.status === "done" ? <Check aria-hidden="true" strokeWidth={2} /> : null}
    </button>
  );

  return (
    <div className="studio-home studio-member-today">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">{longDate()}</p>
          <h1>
            {dayGreeting()}
            {given ? (
              <>
                , <PersonName name={given} />
              </>
            ) : null}
          </h1>
          <p>
            {productions.length === 0
              ? "nothing on your plate yet. when the studio shares a production with you, it shows here."
              : todayShifts.length
                ? `you're on today, ${todayShifts.map(({ shift }) => tinySpan(shift.starts, shift.ends)).join(" and ")}${todayTasks.length ? `, with ${todayTasks.length} ${todayTasks.length === 1 ? "task" : "tasks"}` : ""}.`
                : todayTasks.length
                  ? `${todayTasks.length} ${todayTasks.length === 1 ? "task" : "tasks"} for today.`
                  : nextShift
                    ? `nothing today. you're next on ${productionDayLabel(nextShift.shift.day)}.`
                    : "nothing today."}
          </p>
        </div>
      </header>

      {mine.isError ? (
        <p className="studio-pearl-note">today didn't open. try again in a moment.</p>
      ) : null}

      <div className="studio-home-metrics" data-tour="glance">
        <div className="studio-metric is-mist">
          <p className="studio-kicker">today</p>
          <strong>{todayShifts.length + todayTasks.length || "—"}</strong>
          <p className="is-clip">
            {todayShifts[0]
              ? `your shift ${tinySpan(todayShifts[0].shift.starts, todayShifts[0].shift.ends)} · ${todayShifts[0].production.project_name}`
              : todayTasks[0]
                ? todayTasks[0].task.title
                : "nothing due today"}
          </p>
        </div>
        <div className="studio-metric is-sage">
          <p className="studio-kicker">productions</p>
          <strong>{productions.length || "—"}</strong>
          <p className="is-clip">
            {productions.map((production) => production.project_name).join(" · ") ||
              "none shared with you yet"}
          </p>
        </div>
        <div className="studio-metric is-sand">
          <p className="studio-kicker">this week</p>
          <strong>{weekHours ? hoursLabel(weekHours).replace(/ hrs?$/, "") : "—"}</strong>
          <p className="is-clip">
            {weekShifts.length
              ? `hrs · ${weekShifts.length} ${weekShifts.length === 1 ? "shift" : "shifts"}`
              : nextShift
                ? `next shift ${productionDayLabel(nextShift.shift.day)}`
                : "no shifts this week"}
          </p>
        </div>
        <button type="button" className="studio-metric is-blush" onClick={() => setTodoOpen(true)}>
          <p className="studio-kicker">to do</p>
          <strong>{open.length || "—"}</strong>
          <p className="is-clip">
            {open[0] ? `next: ${open[0].task.title}` : "all done. thank you."}
          </p>
        </button>
      </div>

      {productions.length ? (
        <section
          className="studio-module studio-prod-section studio-member-productions"
          data-tour="productions"
        >
          <div className="studio-prod-head">
            <p className="studio-home-label">your productions</p>
            <span className="studio-prod-count">{productions.length}</span>
          </div>
          {/* more than one sits side by side, to swipe through */}
          <div className={cn("studio-member-events", productions.length > 1 && "is-swipe")}>
            {productions.map((production) => (
              <ProductionListRow
                key={production.inquiry_id}
                item={{
                  inquiry_id: production.inquiry_id,
                  title: production.title,
                  project_name: production.project_name,
                  path: production.path,
                  status: production.status,
                  first: production.first,
                  last: production.last,
                  venue: production.venue,
                  address: production.address,
                  // their own tasks, so the bar is how far along they are
                  open_tasks: production.tasks.filter((task) => task.status === "open").length,
                  tasks: production.tasks.length,
                  people: production.people ?? [],
                  team_open: production.open,
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="studio-home-stage" data-tour="schedule">
        <aside className="studio-home-day">
          <p className="studio-home-label">calendar</p>
          <MonthBoard marks={marks} selected={day} onSelect={chooseDay} />
          {dayShifts.length || dayTasks.length ? (
            <div className="studio-home-daymarks">
              {dayShifts.map(({ shift, production }) => (
                <p key={shift.id}>
                  <b>{production.project_name}</b>
                  <span>
                    your shift {tinySpan(shift.starts, shift.ends)} ·{" "}
                    {hoursLabel(shiftHours(shift.starts, shift.ends))}
                  </span>
                </p>
              ))}
              {dayTasks.map(({ task, production }) => (
                <p key={task.id}>
                  <b>{task.title}</b>
                  <span>{production.project_name}</span>
                </p>
              ))}
            </div>
          ) : null}
        </aside>

        <div className={cn("studio-home-floor", week.length === 0 && "is-empty")}>
          <div className="studio-floor-head">
            <p className="studio-home-label">week</p>
            <div className="studio-floor-nav">
              <button
                type="button"
                className="studio-cal-nav"
                aria-label="previous week"
                onClick={() => moveWeek(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className="studio-floor-when">{weekLabel(weekOf, today)}</span>
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
          <div className="studio-floor-scroll">
            <div className="studio-timeline">
              {week.length === 0 ? (
                <p className="studio-empty">nothing for you this week.</p>
              ) : (
                <div className="studio-floor-run">
                  {week.map((group) => (
                    <section
                      key={group.date}
                      className={group.date === today ? "is-today" : undefined}
                      data-floor-day={group.date}
                    >
                      <h4>{formatFloorWhen(group.date, today)}</h4>
                      <ol>
                        {group.events.map(({ production, shifts: on, tasks: due }) => (
                          <li key={production.inquiry_id}>
                            <div className="studio-member-floor-event">
                              <Link
                                to="/production/$slug"
                                params={{ slug: slugOf(production.path) }}
                                className="studio-member-floor-name"
                              >
                                {production.project_name}
                                <ChevronRight aria-hidden="true" strokeWidth={1.5} />
                              </Link>
                              {on.map((shift) => (
                                <p key={shift.id} className="studio-member-floor-shift">
                                  your shift {tinySpan(shift.starts, shift.ends)} ·{" "}
                                  {hoursLabel(shiftHours(shift.starts, shift.ends))}
                                  {[shift.role, shift.location].filter(Boolean).length
                                    ? ` · ${[shift.role, shift.location].filter(Boolean).join(" · ")}`
                                    : ""}
                                </p>
                              ))}
                              {due.map((task) => (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "studio-member-floor-task",
                                    task.status === "done" && "is-done",
                                  )}
                                >
                                  {check(task)}
                                  <span>
                                    <b>{task.title}</b>
                                    <small>
                                      {[taskWhen(task.starts_at).split(" · ")[1], task.location]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </small>
                                  </span>
                                </div>
                              ))}
                            </div>
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
      </div>

      {/* how we flow, for later: they agreed to it the first time they came in */}
      <HowWeFlowCard />
      {import.meta.env.DEV ? (
        <button
          type="button"
          className="studio-flow-reopen"
          onClick={() => window.dispatchEvent(new Event(TOUR_OPEN_EVENT))}
        >
          see the tour again · local
        </button>
      ) : null}

      {/* the first time in, after how we flow: a short tour of today */}
      <TodayTour ready={Boolean(mine.data)} />

      <Dialog open={todoOpen} onOpenChange={setTodoOpen}>
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask studio-shift-modal"
          hideClose
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="studio-shift-title">to do</DialogTitle>
          <DialogDescription className="studio-share-lede">
            {open.length
              ? "everything still open for you, soonest first. check one off when it's done."
              : "all done. thank you."}
          </DialogDescription>
          <div className="studio-prod-tasks studio-member-todo">
            {open.map(({ task, production }) => (
              <div key={task.id} className="studio-prod-task">
                {check(task)}
                <div className="studio-prod-task-body">
                  <b>{task.title}</b>
                  <span className="studio-prod-task-meta">
                    {[taskWhen(task.starts_at), task.location].filter(Boolean).join(" · ") ||
                      "anytime"}
                  </span>
                  <Link
                    to="/production/$slug"
                    params={{ slug: slugOf(production.path) }}
                    className="studio-member-task-event"
                    onClick={() => setTodoOpen(false)}
                  >
                    {production.project_name}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
