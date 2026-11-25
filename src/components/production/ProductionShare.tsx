import { Send, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { BoardProps } from "@/components/production/parts";
import { useChange } from "@/components/production/use-change";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { firstName, hoursLabel, shiftHours, taskWhen } from "@/lib/os/production";
import { cn } from "@/lib/utils";

/**
 * Sharing a production with the team, everyone at once, once the studio is done editing. Nothing
 * reaches the team before: the production isn't theirs to see. Members already in the studio find it
 * on their today and their bell, with no email; anyone added and not in the studio yet gets their
 * invitation, the one email the team gets, to create their account.
 */
export function ProductionShare({
  view,
  api,
  onChanged,
  variant = "bar",
}: Omit<BoardProps, "mode"> & {
  /** the status bar under the header, or the share button beside "copy link" */
  variant?: "bar" | "button";
}) {
  const change = useChange(onChanged);
  const [open, setOpen] = useState(false);
  const sharedAt = view.production.shared_at ?? null;
  const people = view.unshared.flatMap((id) => {
    const person = view.people.find((item) => item.id === id);
    return person ? [person] : [];
  });
  const reaching = people.filter((person) => person.active);
  const inviting = reaching.filter((person) => person.standing !== "joined");

  const line = (id: string, standing: string, active: boolean) => {
    if (!active) return "turned off · they hear once you turn them back on in the gang";
    const shifts = view.shifts.filter((shift) => shift.profile_id === id);
    const hours = shifts.reduce((sum, shift) => sum + shiftHours(shift.starts, shift.ends), 0);
    const tasks = view.tasks.filter((task) => task.people.includes(id)).length;
    const what = [
      shifts.length
        ? `${shifts.length} ${shifts.length === 1 ? "shift" : "shifts"}, ${hoursLabel(hours)}`
        : "",
      tasks ? `${tasks} ${tasks === 1 ? "task" : "tasks"}` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const kind =
      standing !== "joined"
        ? "an invitation to create their account"
        : view.told.includes(id)
          ? "their changed schedule, in the app"
          : "their schedule, in the app";
    return `${kind}${what ? ` · ${what}` : " · on the team, nothing scheduled yet"}`;
  };

  async function share() {
    const result = await change.run(() => api.share(view.production.inquiry_id));
    if (!result) return;
    setOpen(false);
    toast.success(
      api.preview
        ? "shared. the preview sends no email; members see it on their bell."
        : result.invited
          ? `shared. ${result.invited} ${result.invited === 1 ? "invitation is" : "invitations are"} on the way; everyone else sees it in the app.`
          : "shared. the team sees it on their today.",
    );
  }

  const trigger =
    variant === "button" ? (
      // beside "copy link": share it with the team, officially, and invite anyone not in yet
      <button
        type="button"
        className="studio-prod-icon studio-share-button"
        disabled={!reaching.length}
        title={
          reaching.length
            ? sharedAt
              ? "share the updates with the team"
              : "share it with the team, and invite anyone not in the studio yet"
            : "everyone has their schedule"
        }
        onClick={() => setOpen(true)}
      >
        <Send aria-hidden="true" strokeWidth={1.5} />
        <span>{sharedAt && reaching.length ? "share updates" : "share with gang"}</span>
      </button>
    ) : (
      // just when it was last shared, for sukii's reference
      <p className="studio-share-when">
        {sharedAt ? `shared ${taskWhen(sharedAt)}` : "not shared yet"}
      </p>
    );

  const Wrap = variant === "button" ? "span" : "div";
  return (
    <Wrap
      className={cn(
        variant === "button" ? "studio-share-slot" : "studio-share-line",
        reaching.length && "is-waiting",
        sharedAt && "is-shared",
      )}
    >
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
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
            {sharedAt ? "share the updates" : "share with gang"}
          </DialogTitle>
          <DialogDescription className="studio-share-lede">
            {sharedAt
              ? "the updates reach everyone in the app, on their bell and their today. no email goes out"
              : "everyone finds their schedule on their today in the app. no schedule email goes out"}
            {inviting.length
              ? `. ${inviting.map((person) => firstName(person.name)).join(", ")} ${inviting.length === 1 ? "isn't" : "aren't"} in the studio yet, so ${inviting.length === 1 ? "they get an invitation" : "they each get an invitation"} to create ${inviting.length === 1 ? "their account" : "their accounts"}`
              : ""}
            .
          </DialogDescription>
          <ul className="studio-share-list">
            {people.map((person) => (
              <li key={person.id} className={cn(!person.active && "is-off")}>
                <i aria-hidden="true">{firstName(person.name).charAt(0).toLowerCase()}</i>
                <span>
                  <b>{firstName(person.name)}</b>
                  <small>{line(person.id, person.standing, person.active)}</small>
                </span>
              </li>
            ))}
          </ul>
          <div className="studio-shift-foot">
            <p className="studio-shift-sum is-quiet">
              {sharedAt ? "everyone else already has theirs." : "after this, the team can open it."}
            </p>
            <span className="studio-shift-go">
              <button type="button" className="studio-ghost" onClick={() => setOpen(false)}>
                not yet
              </button>
              <button
                type="button"
                className="studio-today-go"
                disabled={change.busy || !reaching.length}
                onClick={() => void share()}
              >
                {change.busy
                  ? "sharing…"
                  : `share with ${reaching.length} ${reaching.length === 1 ? "person" : "people"}`}
              </button>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </Wrap>
  );
}
