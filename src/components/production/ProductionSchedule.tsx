import { CalendarClock, Check, Mail, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { InquiryDatePicker, InquiryTimePicker } from "@/components/inquiry/InquiryDatePicker";
import { ProdSection, type BoardProps } from "@/components/production/parts";
import { useChange } from "@/components/production/use-change";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoneyExact } from "@/lib/money";
import {
  clockTime,
  firstName,
  hoursLabel,
  hoursSummary,
  pickerTime,
  PRODUCTION_TIMES,
  productionDayLabel,
  hoursDueAt,
  rateLabel,
  ratePay,
  shiftHours,
  shortDayLabel,
  taskWhen,
  type MemberRate,
  type RatePer,
} from "@/lib/os/production";
import { cn } from "@/lib/utils";

const ROLES = ["production", "production hands", "lead", "install", "breakdown", "driver"];

type ShiftDraft = {
  id?: string;
  profile_id: string;
  /** a new shift can go on several days at once, at the same hours; a saved one is on one day */
  days: string[];
  starts: string;
  ends: string;
  role: string;
  location: string;
  /** what they're paid on this production, as typed: dollars, by the hour or flat */
  pay?: string;
  per?: RatePer;
};

const PAY_CHOICES: Array<{ value: RatePer; label: string }> = [
  { value: "hour", label: "hourly" },
  { value: "production", label: "flat rate" },
];

/** the rate as typed, or none when the amount is empty */
function typedRate(pay: string | undefined, per: RatePer | undefined): MemberRate | null {
  const dollars = Number(pay);
  if (!pay?.trim() || !Number.isFinite(dollars)) return null;
  return { cents: Math.round(dollars * 100), per: per ?? "hour" };
}

/** a rate, as the amount field shows it */
function rateFields(rate: MemberRate | null | undefined) {
  return { pay: rate ? String(rate.cents / 100) : "", per: rate?.per ?? ("hour" as RatePer) };
}

/** whether two shifts on the same day run over each other; one ending before it starts runs past midnight */
function shiftsOverlap(aStarts: string, aEnds: string, bStarts: string, bEnds: string) {
  const minutes = (clock: string) => {
    const [h = "0", m = "0"] = clock.split(":");
    return Number(h) * 60 + Number(m);
  };
  const span = (starts: string, ends: string) => {
    const from = minutes(starts);
    const to = minutes(ends);
    return [from, to > from ? to : to + 24 * 60] as const;
  };
  const [a1, a2] = span(aStarts, aEnds);
  const [b1, b2] = span(bStarts, bEnds);
  return a1 < b2 && b1 < a2;
}

/** "10a–6p", short enough for a roster square */
function tinySpan(starts: string, ends: string) {
  const tiny = (clock: string) =>
    pickerTime(clock).replace(":00", "").replace(" am", "a").replace(" pm", "p");
  return `${tiny(starts)}–${tiny(ends)}`;
}

/**
 * The schedule, for the studio only: a roster of who works which day, with each person's hours and
 * pay. The studio pays on these scheduled hours; once the last shift ends, the hours email the admins for payroll on their own. The
 * team sees who's on each day beside the production dates, and their own shifts on their today.
 */
export function ProductionSchedule({ view, api, onChanged }: Omit<BoardProps, "mode">) {
  const change = useChange(onChanged);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  // the names stay pinned as the days swipe under them; their column only fills in while it does
  const [scrolled, setScrolled] = useState(false);
  const names = new Map(view.people.map((person) => [person.id, person.name]));
  const summary = useMemo(
    () => hoursSummary(view.shifts, names, view.rates),
    // names follow the people
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.shifts, view.rates],
  );
  const days = useMemo(
    () =>
      [
        ...new Set([...view.days.map((row) => row.day), ...view.shifts.map((shift) => shift.day)]),
      ].sort(),
    [view.days, view.shifts],
  );
  // everyone on the production gets a row, scheduled or not yet
  const rows = [
    ...summary.people,
    ...view.crew
      .filter((id) => !summary.people.some((row) => row.profile_id === id))
      .map((id) => ({
        profile_id: id,
        name: names.get(id) ?? "a teammate",
        shifts: [] as (typeof summary.people)[number]["shifts"],
        hours: 0,
        rate: view.rates[id] ?? null,
        pay_cents: view.rates[id] == null ? null : 0,
      })),
  ];

  function edit(id: string) {
    const shift = view.shifts.find((item) => item.id === id);
    if (!shift) return;
    setDraft({
      id: shift.id,
      profile_id: shift.profile_id,
      days: [shift.day],
      starts: shift.starts,
      ends: shift.ends,
      role: shift.role,
      location: shift.location,
    });
  }

  function add(prefill: Partial<ShiftDraft> = {}) {
    // a new shift starts from the person's last one, so a week of the same hours is quick
    const last = [...view.shifts]
      .filter((shift) => shift.profile_id === prefill.profile_id)
      .sort((a, b) => `${b.day}${b.starts}`.localeCompare(`${a.day}${a.starts}`))[0];
    setDraft({
      profile_id: "",
      days: [],
      starts: last?.starts ?? "",
      ends: last?.ends ?? "",
      role: last?.role ?? "",
      location: last?.location ?? "studio",
      ...prefill,
    });
  }

  // the hours email the studio on their own once the last shift ends
  const hoursDue = hoursDueAt(view.shifts);
  const hoursSent = view.production.hours_sent_at ?? null;

  const dayHours = (day: string) =>
    view.shifts
      .filter((shift) => shift.day === day)
      .reduce((sum, shift) => sum + shiftHours(shift.starts, shift.ends), 0);

  return (
    <ProdSection
      icon={<CalendarClock aria-hidden="true" strokeWidth={1.5} />}
      title="schedule"
      id="schedule"
      action={
        <>
          {view.shifts.length ? (
            <span className="studio-prod-count">
              {hoursLabel(summary.hours)}
              {view.canPay && summary.pay_cents != null
                ? ` · ${formatMoneyExact(summary.pay_cents)}`
                : ""}
            </span>
          ) : null}
          <button type="button" className="studio-today-go is-pearl" onClick={() => add()}>
            <Plus aria-hidden="true" strokeWidth={1.5} />
            add shift
          </button>
        </>
      }
    >
      {!rows.length || !days.length ? (
        <p className="studio-prod-muted">
          {!days.length
            ? "add the production days, then who works when. each person hears their shifts and hours by email, and the hours add up here for payroll."
            : "put people on the production, or add a shift. each person hears their shifts and hours by email, and the hours add up here for payroll."}
        </p>
      ) : (
        <div
          className={cn("studio-roster-wrap", scrolled && "is-scrolled")}
          onScroll={(event) => setScrolled(event.currentTarget.scrollLeft > 0)}
        >
          <table className="studio-roster">
            <thead>
              <tr>
                <th scope="col">who</th>
                {days.map((day) => (
                  <th key={day} scope="col">
                    {shortDayLabel(day)}
                  </th>
                ))}
                <th scope="col">hours</th>
                {view.canPay ? <th scope="col">pay</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.profile_id}>
                  <th scope="row">
                    <span className="studio-schedule-who">
                      <i aria-hidden="true">{firstName(row.name).charAt(0).toLowerCase()}</i>
                      {firstName(row.name)}
                    </span>
                  </th>
                  {days.map((day) => {
                    const theirs = row.shifts.filter((shift) => shift.day === day);
                    return (
                      <td key={day}>
                        {theirs.map((shift) => (
                          <button
                            key={shift.id ?? `${shift.day}${shift.starts}`}
                            type="button"
                            className="studio-roster-shift"
                            title={[shift.role, shift.location].filter(Boolean).join(" · ")}
                            onClick={() => (shift.id ? edit(shift.id) : undefined)}
                          >
                            <b>{tinySpan(shift.starts, shift.ends)}</b>
                            <small>{hoursLabel(shift.hours)}</small>
                          </button>
                        ))}
                        {theirs.length ? null : (
                          <button
                            type="button"
                            className="studio-roster-empty"
                            aria-label={`add a shift for ${firstName(row.name)} on ${productionDayLabel(day)}`}
                            onClick={() => add({ profile_id: row.profile_id, days: [day] })}
                          >
                            <Plus aria-hidden="true" strokeWidth={1.5} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="is-total">{row.hours ? hoursLabel(row.hours) : "—"}</td>
                  {view.canPay ? (
                    <td
                      className={cn("is-total", row.rate == null && "is-quiet")}
                      title={row.rate ? rateLabel(row.rate) : undefined}
                    >
                      {row.rate == null
                        ? "no rate"
                        : row.hours
                          ? formatMoneyExact(row.pay_cents ?? 0)
                          : rateLabel(row.rate)}
                      {row.rate?.per === "production" && row.hours ? <small>flat</small> : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">each day</th>
                {days.map((day) => (
                  <td key={day}>{dayHours(day) ? hoursLabel(dayHours(day)) : "—"}</td>
                ))}
                <td className="is-total">{hoursLabel(summary.hours)}</td>
                {view.canPay ? (
                  <td className="is-total">
                    {summary.pay_cents == null ? "" : formatMoneyExact(summary.pay_cents)}
                  </td>
                ) : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {hoursSent ? (
        <p className="studio-schedule-hours-note">
          <Mail aria-hidden="true" strokeWidth={1.5} />
          the hours and the spreadsheet were emailed to you {taskWhen(hoursSent)}.
        </p>
      ) : hoursDue ? (
        <p className="studio-schedule-hours-note">
          <Mail aria-hidden="true" strokeWidth={1.5} />
          the hours and the spreadsheet email to you on their own after the last shift,{" "}
          {taskWhen(hoursDue)}.
        </p>
      ) : null}

      <ShiftDialog
        draft={draft}
        view={view}
        days={view.days.map((row) => row.day)}
        busy={change.busy}
        onClose={() => setDraft(null)}
        onSave={async (next) => {
          if (!next.days.length || !next.profile_id || !next.starts || !next.ends) return;
          // the same hours on each day chosen: a shift a day
          const saved = await change.run(async () => {
            for (const day of [...next.days].sort()) {
              await api.saveShift({
                inquiry_id: view.production.inquiry_id,
                ...(next.id ? { id: next.id } : {}),
                profile_id: next.profile_id,
                day,
                starts: next.starts,
                ends: next.ends,
                role: next.role.trim(),
                location: next.location.trim(),
              });
            }
            // what they're paid lives on this production, set right here with their shift
            if (view.canPay) {
              const rate = typedRate(next.pay, next.per);
              const before = view.rates[next.profile_id] ?? null;
              if (rate?.cents !== before?.cents || rate?.per !== before?.per) {
                await api.setRate(view.production.inquiry_id, next.profile_id, rate);
              }
            }
            return true;
          });
          if (!saved) return;
          setDraft(null);
          const count = next.days.length;
          toast.success(
            `${count > 1 ? `${count} shifts saved` : "saved"}. they'll hear when you share with the team.`,
          );
        }}
        onRemove={async (id) => {
          await change.run(() => api.removeShift(id), "shift removed");
          setDraft(null);
        }}
      />
    </ProdSection>
  );
}

function ShiftDialog({
  draft,
  view,
  days,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  draft: ShiftDraft | null;
  view: BoardProps["view"];
  days: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ShiftDraft) => void;
  onRemove: (id: string) => void;
}) {
  const [form, setForm] = useState<ShiftDraft | null>(null);
  const [shownFor, setShownFor] = useState<ShiftDraft | null>(null);
  const [picking, setPicking] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // after a try to save, what's still missing is outlined
  const [tried, setTried] = useState(false);
  // a shift over one they already have asks first
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  // where a shift happens: the studio, or the event's venue, or somewhere else written in
  const venue = view.event.venueName?.trim() || "the venue";
  const places = ["studio", venue];
  if (draft !== shownFor) {
    setShownFor(draft);
    setForm(draft ? { ...draft, ...rateFields(view.rates[draft.profile_id]) } : draft);
    setPicking(false);
    setElsewhere(Boolean(draft?.location && !places.includes(draft.location)));
    setConfirmRemove(false);
    setTried(false);
    setConfirmOverlap(false);
  }
  if (!form) return null;
  const editing = Boolean(form.id);
  // the crew first, then everyone else who's active
  const people = [...view.people]
    .filter((person) => person.active || person.id === form.profile_id)
    .sort(
      (a, b) =>
        Number(view.crew.includes(b.id)) - Number(view.crew.includes(a.id)) ||
        a.name.localeCompare(b.name),
    );
  // the production days, and any other day picked for this shift
  const dayChoices = [...new Set([...days, ...form.days])].sort();
  const hours = form.starts && form.ends ? shiftHours(form.starts, form.ends) : 0;
  // the rate as it's typed here, for this production
  const rate = typedRate(form.pay, form.per);
  const who = people.find((person) => person.id === form.profile_id);
  const count = form.days.length;
  const ready = Boolean(form.profile_id && count && form.starts && form.ends);
  const pay = ratePay(rate, hours * count);
  const missing = {
    who: !form.profile_id,
    days: !count,
    starts: !form.starts,
    ends: !form.ends,
  };
  const missingWords = [
    missing.who ? "who" : "",
    missing.days ? (editing ? "the day" : "the days") : "",
    missing.starts ? "when it starts" : "",
    missing.ends ? "when it ends" : "",
  ].filter(Boolean);
  // their other shifts on the same days that this one would run over
  const clashes =
    form.profile_id && form.starts && form.ends
      ? view.shifts.filter(
          (shift) =>
            shift.profile_id === form.profile_id &&
            shift.id !== form.id &&
            form.days.includes(shift.day) &&
            shiftsOverlap(form.starts, form.ends, shift.starts, shift.ends),
        )
      : [];
  const whoName = who ? firstName(who.name) : "they";

  function toggleDay(day: string) {
    if (!form) return;
    // a saved shift sits on one day; a new one can go on as many as share its hours
    if (editing) return setForm({ ...form, days: [day] });
    setForm({
      ...form,
      days: form.days.includes(day)
        ? form.days.filter((item) => item !== day)
        : [...form.days, day],
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (!ready) {
      setTried(true);
      return;
    }
    if (clashes.length && !confirmOverlap) {
      setConfirmOverlap(true);
      return;
    }
    onSave(form);
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => (open ? null : onClose())}>
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
        <DialogTitle className="studio-shift-title">
          {editing ? "change the shift" : count > 1 ? `add ${count} shifts` : "add a shift"}
          {who ? <span> for {firstName(who.name)}</span> : null}
        </DialogTitle>
        <DialogDescription className="sr-only">
          who works when, as what, and where.
        </DialogDescription>
        <form className="studio-task-form studio-shift-form" onSubmit={submit}>
          <div
            className={cn("studio-shift-field", tried && missing.who && "is-missing")}
            role="group"
            aria-label="who"
          >
            <span className="studio-ask-label studio-shift-who-label">
              who
              {/* only people in the gang can be scheduled */}
              <Link to="/directories/team" className="studio-shift-who-add">
                someone new? add them in the gang
              </Link>
            </span>
            <div className="studio-shift-picks">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={form.profile_id === person.id}
                  className={cn("studio-shift-pick", form.profile_id === person.id && "is-on")}
                  onClick={() =>
                    setForm({
                      ...form,
                      profile_id: person.id,
                      ...(person.id === form.profile_id ? {} : rateFields(view.rates[person.id])),
                    })
                  }
                >
                  <i aria-hidden="true">{firstName(person.name).charAt(0).toLowerCase()}</i>
                  {firstName(person.name)}
                </button>
              ))}
            </div>
          </div>

          {/* what they're paid on this production: each job sets its own */}
          {view.canPay && form.profile_id ? (
            <div className="studio-shift-field" role="group" aria-label="paid">
              <span className="studio-ask-label">
                paid
                <small> · {whoName} on this production</small>
              </span>
              <div className="studio-add-paid">
                <div className="studio-shift-picks">
                  {PAY_CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      aria-pressed={(form.per ?? "hour") === choice.value}
                      className={cn(
                        "studio-shift-pick",
                        (form.per ?? "hour") === choice.value && "is-on",
                      )}
                      onClick={() => setForm({ ...form, per: choice.value })}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                <span className="studio-add-money">
                  <i aria-hidden="true">$</i>
                  <input
                    value={form.pay ?? ""}
                    inputMode="decimal"
                    aria-label={form.per === "production" ? "flat rate" : "hourly rate"}
                    placeholder={form.per === "production" ? "300" : "25"}
                    onChange={(event) =>
                      setForm({ ...form, pay: event.target.value.replace(/[^\d.]/g, "") })
                    }
                  />
                  <small aria-hidden="true">{form.per === "production" ? "flat" : "/hr"}</small>
                </span>
              </div>
            </div>
          ) : null}

          <div
            className={cn("studio-shift-field", tried && missing.days && "is-missing")}
            role="group"
            aria-label={editing ? "day" : "days"}
          >
            <span className="studio-ask-label">
              {editing ? "day" : "days"}
              {editing ? null : <small> · pick every day with these hours</small>}
            </span>
            <div className="studio-shift-picks">
              {dayChoices.map((day) => {
                const on = form.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    className={cn("studio-shift-pick", on && "is-on")}
                    onClick={() => toggleDay(day)}
                  >
                    {on && !editing ? <Check aria-hidden="true" strokeWidth={1.75} /> : null}
                    {shortDayLabel(day)}
                  </button>
                );
              })}
              <button
                type="button"
                aria-expanded={picking || !dayChoices.length}
                className="studio-shift-pick is-quiet"
                onClick={() => setPicking((open) => !open)}
              >
                <Plus aria-hidden="true" strokeWidth={1.5} />
                another day
              </button>
            </div>
            {picking || !dayChoices.length ? (
              <div className="studio-shift-other">
                <InquiryDatePicker
                  value={null}
                  withTime={false}
                  allowPast
                  compact
                  placeholder="pick the day"
                  onChange={(day) => {
                    if (!day) return;
                    setPicking(false);
                    setForm({
                      ...form,
                      days: editing
                        ? [day]
                        : form.days.includes(day)
                          ? form.days
                          : [...form.days, day],
                    });
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="studio-shift-times">
            <div className={cn("studio-shift-field", tried && missing.starts && "is-missing")}>
              <span className="studio-ask-label">starts</span>
              <InquiryTimePicker
                value={form.starts ? pickerTime(form.starts) : ""}
                times={PRODUCTION_TIMES}
                compact
                placeholder="starts"
                onChange={(picked) => setForm({ ...form, starts: clockTime(picked) })}
              />
            </div>
            <div className={cn("studio-shift-field", tried && missing.ends && "is-missing")}>
              <span className="studio-ask-label">ends</span>
              <InquiryTimePicker
                value={form.ends ? pickerTime(form.ends) : ""}
                times={PRODUCTION_TIMES}
                compact
                placeholder="ends"
                onChange={(picked) => setForm({ ...form, ends: clockTime(picked) })}
              />
            </div>
          </div>
          {clashes.length ? (
            <p className="studio-shift-clash" role="status">
              {whoName} already {clashes.length === 1 ? "has a shift" : "has shifts"} then:{" "}
              {clashes
                .map((shift) => `${shortDayLabel(shift.day)} ${tinySpan(shift.starts, shift.ends)}`)
                .join(", ")}
            </p>
          ) : null}

          <div className="studio-shift-field" role="group" aria-label="where">
            <span className="studio-ask-label">where</span>
            <div className="studio-shift-picks">
              {places.map((place) => {
                const on = !elsewhere && form.location === place;
                return (
                  <button
                    key={place}
                    type="button"
                    aria-pressed={on}
                    className={cn("studio-shift-pick", on && "is-on")}
                    onClick={() => {
                      setElsewhere(false);
                      setForm({ ...form, location: place });
                    }}
                  >
                    {place}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={elsewhere}
                className={cn("studio-shift-pick is-quiet", elsewhere && "is-on")}
                onClick={() => {
                  setElsewhere(true);
                  if (places.includes(form.location)) setForm({ ...form, location: "" });
                }}
              >
                somewhere else
              </button>
            </div>
            {elsewhere ? (
              <input
                autoFocus
                value={form.location}
                maxLength={160}
                aria-label="where else"
                placeholder="the market, the client's home…"
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            ) : null}
          </div>

          <datalist id="studio-shift-roles">
            {ROLES.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
          <label className="studio-shift-field">
            <span className="studio-ask-label">as</span>
            <input
              list="studio-shift-roles"
              value={form.role}
              maxLength={80}
              placeholder="production, install…"
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            />
          </label>

          <div className="studio-shift-foot">
            <p
              className={cn(
                "studio-shift-sum",
                tried && !ready && "is-missing",
                confirmOverlap && clashes.length && "is-missing",
              )}
            >
              {confirmOverlap && clashes.length ? (
                `this runs over a shift ${whoName} already has. add it anyway?`
              ) : tried && !ready ? (
                `still to pick: ${missingWords.join(", ")}`
              ) : hours ? (
                <>
                  {count > 1
                    ? `${count} × ${hoursLabel(hours)} = ${hoursLabel(hours * count)}`
                    : hoursLabel(hours)}
                  {rate ? (
                    <span>
                      {" "}
                      · {rateLabel(rate)}
                      {pay != null && rate.per === "hour" ? ` · ${formatMoneyExact(pay)}` : ""}
                    </span>
                  ) : who ? (
                    <span> · no rate yet</span>
                  ) : null}
                </>
              ) : null}
            </p>
            <span className="studio-shift-go">
              {editing ? (
                confirmRemove ? (
                  <>
                    <span className="studio-prod-note">remove this shift?</span>
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
                  </>
                ) : (
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() => setConfirmRemove(true)}
                  >
                    remove
                  </button>
                )
              ) : null}
              {confirmOverlap && clashes.length && !confirmRemove ? (
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() => setConfirmOverlap(false)}
                >
                  change it
                </button>
              ) : null}
              {confirmRemove ? null : (
                <button type="submit" className="studio-today-go" disabled={busy}>
                  {busy
                    ? "saving…"
                    : confirmOverlap && clashes.length
                      ? "add it anyway"
                      : editing
                        ? "save"
                        : count > 1
                          ? `add ${count} shifts`
                          : "add shift"}
                </button>
              )}
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
