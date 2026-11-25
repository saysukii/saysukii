import { Check } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AppRole } from "@/integrations/supabase/types";
import { DEFAULT_ADMIN_ACCESS, STUDIO_AREAS } from "@/lib/os/access";
import { rateLabel, type RatePer } from "@/lib/os/production";
import { cn } from "@/lib/utils";

export type AddPersonValues = {
  name: string;
  email: string;
  role: AppRole;
  rate: string;
  per: RatePer;
  /** what an admin can open; the founder sets it */
  access?: string[];
};

type Props = AddPersonValues & {
  /** adding someone new, or changing someone already on the team */
  mode?: "add" | "edit";
  /** their email can't change once they've been invited */
  emailLocked?: boolean;
  /** where they stand, for the row: "last in nov 21", "not invited yet" */
  standing?: string;
  /** the founder decides roles and what each admin can open */
  canSetRole?: boolean;
  /** only those who handle pay see and set rates */
  canPay?: boolean;
  busy: boolean;
  onChange: (next: Partial<AddPersonValues>) => void;
  onSubmit: (event: FormEvent) => void;
};

const ROLE_CHOICES: Array<{ value: AppRole; label: string; note: string }> = [
  { value: "team", label: "gang", note: "only the productions they're on" },
  { value: "admin", label: "admin", note: "the parts of the studio you give them" },
];

const PAY_CHOICES: Array<{ value: RatePer; label: string; note: string }> = [
  { value: "hour", label: "hourly", note: "paid on their scheduled hours" },
  { value: "production", label: "flat rate", note: "one amount for each production" },
];

const NOTHING_SENT =
  "nothing is sent yet. put them on a production; when you share it, they get their invitation with their schedule.";

/** the rate as it'll read, once there's an amount */
function rateLine(values: AddPersonValues) {
  const dollars = Number(values.rate);
  if (!values.rate.trim() || Number.isNaN(dollars)) return "";
  return rateLabel({ cents: Math.round(dollars * 100), per: values.per });
}

/** soft pink pills, the same as the shift dialog's */
function Picks<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="studio-shift-field" role="group" aria-label={label}>
      <span className="studio-ask-label">{label}</span>
      <div className="studio-shift-picks">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={cn("studio-shift-pick", value === option.value && "is-on")}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  type = "text",
  placeholder,
  busy,
  locked = false,
  autoFocus = false,
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "email";
  placeholder: string;
  busy: boolean;
  locked?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="studio-shift-field">
      <span className="studio-ask-label">{label}</span>
      <input
        required
        type={type}
        value={value}
        maxLength={type === "email" ? 320 : 120}
        autoComplete="off"
        autoFocus={autoFocus}
        readOnly={locked}
        className={cn(locked && "is-locked")}
        disabled={busy}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Submit({
  busy,
  ready,
  children,
}: {
  busy: boolean;
  ready: boolean;
  children?: ReactNode;
}) {
  return (
    <button type="submit" className="studio-today-go" disabled={!ready || busy}>
      {busy ? "saving…" : (children ?? "add to the gang")}
    </button>
  );
}

/**
 * Adding someone to the team: the form beside the row they'll have in the directory, filling in as
 * it's typed, and what happens next. Nothing is emailed; they're invited when a production they're
 * on is shared.
 */
export function AddPersonForm({
  mode = "add",
  emailLocked = false,
  standing,
  canSetRole = true,
  canPay = true,
  busy,
  onChange,
  onSubmit,
  ...values
}: Props) {
  const ready = Boolean(values.name.trim() && values.email.trim());
  const editing = mode === "edit";
  // admins are crew too; the founder alone sets roles and access, and pay shows to those who handle it
  const paid = canPay;
  const access = values.access ?? DEFAULT_ADMIN_ACCESS;
  return (
    <>
      <DialogTitle className="studio-shift-title">
        {editing ? (
          <>
            edit <span>{values.name.trim().split(/\s+/)[0] || "them"}</span>
          </>
        ) : (
          "add someone"
        )}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {editing ? "their name, what they see, and how they're paid." : NOTHING_SENT}
      </DialogDescription>
      <form className="studio-task-form studio-add-split" onSubmit={onSubmit}>
        <div className="studio-shift-form">
          <TextInput
            label="name"
            value={values.name}
            placeholder="first and last"
            busy={busy}
            autoFocus
            onChange={(name) => onChange({ name })}
          />
          <TextInput
            label={emailLocked ? "email · theirs to sign in with" : "email"}
            type="email"
            value={values.email}
            placeholder="name@example.com"
            busy={busy}
            locked={emailLocked}
            onChange={(email) => onChange({ email })}
          />
          {canSetRole ? (
            <Picks
              label="role"
              options={ROLE_CHOICES}
              value={values.role}
              onPick={(role) => onChange({ role })}
            />
          ) : null}
          {canSetRole && values.role === "admin" ? (
            <div className="studio-shift-field" role="group" aria-label="can open">
              <span className="studio-ask-label">can open</span>
              <div className="studio-shift-picks is-line">
                {STUDIO_AREAS.map((area) => {
                  const on = access.includes(area.id);
                  return (
                    <button
                      key={area.id}
                      type="button"
                      title={area.note}
                      aria-pressed={on}
                      className={cn("studio-shift-pick", on && "is-on")}
                      onClick={() =>
                        onChange({
                          access: on ? access.filter((id) => id !== area.id) : [...access, area.id],
                        })
                      }
                    >
                      {area.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {paid ? (
            <div className="studio-shift-field" role="group" aria-label="paid">
              <span className="studio-ask-label">paid</span>
              <div className="studio-add-paid">
                <div className="studio-shift-picks">
                  {PAY_CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      aria-pressed={values.per === choice.value}
                      className={cn("studio-shift-pick", values.per === choice.value && "is-on")}
                      onClick={() => onChange({ per: choice.value })}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                <span className="studio-add-money">
                  <i aria-hidden="true">$</i>
                  <input
                    value={values.rate}
                    inputMode="decimal"
                    aria-label={values.per === "hour" ? "hourly rate" : "flat rate"}
                    placeholder={values.per === "hour" ? "25" : "300"}
                    disabled={busy}
                    onChange={(event) =>
                      onChange({ rate: event.target.value.replace(/[^\d.]/g, "") })
                    }
                  />
                  <small aria-hidden="true">{values.per === "hour" ? "/hr" : "flat"}</small>
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <aside className="studio-add-preview">
          <span className="studio-ask-label">how they'll show in the gang</span>
          <div className="studio-add-preview-row">
            <span>
              <b>{values.name.trim() || "their name"}</b>
              <em>
                {values.email.trim() || "their email"} · {standing ?? "put them on a production"}
              </em>
            </span>
            <span className="studio-add-preview-go">
              <small>{values.role === "admin" ? "admin" : "gang"}</small>
            </span>
          </div>
          {editing ? (
            paid ? (
              <p className="studio-add-private">
                their rate, {rateLine(values) || "not set yet"}, shows only here.
              </p>
            ) : null
          ) : (
            <>
              <span className="studio-ask-label">what happens next</span>
              <ol className="studio-add-next">
                <li className="is-on">
                  <i aria-hidden="true">
                    <Check strokeWidth={2} />
                  </i>
                  added to the gang, under not invited yet
                </li>
                <li>
                  <i aria-hidden="true">2</i>
                  you put them on a production and its schedule
                </li>
                <li>
                  <i aria-hidden="true">3</i>
                  you share it, and they get their invitation with their schedule
                </li>
              </ol>
            </>
          )}
          <div className="studio-shift-foot">
            <span />
            <span className="studio-shift-go">
              <Submit busy={busy} ready={ready}>
                {editing ? "save" : undefined}
              </Submit>
            </span>
          </div>
        </aside>
      </form>
    </>
  );
}
