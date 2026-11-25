import { Check, ListChecks, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AskField } from "@/components/portal/ask-form";
import { ProdSection, type BoardProps } from "@/components/production/parts";
import { WhenPicker } from "@/components/production/fields";
import { useChange } from "@/components/production/use-change";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  firstName,
  studioToday,
  productionDayLabel,
  shortDayLabel,
  TASK_CATEGORIES,
  taskInputInstant,
  taskInputValue,
  taskWhen,
  type ProductionTaskView,
} from "@/lib/os/production";
import { STUDIO_ZONE } from "@/lib/studio-bookings";
import { cn } from "@/lib/utils";

type TaskDraft = {
  id?: string;
  title: string;
  when: string;
  category: string;
  location: string;
  people: string[];
};

const EMPTY: TaskDraft = { title: "", when: "", category: "", location: "", people: [] };

/** the studio-zone day a task falls on, for grouping: "2026-11-28", or "" for anytime */
function taskDay(startsAt: string | null) {
  if (!startsAt) return "";
  return taskInputValue(startsAt).slice(0, 10);
}

type Column = { key: string; label: string; tasks: ProductionTaskView[] };

/** "mon 11/30", short enough for a tab */
const shortDay = shortDayLabel;

export function ProductionTasks({ view, mode, api, onChanged }: BoardProps) {
  const studio = mode === "studio";
  const change = useChange(onChanged);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  // a member opens on their own tasks; everyone's is a tap away
  const [onlyMine, setOnlyMine] = useState(
    () => mode === "team" && view.tasks.some((task) => task.people.includes(view.viewer.id)),
  );
  const [dayTab, setDayTab] = useState<string | null>(null);
  const me = view.viewer.id;
  const isAdmin = view.viewer.role === "admin";
  const mine = view.tasks.filter((task) => task.people.includes(me));
  const shown = onlyMine ? mine : view.tasks;
  const names = new Map(view.people.map((person) => [person.id, person]));

  const columns = useMemo<Column[]>(() => {
    // the list goes day by day
    const byDay = new Map<string, ProductionTaskView[]>();
    for (const task of shown) {
      const key = taskDay(task.starts_at);
      byDay.set(key, [...(byDay.get(key) ?? []), task]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a || "0").localeCompare(b || "0"))
      .map(([day, tasks]) => ({
        key: day || "anytime",
        label: day ? productionDayLabel(day) : "anytime",
        tasks,
      }));
  }, [shown]);

  const open = view.tasks.filter((task) => task.status === "open").length;
  const today = studioToday();
  // the list always has today, even when nothing's due, and opens on it
  const dayColumns: Column[] = !columns.some((column) => column.key === today)
    ? [...columns, { key: today, label: productionDayLabel(today), tasks: [] }].sort((a, b) =>
        (a.key === "anytime" ? "0" : a.key).localeCompare(b.key === "anytime" ? "0" : b.key),
      )
    : columns;
  const openTab =
    dayTab && (dayTab === "all" || dayColumns.some((column) => column.key === dayTab))
      ? dayTab
      : today;

  function canCheck(task: ProductionTaskView) {
    if (isAdmin) return true;
    return task.people.includes(me) && view.access.open;
  }

  async function toggle(task: ProductionTaskView) {
    const done = task.status !== "done";
    await change.run(() => api.setTaskDone(task.id, done), done ? "done" : undefined);
  }

  function edit(task: ProductionTaskView) {
    setDraft({
      id: task.id,
      title: task.title,
      when: taskInputValue(task.starts_at),
      category: task.category,
      location: task.location,
      people: task.people,
    });
  }

  const card = (task: ProductionTaskView, column: Column) => (
    <TaskCard
      key={`${column.key}-${task.id}`}
      task={task}
      me={me}
      names={names}
      studio={studio}
      busy={change.busy}
      checkable={canCheck(task)}
      // a column already says the day, the person, or the kind; the card doesn't repeat it
      showDay={false}
      showCategory
      showPeople
      onToggle={() => void toggle(task)}
      onEdit={() => edit(task)}
    />
  );

  return (
    <ProdSection
      icon={<ListChecks aria-hidden="true" strokeWidth={1.5} />}
      title="tasks"
      id="tasks"
      action={
        <>
          {!studio && mine.length && mine.length !== view.tasks.length ? (
            // either their own tasks, or everyone's
            <span
              className="studio-task-layouts studio-task-whose"
              role="tablist"
              aria-label="whose"
            >
              {(
                [
                  [true, "yours"],
                  [false, "all"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={onlyMine === value}
                  className={cn(onlyMine === value && "is-on")}
                  onClick={() => setOnlyMine(value)}
                >
                  {label}
                  {value ? <small>{mine.length}</small> : null}
                </button>
              ))}
            </span>
          ) : null}
          {view.tasks.length ? (
            <span className="studio-prod-count">{open ? `${open} open` : "all done"}</span>
          ) : null}
          {studio ? (
            <button
              type="button"
              className="studio-today-go is-pearl"
              onClick={() => setDraft({ ...EMPTY })}
            >
              <Plus aria-hidden="true" strokeWidth={1.5} />
              add task
            </button>
          ) : null}
        </>
      }
    >
      {columns.length ? (
        <>
          {/* a tab a day: it opens on today, or the next day with something on it */}
          <div className="studio-task-days" role="tablist" aria-label="day">
            {dayColumns.map((column) => {
              const left = column.tasks.filter((task) => task.status === "open").length;
              return (
                <button
                  key={column.key}
                  type="button"
                  role="tab"
                  aria-selected={openTab === column.key}
                  className={cn(openTab === column.key && "is-on")}
                  onClick={() => setDayTab(column.key)}
                >
                  {column.key === today
                    ? `today ${shortDay(today).split(" ")[1]}`
                    : shortDay(column.key)}
                  {left ? <small>{left}</small> : null}
                </button>
              );
            })}
            {dayColumns.length > 1 ? (
              <button
                type="button"
                role="tab"
                aria-selected={openTab === "all"}
                className={cn(openTab === "all" && "is-on")}
                onClick={() => setDayTab("all")}
              >
                all
              </button>
            ) : null}
          </div>
          <div className="studio-prod-tasks">
            {dayColumns
              .filter((column) =>
                openTab === "all" ? column.tasks.length > 0 : column.key === openTab,
              )
              .map((column) => (
                <div key={column.key} className="studio-prod-task-day">
                  {openTab === "all" ? (
                    <p className="studio-prod-day-label">{column.label}</p>
                  ) : null}
                  {column.tasks.length ? (
                    column.tasks.map((task) => card(task, column))
                  ) : (
                    <p className="studio-prod-muted">
                      nothing due {column.key === today ? "today" : "this day"}.
                    </p>
                  )}
                </div>
              ))}
          </div>
        </>
      ) : (
        <p className="studio-prod-muted">
          {studio
            ? "add the tasks for this production and assign them. each person hears about theirs by email and on their bell."
            : "no tasks yet."}
        </p>
      )}

      {studio ? (
        <TaskDialog
          draft={draft}
          view={view}
          busy={change.busy}
          onClose={() => setDraft(null)}
          onSave={async (next) => {
            const startsAt = next.when ? taskInputInstant(next.when) : null;
            const saved = await change.run(() =>
              api.saveTask({
                inquiry_id: view.production.inquiry_id,
                ...(next.id ? { id: next.id } : {}),
                title: next.title.trim(),
                starts_at: startsAt,
                category: next.category.trim(),
                location: next.location.trim(),
                people: next.people,
              }),
            );
            if (!saved) return;
            setDraft(null);
            const before = next.id
              ? (view.tasks.find((task) => task.id === next.id)?.people ?? [])
              : [];
            const added = next.people.filter((id) => !before.includes(id) && id !== me);
            toast.success(
              added.length
                ? `saved. ${added.length === 1 ? "they'll" : "they'll each"} hear when you share with the team.`
                : "saved",
            );
          }}
          onRemove={async (id) => {
            await change.run(() => api.removeTask(id), "task removed");
            setDraft(null);
          }}
        />
      ) : null}
    </ProdSection>
  );
}

function TaskCard({
  task,
  me,
  names,
  studio,
  busy,
  checkable,
  showDay,
  showCategory,
  showPeople,
  onToggle,
  onEdit,
}: {
  task: ProductionTaskView;
  me: string;
  names: Map<string, { name: string; active: boolean }>;
  studio: boolean;
  busy: boolean;
  checkable: boolean;
  showDay: boolean;
  showCategory: boolean;
  showPeople: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const yours = task.people.includes(me);
  const when = taskWhen(task.starts_at);
  const meta = [
    showDay ? when : when.split(" · ")[1],
    showCategory ? task.category : "",
    task.location,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        "studio-prod-task",
        task.status === "done" && "is-done",
        yours && !studio && "is-yours",
      )}
    >
      <button
        type="button"
        className="studio-prod-check"
        role="checkbox"
        aria-checked={task.status === "done"}
        aria-label={`${task.status === "done" ? "reopen" : "check off"} ${task.title}`}
        disabled={!checkable || busy}
        title={checkable ? undefined : "only the people on a task can check it off"}
        onClick={onToggle}
      >
        {task.status === "done" ? <Check aria-hidden="true" strokeWidth={2} /> : null}
      </button>
      <button
        type="button"
        className="studio-prod-task-body"
        disabled={!studio}
        onClick={() => studio && onEdit()}
      >
        <b>{task.title}</b>
        {meta.length ? <span className="studio-prod-task-meta">{meta.join(" · ")}</span> : null}
        {showPeople && task.people.length ? (
          <span className="studio-prod-task-people">
            {task.people.map((id) => {
              const person = names.get(id);
              return (
                <span
                  key={id}
                  className={cn(
                    "studio-prod-person",
                    id === me && "is-me",
                    person && !person.active && "is-off",
                  )}
                >
                  {id === me ? "you" : person ? firstName(person.name) : "a teammate"}
                </span>
              );
            })}
          </span>
        ) : showPeople && studio ? (
          <span className="studio-prod-task-meta is-loose">no one yet</span>
        ) : null}
      </button>
    </div>
  );
}

function TaskDialog({
  draft,
  view,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  draft: TaskDraft | null;
  view: BoardProps["view"];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onRemove: (id: string) => void;
}) {
  const [form, setForm] = useState<TaskDraft>(EMPTY);
  const [shownFor, setShownFor] = useState<TaskDraft | null>(null);
  if (draft !== shownFor) {
    setShownFor(draft);
    setForm(draft ?? EMPTY);
  }
  const [confirmRemove, setConfirmRemove] = useState(false);
  // someone inactive can be seen on a task they already had, but not picked anew
  const pickable = view.people.filter((person) => person.active || form.people.includes(person.id));
  const inactive = view.people.filter(
    (person) => !person.active && !form.people.includes(person.id),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  }

  function togglePerson(id: string) {
    setForm((current) => ({
      ...current,
      people: current.people.includes(id)
        ? current.people.filter((person) => person !== id)
        : [...current.people, id],
    }));
  }

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmRemove(false);
          onClose();
        }
      }}
    >
      <DialogContent
        overlayClassName="studio-task-veil"
        className="studio-task-modal is-ask"
        hideClose
      >
        <div className="studio-task-head">
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogTitle className="sr-only">{form.id ? "edit task" : "add a task"}</DialogTitle>
        <DialogDescription className="sr-only">
          what needs doing, when, and who's on it.
        </DialogDescription>
        <form className="studio-task-form" onSubmit={submit}>
          <label className="studio-task-composer-title">
            <span className="sr-only">the task</span>
            <input
              autoFocus
              value={form.title}
              maxLength={200}
              placeholder="what needs doing…"
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <datalist id="studio-prod-categories">
            {TASK_CATEGORIES.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <div className="studio-ask-grid is-two studio-ask-stack-form">
            {/* a div, not a label: the day and the time are two pickers */}
            <div className="studio-ask-field">
              <span className="studio-ask-label">
                when ({STUDIO_ZONE === "America/New_York" ? "miami time" : "studio time"})
              </span>
              <WhenPicker value={form.when} onChange={(when) => setForm({ ...form, when })} />
            </div>
            <AskField label="category">
              <input
                list="studio-prod-categories"
                value={form.category}
                maxLength={80}
                placeholder="floral prep…"
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </AskField>
            <AskField label="location" className="studio-ask-span">
              <input
                value={form.location}
                maxLength={160}
                placeholder="studio, venue…"
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </AskField>
          </div>
          <div className="studio-prod-people" role="group" aria-label="assigned to">
            <span className="studio-ask-label">assigned to</span>
            <div>
              {pickable.map((person) => {
                const on = form.people.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={on}
                    className={cn("studio-prod-pick", on && "is-on", !person.active && "is-off")}
                    onClick={() => togglePerson(person.id)}
                  >
                    {on ? <Check aria-hidden="true" strokeWidth={2} /> : null}
                    {firstName(person.name)}
                    {person.active ? "" : " · inactive"}
                  </button>
                );
              })}
            </div>
            {inactive.length ? (
              <p className="studio-prod-note">
                {inactive.map((person) => firstName(person.name)).join(", ")}{" "}
                {inactive.length === 1 ? "is" : "are"} inactive. activate them in the gang to assign
                them.
              </p>
            ) : null}
            {pickable.length <= 1 ? (
              <p className="studio-prod-note">
                invite members from library → gang, and they'll show here.
              </p>
            ) : null}
          </div>
          <div className={cn("studio-ask-foot", form.id && "is-spread")}>
            {form.id ? (
              confirmRemove ? (
                <span className="studio-prod-row-go">
                  <span className="studio-prod-note">remove this task?</span>
                  <button
                    type="button"
                    className="studio-ghost is-danger"
                    disabled={busy}
                    onClick={() => onRemove(form.id!)}
                  >
                    remove
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() => setConfirmRemove(false)}
                  >
                    keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() => setConfirmRemove(true)}
                >
                  remove task
                </button>
              )
            ) : null}
            <button type="submit" className="studio-today-go" disabled={!form.title.trim() || busy}>
              {busy ? "saving…" : form.id ? "save" : "add task"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
