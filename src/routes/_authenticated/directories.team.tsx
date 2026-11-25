import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { toast } from "sonner";

import { AddPersonForm, type AddPersonValues } from "@/components/portal/AddPersonForm";
import { DirectoryHome, DirectorySearch } from "@/components/portal/DirectoryHome";
import { BloomWait } from "@/components/portal/StudioLoader";
import { PersonName } from "@/components/studio/PersonName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppRole } from "@/integrations/supabase/types";
import { productionDateRange } from "@/lib/os/production";
import { useProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/directories/team")({
  head: () => ({
    meta: [{ title: "Team — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: TeamDirectoryPage,
});

function seen(value: string | null) {
  if (!value) return "hasn't signed in yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `last in ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase()}`;
}

function TeamDirectoryPage() {
  const { profile } = Route.useRouteContext();
  const api = useProductionApi();
  const queryClient = useQueryClient();
  const key = ["os", "team-directory"];
  const team = useQuery({
    queryKey: key,
    queryFn: () => api.team(),
    enabled: profile.role === "admin",
  });
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("team");
  const [busy, setBusy] = useState<string | null>(null);
  // the person open to edit: their name, email until they're invited, access, and pay
  const [editing, setEditing] = useState<{
    id: string;
    emailLocked: boolean;
    standing: string;
    values: AddPersonValues;
  } | null>(null);
  // turning someone off and taking back an invitation both ask first
  const [confirming, setConfirming] = useState<string | null>(null);

  if (profile.role !== "admin") {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">the gang is for the admins sukii gives it to.</p>
      </div>
    );
  }

  async function act(id: string, work: () => Promise<unknown>, done: string) {
    setBusy(id);
    try {
      await work();
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "that didn't go through. try again.");
    } finally {
      setBusy(null);
    }
  }

  // adding someone sends nothing: they're invited when a production they're on is shared
  async function invite(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    const given = name.trim();
    if (!address || !given) return;
    await act(
      "invite",
      () => api.add(address, given, role),
      `${given.split(/\s+/)[0]} is in the gang. put them on a production; they're invited when you share it.`,
    );
    setInviting(false);
    setName("");
    setEmail("");
    setRole("team");
  }

  const term = search.trim().toLowerCase();
  // the founder sets roles and access; pay shows to those who handle it
  const owner = Boolean(team.data?.owner);
  const canPay = Boolean(team.data?.canPay);
  const members = (team.data?.members ?? []).filter(
    (member) => !term || `${member.full_name ?? ""} ${member.email}`.toLowerCase().includes(term),
  );
  const pendingAll = (team.data?.invites ?? []).filter(
    (invite) => !term || `${invite.name ?? ""} ${invite.email}`.toLowerCase().includes(term),
  );
  // added and not invited yet: scheduled first, invited when a production they're on is shared
  const added = pendingAll.filter((invite) => !invite.invited_at);
  const invites = pendingAll.filter((invite) => invite.invited_at);
  const active = members.filter((member) => member.active);
  const inactive = members.filter((member) => !member.active);

  function openEdit(person: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
    emailLocked: boolean;
    standing: string;
    access?: string[];
  }) {
    setEditing({
      id: person.id,
      emailLocked: person.emailLocked,
      standing: person.standing,
      values: {
        name: person.name,
        email: person.email,
        role: person.role,
        ...(person.access ? { access: person.access } : {}),
      },
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const { values } = editing;
    setBusy("edit");
    try {
      await api.updateMember({
        id: editing.id,
        name: values.name.trim(),
        ...(editing.emailLocked ? {} : { email: values.email.trim() }),
        role: values.role,
        // what an admin can open is the founder's to set
        ...(owner && values.role === "admin" && values.access ? { access: values.access } : {}),
      });
      toast.success(`${values.name.trim().split(/\s+/)[0]} is saved`);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "that didn't save. try again.");
    } finally {
      setBusy(null);
    }
  }

  const memberRow = (member: (typeof members)[number]) => {
    const isMe = member.id === team.data?.me;
    // the founder isn't edited from here; nor is anyone their own row
    const locked = isMe || (member.is_owner && !owner);
    return (
      <div
        key={member.id}
        className={cn("studio-team-row", !member.active && "is-off", !locked && "is-open")}
        {...(locked
          ? {}
          : rowOpens(() =>
              openEdit({
                id: member.id,
                name: member.full_name ?? "",
                email: member.email,
                role: member.role,
                emailLocked: true,
                standing: seen(member.last_seen_at),
                access: member.access ?? [],
              }),
            ))}
      >
        <span className="studio-team-who">
          <b>{member.full_name ? <PersonName name={member.full_name} /> : member.email}</b>
          {/* the founder is just her name and email; everyone else, when they were last in */}
          <em>
            {member.email}
            {member.is_owner ? "" : ` · ${seen(member.last_seen_at)}`}
          </em>
          {member.events.length ? (
            <span className="studio-team-events">
              {member.events.map((event) => (
                <Link
                  key={event.path}
                  to="/production/$slug"
                  params={{ slug: event.path.split("/").pop() ?? "" }}
                  className="studio-prod-person"
                >
                  {event.project_name}
                  {event.first ? ` · ${productionDateRange(event.first, null)}` : ""}
                </Link>
              ))}
            </span>
          ) : null}
        </span>
        <span className="studio-team-go">
          <span className="studio-team-role">
            {member.is_owner ? "founder" : member.role === "admin" ? "admin" : "gang"}
          </span>
          {isMe ? (
            <span className="studio-team-role">you</span>
          ) : member.is_owner ? null : (
            <button
              type="button"
              className={cn("studio-team-switch", member.active && "is-on")}
              role="switch"
              aria-checked={member.active}
              aria-label={`${member.active ? "deactivate" : "activate"} ${member.full_name ?? member.email}`}
              disabled={busy === member.id}
              onClick={() => {
                if (member.active) {
                  setConfirming(member.id);
                  return;
                }
                void act(
                  member.id,
                  () => api.setActive(member.id, true),
                  `${member.full_name ?? member.email} can sign in again`,
                );
              }}
            >
              <i aria-hidden="true" />
              {member.active ? "active" : "inactive"}
            </button>
          )}
        </span>
        {confirming === member.id ? (
          <Confirm
            busy={busy === member.id}
            line={`turn off ${member.full_name?.split(" ")[0] ?? member.email}? they can't sign in or open productions until you turn them back on.`}
            yes="turn off"
            onYes={async () => {
              await act(
                member.id,
                () => api.setActive(member.id, false),
                `${member.full_name ?? member.email} can't sign in now`,
              );
              setConfirming(null);
            }}
            onNo={() => setConfirming(null)}
          />
        ) : null}
      </div>
    );
  };

  return (
    <DirectoryHome
      title="gang"
      back={{ to: "/library", label: "library" }}
      action={
        <button type="button" className="studio-today-go" onClick={() => setInviting(true)}>
          add someone
        </button>
      }
    >
      <DirectorySearch
        label="find someone"
        value={search}
        placeholder="find someone…"
        onChange={setSearch}
      />
      {team.isPending ? <BloomWait label="opening the gang" compact /> : null}
      {team.isError ? (
        <p className="studio-pearl-note">the gang didn't open. try again in a moment.</p>
      ) : null}

      {active.length ? (
        <section className="studio-team-group">
          <p className="studio-home-label">active</p>
          <div className="studio-directory">{active.map(memberRow)}</div>
        </section>
      ) : null}

      {added.length ? (
        <section className="studio-team-group">
          <p className="studio-home-label">not invited yet</p>
          <div className="studio-directory">
            {added.map((person) => (
              <div
                key={person.id}
                className="studio-team-row is-open"
                {...rowOpens(() =>
                  openEdit({
                    id: person.id,
                    name: person.name ?? "",
                    email: person.email,
                    role: person.role,
                    emailLocked: false,
                    standing: "not invited yet",
                  }),
                )}
              >
                <span className="studio-team-who">
                  <b>{person.name ?? person.email}</b>
                  <em>
                    {person.name ? `${person.email} · ` : ""}
                    {person.on.length
                      ? `invited when ${person.on.length === 1 ? "this is" : "these are"} shared`
                      : "put them on a production to schedule them"}
                  </em>
                  {person.on.length ? (
                    <span className="studio-team-events">
                      {person.on.map((project) => (
                        <span key={project} className="studio-prod-person">
                          {project}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="studio-team-go">
                  <span className="studio-team-role">
                    {person.role === "admin" ? "admin" : "gang"}
                  </span>
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={busy === person.id}
                    onClick={() =>
                      void act(
                        person.id,
                        () => api.invite(person.email, person.role),
                        api.preview
                          ? "invitation noted (the preview sends no email)"
                          : `invitation sent to ${person.email}`,
                      )
                    }
                  >
                    invite now
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={busy === person.id}
                    onClick={() => setConfirming(person.id)}
                  >
                    remove
                  </button>
                </span>
                {confirming === person.id ? (
                  <Confirm
                    busy={busy === person.id}
                    line={`remove ${person.name ?? person.email} from the gang?${person.on.length ? " they come off the schedule too." : ""}`}
                    yes="remove"
                    onYes={async () => {
                      await act(person.id, () => api.cancelInvite(person.id), "removed");
                      setConfirming(null);
                    }}
                    onNo={() => setConfirming(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {invites.length ? (
        <section className="studio-team-group">
          <p className="studio-home-label">invited</p>
          <div className="studio-directory">
            {invites.map((pending) => (
              <div
                key={pending.id}
                className="studio-team-row is-open"
                {...rowOpens(() =>
                  openEdit({
                    id: pending.id,
                    name: pending.name ?? "",
                    email: pending.email,
                    role: pending.role,
                    emailLocked: true,
                    standing: "invited, hasn't joined yet",
                  }),
                )}
              >
                <span className="studio-team-who">
                  <b>{pending.name ?? pending.email}</b>
                  <em>
                    {pending.name ? `${pending.email} · ` : ""}
                    {invitedLine(pending.expires_at, pending.invited_at ?? pending.created_at)}
                  </em>
                </span>
                <span className="studio-team-go">
                  <span className="studio-team-role">
                    {pending.role === "admin" ? "admin" : "gang"}
                  </span>
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={busy === pending.id}
                    onClick={() =>
                      void act(
                        pending.id,
                        () => api.invite(pending.email, pending.role),
                        "sent again",
                      )
                    }
                  >
                    send again
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={busy === pending.id}
                    onClick={() => setConfirming(pending.id)}
                  >
                    take back
                  </button>
                </span>
                {confirming === pending.id ? (
                  <Confirm
                    busy={busy === pending.id}
                    line={`take back the invitation to ${pending.name ?? pending.email}? the link in their email stops working.`}
                    yes="take back"
                    onYes={async () => {
                      await act(
                        pending.id,
                        () => api.cancelInvite(pending.id),
                        "invitation taken back",
                      );
                      setConfirming(null);
                    }}
                    onNo={() => setConfirming(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {inactive.length ? (
        <section className="studio-team-group">
          <p className="studio-home-label">inactive</p>
          <div className="studio-directory">{inactive.map(memberRow)}</div>
        </section>
      ) : null}

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask is-wide studio-shift-modal studio-add-modal"
          hideClose
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <AddPersonForm
            canSetRole={owner}
            name={name}
            email={email}
            role={owner ? role : "team"}
            busy={busy === "invite"}
            onChange={(next) => {
              if (next.name !== undefined) setName(next.name);
              if (next.email !== undefined) setEmail(next.email);
              if (next.role !== undefined) setRole(next.role);
            }}
            onSubmit={(event) => void invite(event)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask is-wide studio-shift-modal studio-add-modal"
          hideClose
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          {editing ? (
            <AddPersonForm
              mode="edit"
              canSetRole={owner}
              emailLocked={editing.emailLocked}
              standing={editing.standing}
              {...editing.values}
              busy={busy === "edit"}
              onChange={(next) =>
                setEditing((current) =>
                  current ? { ...current, values: { ...current.values, ...next } } : current,
                )
              }
              onSubmit={(event) => void saveEdit(event)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </DirectoryHome>
  );
}

/** a row that opens its person, by click or by keyboard, unless a button inside it was pressed */
function rowOpens(open: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest("button, a, input")) return;
      open();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    },
  };
}

/** a question under a row, before something that's hard to undo */
function Confirm({
  line,
  yes,
  busy,
  onYes,
  onNo,
}: {
  line: string;
  yes: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <p className="studio-team-confirm" role="alert">
      <span>{line}</span>
      <button type="button" className="studio-ghost is-danger" disabled={busy} onClick={onYes}>
        {yes}
      </button>
      <button type="button" className="studio-ghost" onClick={onNo}>
        keep
      </button>
    </p>
  );
}

/** where an invitation stands: sent when, and whether it's still good */
function invitedLine(expiresAt: string | null, sentAt: string) {
  const short = (value: string) =>
    new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return "the invitation ran out. send it again.";
  }
  return `hasn't joined yet · invited ${short(sentAt)}`;
}
