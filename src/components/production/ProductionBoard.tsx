import {
  CalendarDays,
  ClipboardList,
  Copy,
  MapPin,
  Paperclip,
  Plus,
  Shirt,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ProdSection, SaveOnBlur, type BoardProps } from "@/components/production/parts";
import { useChange } from "@/components/production/use-change";
import { DayEditor, QtyStepper } from "@/components/production/fields";
import { ProductionRecipe } from "@/components/production/ProductionRecipe";
import { ProductionSchedule } from "@/components/production/ProductionSchedule";
import { ProductionShare } from "@/components/production/ProductionShare";
import { ProtectedFile } from "@/components/production/ProtectedFile";
import { ProductionTasks } from "@/components/production/ProductionTasks";
import { PlaceLink } from "@/components/studio/PlaceLink";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProductionVision } from "@/components/production/ProductionVision";
import { ConfirmRemove } from "@/components/studio/ConfirmRemove";
import type { ProductionItemRow, ProductionStatus } from "@/integrations/supabase/types";
import {
  dayLines,
  eventTypeLabel,
  ITEM_KINDS,
  ITEM_STATUSES,
  phaseNext,
  PRODUCTION_STATUSES,
  productionDateRange,
  productionDayLabel,
  productionStatusLabel,
  firstName,
  shiftSpan,
  taskWhen,
  type ProductionView,
} from "@/lib/os/production";
import { viewable } from "@/lib/os/viewable-file";
import { cn } from "@/lib/utils";

export function ProductionBoard({ view, mode, api, onChanged }: BoardProps) {
  const studio = mode === "studio";
  const vision = view.files.filter((file) => file.kind === "vision");
  const hasVision = Boolean(view.visionUrl) || vision.length > 0;
  return (
    <div className={cn("studio-prod", studio ? "is-studio" : "is-team")}>
      {studio ? <StudioHeader view={view} api={api} onChanged={onChanged} /> : null}
      <EventOverview view={view} mode={mode} api={api} onChanged={onChanged} />
      {studio ? <ProductionSchedule view={view} api={api} onChanged={onChanged} /> : null}
      {studio || hasVision ? (
        <ProductionVision view={view} mode={mode} api={api} onChanged={onChanged} />
      ) : null}
      {studio || view.items.length ? (
        <FloralOrder view={view} mode={mode} api={api} onChanged={onChanged} />
      ) : null}
      {studio || view.stems.length ? (
        <ProductionRecipe view={view} mode={mode} api={api} onChanged={onChanged} />
      ) : null}
      <ProductionTasks view={view} mode={mode} api={api} onChanged={onChanged} />
      {studio || view.files.some((file) => file.kind === "logistics") ? (
        <Logistics view={view} mode={mode} api={api} onChanged={onChanged} />
      ) : null}
    </div>
  );
}

/** the page's header for the team: whose event, when, where */
export function TeamHeader({ view }: { view: ProductionView }) {
  const range = productionDateRange(view.event.first, view.event.last);
  return (
    <header className="studio-prod-hello">
      <h1>{view.title}</h1>
      <p className="studio-prod-facts">
        {[range, view.event.venueName, eventTypeLabel(view.event.type)].filter(Boolean).join(" · ")}
        <span className={cn("studio-prod-status", `is-${view.status}`)}>
          {productionStatusLabel(view.status)}
        </span>
      </p>
    </header>
  );
}

function StudioHeader({ view, api, onChanged }: Omit<BoardProps, "mode">) {
  const change = useChange(onChanged);
  const inquiryId = view.production.inquiry_id;
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const names = new Map(view.people.map((person) => [person.id, person]));
  const onIt = view.crew.flatMap((id) => {
    const person = names.get(id);
    return person ? [person] : [];
  });
  const addable = view.people.filter((person) => person.active && !view.crew.includes(person.id));
  const leavingPerson = onIt.find((person) => person.id === leaving) ?? null;
  const taskCount = (id: string) => view.tasks.filter((task) => task.people.includes(id)).length;

  async function copy() {
    const link = `${window.location.origin}${view.path}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("link copied");
    } catch {
      toast.error("the link didn't copy. try again.");
    }
  }

  return (
    <section className="studio-module studio-prod-section studio-prod-top">
      <div className="studio-prod-head">
        <p className="studio-home-label">
          <Sparkles aria-hidden="true" strokeWidth={1.5} />
          production
        </p>
        <div className="studio-prod-head-go">
          <button
            type="button"
            className="studio-prod-icon"
            title="copy the team's link"
            aria-label="copy the team's link"
            onClick={() => void copy()}
          >
            <Copy aria-hidden="true" strokeWidth={1.5} />
            <span>copy link</span>
          </button>
          <ProductionShare view={view} api={api} onChanged={onChanged} variant="button" />
        </div>
      </div>
      {/* the project's name, read as "say sukii x …"; it saves when you click away */}
      <label className="studio-prod-name is-whisper">
        <span>say sukii x</span>
        <SaveOnBlur
          label="project name"
          value={view.production.project_name}
          placeholder="project name"
          onSave={(next) => {
            if (!next) return;
            void change.run(() => api.update(inquiryId, { project_name: next }), "renamed");
          }}
        />
      </label>
      {/* the steps move on their own with the production days */}
      <div className="studio-prod-steps-wrap">
        <ol className="studio-prod-steps" aria-label="where this production is">
          {PRODUCTION_STATUSES.map((step, index) => {
            const at = PRODUCTION_STATUSES.findIndex((item) => item.id === view.status);
            return (
              <li
                key={step.id}
                aria-current={view.status === step.id ? "step" : undefined}
                className={cn(view.status === step.id && "is-on", index < at && "is-past")}
              >
                {view.status === step.id ? (
                  <i className="studio-pill-dot" aria-hidden="true" />
                ) : null}
                {step.label}
              </li>
            );
          })}
        </ol>
        <p className="studio-prod-note">{phaseNext(view.schedule, view.status)}</p>
      </div>
      <div className="studio-prod-crew">
        <span className="studio-prod-label">on it</span>
        {/* the same bubbles as the productions list; tap one to take that person off */}
        <span className="studio-row-faces is-crew">
          {onIt.map((person) => (
            <button
              key={person.id}
              type="button"
              data-name={
                person.active ? firstName(person.name) : `${firstName(person.name)} · inactive`
              }
              className={cn(!person.active && "is-off", leaving === person.id && "is-picked")}
              aria-label={`${firstName(person.name)}: take off this production`}
              onClick={() => setLeaving((current) => (current === person.id ? null : person.id))}
            >
              {firstName(person.name).charAt(0).toLowerCase()}
            </button>
          ))}
          <Popover open={adding} onOpenChange={setAdding}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="studio-row-faces-add"
                aria-label="add someone to this production"
                data-name="add someone"
              >
                <Plus aria-hidden="true" strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="studio-prod-pop">
              {addable.length ? (
                addable.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={async () => {
                      setAdding(false);
                      await change.run(
                        () => api.addPerson(inquiryId, person.id),
                        `${firstName(person.name)} is on it. they'll hear when you share with the team.`,
                      );
                    }}
                  >
                    {firstName(person.name)}
                  </button>
                ))
              ) : (
                <p>everyone active is on it. invite or activate people in library → gang.</p>
              )}
            </PopoverContent>
          </Popover>
        </span>
        {leavingPerson ? (
          <span className="studio-prod-leave">
            take {firstName(leavingPerson.name)} off
            {taskCount(leavingPerson.id)
              ? ` and ${taskCount(leavingPerson.id) === 1 ? "their task" : `their ${taskCount(leavingPerson.id)} tasks`}`
              : ""}
            ?
            <button
              type="button"
              className="studio-ghost is-danger"
              disabled={change.busy}
              onClick={async () => {
                await change.run(
                  () => api.removePerson(inquiryId, leavingPerson.id),
                  `${firstName(leavingPerson.name)} is off this production`,
                );
                setLeaving(null);
              }}
            >
              take off
            </button>
            <button type="button" className="studio-ghost" onClick={() => setLeaving(null)}>
              keep
            </button>
          </span>
        ) : null}
      </div>
      <ProductionShare view={view} api={api} onChanged={onChanged} />
    </section>
  );
}

function EventOverview({ view, mode, api, onChanged }: BoardProps) {
  const studio = mode === "studio";
  const change = useChange(onChanged);
  const inquiryId = view.production.inquiry_id;
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <ProdSection
      icon={<MapPin aria-hidden="true" strokeWidth={1.5} />}
      title="event overview"
      id="overview"
    >
      <dl className="studio-prod-facts-list">
        <div>
          <dt>venue</dt>
          <dd>
            {view.event.venueName ? <b>{view.event.venueName}</b> : <b>venue tbd</b>}
            {view.event.venueAddress || view.event.venueName ? (
              <PlaceLink
                place={view.event.venueAddress || view.event.venueName}
                className="studio-prod-place"
              >
                <MapPin aria-hidden="true" strokeWidth={1.5} />
                {view.event.venueAddress && view.event.venueAddress !== view.event.venueName
                  ? view.event.venueAddress
                  : "open in maps"}
              </PlaceLink>
            ) : null}
            {view.event.loadIn ? (
              <span className="is-note">load-in: {view.event.loadIn}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>studio</dt>
          <dd>
            {studio ? (
              <span className="studio-prod-address">
                <SaveOnBlur
                  label="studio address"
                  value={view.production.studio_address ?? ""}
                  placeholder="the studio's address"
                  onSave={(next) =>
                    void change.run(() => api.update(inquiryId, { studio_address: next }))
                  }
                />
                {view.production.studio_address ? (
                  <PlaceLink
                    place={view.production.studio_address}
                    className="studio-prod-icon is-round"
                  >
                    <MapPin aria-hidden="true" strokeWidth={1.5} />
                    <span className="sr-only">open the studio in maps</span>
                  </PlaceLink>
                ) : null}
              </span>
            ) : view.production.studio_address ? (
              <PlaceLink place={view.production.studio_address} className="studio-prod-place">
                <MapPin aria-hidden="true" strokeWidth={1.5} />
                {view.production.studio_address}
              </PlaceLink>
            ) : (
              <span>—</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <CalendarDays aria-hidden="true" strokeWidth={1.5} />
            production dates
          </dt>
          <dd>
            {view.days.length ? (
              <ul className="studio-prod-days">
                {view.days.map((row) =>
                  studio && editing === row.id ? (
                    <li key={row.id} className="is-editing">
                      <DayEditor
                        day={row.day}
                        hours={row.hours}
                        busy={change.busy}
                        submitLabel="save"
                        onCancel={() => setEditing(null)}
                        onSave={async (day, hours) => {
                          const saved = await change.run(() =>
                            api.saveDay({ inquiry_id: inquiryId, id: row.id, day, hours }),
                          );
                          if (saved) setEditing(null);
                        }}
                        removeNote={(() => {
                          const shifts = view.shifts.filter((shift) => shift.day === row.day);
                          const people = new Set(shifts.map((shift) => shift.profile_id)).size;
                          return shifts.length
                            ? `its ${shifts.length === 1 ? "shift" : `${shifts.length} shifts`} ${people === 1 ? "comes" : `for ${people} people come`} off the schedule too.`
                            : "";
                        })()}
                        removeLabel={productionDayLabel(row.day)}
                        onRemove={async () => {
                          await change.run(() => api.removeDay(row.id), "day removed");
                          setEditing(null);
                        }}
                      />
                    </li>
                  ) : (
                    <li key={row.id}>
                      <span className="studio-prod-day-head">
                        <b>{productionDayLabel(row.day)}</b>
                        <DayFaces view={view} day={row.day} mode={mode} />
                      </span>
                      {dayLines(row.hours).map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                      {studio ? (
                        <button
                          type="button"
                          className="studio-ghost"
                          onClick={() => setEditing(row.id)}
                        >
                          edit
                        </button>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <span className="studio-prod-muted">
                {studio ? "add each day the team works, with its hours." : "dates coming soon."}
              </span>
            )}
            {studio ? (
              <AddDay
                busy={change.busy}
                onSave={(day, hours) =>
                  change.run(() => api.saveDay({ inquiry_id: inquiryId, day, hours }))
                }
              />
            ) : null}
          </dd>
        </div>
        <div>
          <dt>
            <Shirt aria-hidden="true" strokeWidth={1.5} />
            dress code
          </dt>
          <dd>
            {studio ? (
              <SaveOnBlur
                multiline
                label="dress code"
                value={view.production.dress_code ?? ""}
                placeholder="all black for on-site production…"
                onSave={(next) =>
                  void change.run(() => api.update(inquiryId, { dress_code: next }))
                }
              />
            ) : view.production.dress_code ? (
              dayLines(view.production.dress_code).map((line) => <span key={line}>{line}</span>)
            ) : (
              <span className="studio-prod-muted">—</span>
            )}
          </dd>
        </div>
      </dl>
    </ProdSection>
  );
}

/**
 * Who's on a production day, from the schedule: the same bubbles as the productions list, each
 * saying whose it is and their hours that day.
 */
function DayFaces({
  view,
  day,
  mode,
}: {
  view: ProductionView;
  day: string;
  mode: BoardProps["mode"];
}) {
  const shifts = view.shifts
    .filter((shift) => shift.day === day)
    .sort((a, b) => a.starts.localeCompare(b.starts));
  if (!shifts.length) return null;
  const names = new Map(view.people.map((person) => [person.id, person.name]));
  const people = [...new Set(shifts.map((shift) => shift.profile_id))].map((id) => {
    const name = firstName(names.get(id) ?? "a teammate");
    const mine = mode === "team" && id === view.viewer.id;
    const spans = shifts
      .filter((shift) => shift.profile_id === id)
      .map((shift) => shiftSpan(shift.starts, shift.ends))
      .join(", ");
    return {
      id,
      initial: name.charAt(0).toLowerCase(),
      label: `${mine ? "you" : name} · ${spans}`,
      mine,
    };
  });
  return (
    <span
      className="studio-row-faces is-day"
      aria-label={`on this day: ${people.map((person) => person.label).join("; ")}`}
    >
      {people.map((person) => (
        <i key={person.id} data-name={person.label} className={cn(person.mine && "is-me")}>
          {person.initial}
        </i>
      ))}
    </span>
  );
}

/**
 * Where new production days are added: tucked away behind one button, opening into a single line
 * (the days, their hours and a note, and add), and folding away again once they're in.
 */
function AddDay({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (day: string, hours: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="studio-prod-add-day">
      {open ? (
        <DayEditor
          day={null}
          hours=""
          busy={busy}
          submitLabel="add day"
          variant="inline"
          onCancel={() => setOpen(false)}
          onSave={onSave}
          onSaved={() => setOpen(false)}
        />
      ) : (
        <button type="button" className="studio-day-tucked" onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" strokeWidth={1.5} />
          add a production day
        </button>
      )}
    </div>
  );
}

function FloralOrder({ view, mode, api, onChanged }: BoardProps) {
  const studio = mode === "studio";
  const change = useChange(onChanged);
  const inquiryId = view.production.inquiry_id;
  const [draft, setDraft] = useState({ kind: "", name: "", quantity: "1" });

  function save(item: ProductionItemRow, patch: Partial<ProductionItemRow>) {
    const next = { ...item, ...patch };
    void change.run(() =>
      api.saveItem({
        inquiry_id: inquiryId,
        id: item.id,
        kind: next.kind,
        name: next.name,
        quantity: Number(next.quantity) || 0,
        status: next.status,
      }),
    );
  }

  // anyone on the production moves a line along; the line remembers who did, and when
  function setStatus(item: ProductionItemRow, status: ProductionItemRow["status"]) {
    void change.run(() => api.setItemStatus(item.id, status));
  }

  async function add() {
    if (!draft.name.trim()) return;
    const saved = await change.run(() =>
      api.saveItem({
        inquiry_id: inquiryId,
        kind: draft.kind.trim(),
        name: draft.name.trim(),
        quantity: Number(draft.quantity) || 1,
        status: "todo",
      }),
    );
    if (saved) setDraft({ kind: draft.kind, name: "", quantity: "1" });
  }

  return (
    <ProdSection
      icon={<ClipboardList aria-hidden="true" strokeWidth={1.5} />}
      title="floral order"
      id="order"
    >
      <datalist id="studio-prod-kinds">
        {ITEM_KINDS.map((kind) => (
          <option key={kind} value={kind} />
        ))}
      </datalist>
      {view.items.length ? (
        <div className="studio-prod-table" role="table" aria-label="floral order">
          <div className="studio-prod-tr is-head" role="row">
            <span role="columnheader">type</span>
            <span role="columnheader">name</span>
            <span role="columnheader" className="is-qty">
              qty.
            </span>
            <span role="columnheader">status</span>
          </div>
          {/* seven rows in view; the rest scroll inside */}
          <div className="studio-prod-scroll" role="rowgroup">
            {view.items.map((item) => (
              <div key={item.id} className="studio-prod-tr" role="row">
                {studio ? (
                  <>
                    <span role="cell">
                      <SaveOnBlur
                        label="type"
                        value={item.kind}
                        className="is-kind"
                        placeholder="type"
                        onSave={(kind) => save(item, { kind })}
                      />
                    </span>
                    <span role="cell">
                      <SaveOnBlur
                        label="name"
                        value={item.name}
                        onSave={(name) => (name ? save(item, { name }) : undefined)}
                      />
                    </span>
                    <span role="cell">
                      <QtyStepper
                        label="quantity"
                        value={Number(item.quantity)}
                        onCommit={(quantity) => save(item, { quantity: quantity ?? 0 })}
                      />
                    </span>
                    <span role="cell" className="studio-prod-cell-go">
                      <StatusBy item={item} view={view} />
                      <ItemStatus
                        value={item.status}
                        onPick={(status) => setStatus(item, status)}
                      />
                      <ConfirmRemove
                        question={`remove ${item.name}?`}
                        detail={
                          view.stems.some((stem) => stem.item_id === item.id)
                            ? "its recipe stems stay, without a piece."
                            : undefined
                        }
                        disabled={change.busy}
                        onConfirm={() => change.run(() => api.removeItem(item.id))}
                      >
                        <button
                          type="button"
                          className="studio-prod-x"
                          aria-label={`remove ${item.name}`}
                        >
                          <X aria-hidden="true" strokeWidth={1.5} />
                        </button>
                      </ConfirmRemove>
                    </span>
                  </>
                ) : (
                  <>
                    <span role="cell">
                      {item.kind ? <span className="studio-prod-kind">{item.kind}</span> : null}
                    </span>
                    <span role="cell">{item.name}</span>
                    <span role="cell" className="is-qty">
                      {Number(item.quantity)}
                    </span>
                    <span role="cell" className="studio-prod-status-cell">
                      <StatusBy item={item} view={view} />
                      <ItemStatus
                        value={item.status}
                        onPick={(status) => setStatus(item, status)}
                      />
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="studio-prod-muted">
          the order fills in from the proposal's line items. add or change any piece below.
        </p>
      )}
      {studio ? (
        <div className="studio-prod-tr is-add">
          <input
            className="studio-prod-input is-kind"
            list="studio-prod-kinds"
            value={draft.kind}
            placeholder="type"
            aria-label="new item type"
            onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
          />
          <input
            className="studio-prod-input"
            value={draft.name}
            placeholder="what it is…"
            aria-label="new item name"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
          />
          <QtyStepper
            label="new item quantity"
            value={draft.quantity ? Number(draft.quantity) : null}
            min={1}
            className="is-fresh"
            onCommit={(quantity) => setDraft({ ...draft, quantity: String(quantity ?? 1) })}
          />
          <button
            type="button"
            className="studio-today-go is-pearl"
            disabled={!draft.name.trim() || change.busy}
            onClick={() => void add()}
          >
            add
          </button>
        </div>
      ) : null}
    </ProdSection>
  );
}

/** who last moved a line along: their bubble, with their name and when on hover */
function StatusBy({ item, view }: { item: ProductionItemRow; view: ProductionView }) {
  if (!item.status_by) return null;
  const person = view.people.find((row) => row.id === item.status_by);
  const name = person ? firstName(person.name) : "the studio";
  const when = item.status_at ? taskWhen(item.status_at) : "";
  const label = `${name} updated this${when ? ` · ${when}` : ""}`;
  return (
    <span className="studio-row-faces is-status" aria-label={label}>
      <i data-name={label}>{name.charAt(0).toLowerCase()}</i>
    </span>
  );
}

function ItemStatus({
  value,
  onPick,
}: {
  value: ProductionItemRow["status"];
  onPick: (status: ProductionItemRow["status"]) => void;
}) {
  // a tap moves it along: to do, in progress, done, then back to to do
  const order = ITEM_STATUSES.map((status) => status.id);
  const next = order[(order.indexOf(value) + 1) % order.length]!;
  return (
    <button
      type="button"
      className={cn("studio-prod-item-status", `is-${value}`)}
      title={`mark ${ITEM_STATUSES.find((status) => status.id === next)?.label}`}
      onClick={() => onPick(next)}
    >
      {ITEM_STATUSES.find((status) => status.id === value)?.label}
    </button>
  );
}

function Logistics({ view, mode, api, onChanged }: BoardProps) {
  const studio = mode === "studio";
  const change = useChange(onChanged);
  const [over, setOver] = useState(false);
  // the team opens files in the studio's own viewer, never as a download
  const [viewing, setViewing] = useState<(typeof view.files)[number] | null>(null);
  const files = view.files.filter((file) => file.kind === "logistics");

  async function add(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      await change.run(
        () => api.addFile(view.production.inquiry_id, file, "logistics"),
        `${file.name} added`,
      );
    }
  }

  return (
    <ProdSection
      icon={<Paperclip aria-hidden="true" strokeWidth={1.5} />}
      title="logistics"
      id="logistics"
    >
      {files.map((file) => (
        <div key={file.id} className="studio-ledger-row studio-file-row">
          {studio && file.href ? (
            <a href={file.href} target="_blank" rel="noreferrer" className="studio-file-open">
              <b>{file.name}</b>
            </a>
          ) : !studio && viewable(file) ? (
            <button type="button" className="studio-file-open" onClick={() => setViewing(file)}>
              <b>{file.name}</b>
            </button>
          ) : (
            <span className="studio-file-open is-closed" title="ask the studio for this one">
              <b>{file.name}</b>
            </span>
          )}
          {studio ? (
            <ConfirmRemove
              question={`remove ${file.name}?`}
              detail="the team won't see it anymore."
              disabled={change.busy}
              onConfirm={() => change.run(() => api.removeFile(file.id), "file removed")}
            >
              <button
                type="button"
                className="studio-file-remove"
                aria-label={`remove ${file.name}`}
                title="remove"
              >
                <X aria-hidden="true" strokeWidth={1.5} />
              </button>
            </ConfirmRemove>
          ) : null}
        </div>
      ))}
      {studio ? (
        <label
          className={cn("studio-file-drop", over && "is-over")}
          onDragEnter={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            void add(event.dataTransfer.files);
          }}
        >
          <Upload aria-hidden="true" strokeWidth={1.5} />
          <b>{over ? "drop it here" : "load-in instructions, floor plans, layouts"}</b>
          {over ? null : <small>drop files or browse</small>}
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              const list = event.target.files;
              if (list) void add(Array.from(list));
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
      <ProtectedFile file={viewing} onClose={() => setViewing(null)} />
    </ProdSection>
  );
}
