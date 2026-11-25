import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { InquiryDatePicker, InquiryTimePicker } from "@/components/inquiry/InquiryDatePicker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EventType } from "@/integrations/supabase/types";
import { EVENT_LABEL } from "@/lib/os/inquiry-desk";
import { PRODUCTION_TIMES, writeDayWindows } from "@/lib/os/production";
import { useProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

const OFFERINGS = Object.entries(EVENT_LABEL) as Array<[EventType, string]>;

/**
 * Adding a production by hand, for work that didn't come in as an inquiry: what it's called, the
 * client it's for, what kind of work it is, when, and whether it needs a team and a schedule. It
 * opens in edit once it's made.
 */
export function AddProduction() {
  const api = useProductionApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [offering, setOffering] = useState<EventType | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [team, setTeam] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const clients = useQuery({
    queryKey: ["os", "production-clients"],
    queryFn: () => api.clients(),
    enabled: open,
  });

  const all = clients.data?.clients ?? [];
  const chosen = all.find((client) => client.id === clientId) ?? null;
  const term = search.trim().toLowerCase();
  // the book stays out of sight until a name is typed
  const matches = term
    ? all
        .filter((client) =>
          `${client.name} ${client.organization ?? ""} ${client.email}`
            .toLowerCase()
            .includes(term),
        )
        .slice(0, 6)
    : [];
  const clientReady = newClient
    ? Boolean(clientName.trim() && /\S+@\S+\.\S+/.test(clientEmail))
    : Boolean(clientId);
  const ready = Boolean(name.trim() && clientReady && offering);
  const missing = { name: !name.trim(), client: !clientReady, offering: !offering };

  function reset() {
    setName("");
    setSearch("");
    setClientId(null);
    setNewClient(false);
    setClientName("");
    setClientEmail("");
    setOffering(null);
    setDay(null);
    setStarts("");
    setEnds("");
    setTeam(true);
    setTried(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !offering) {
      setTried(true);
      return;
    }
    setBusy(true);
    try {
      const hours = writeDayWindows([{ start: starts, end: ends, note: "" }]);
      const made = await api.createManual({
        project_name: name.trim(),
        event_type: offering,
        event_date: day,
        has_team: team,
        ...(day && hours ? { hours } : {}),
        ...(newClient
          ? { new_client: { name: clientName.trim(), email: clientEmail.trim() } }
          : { client_id: clientId! }),
      });
      setOpen(false);
      reset();
      await router.navigate({ to: "/production/$slug", params: { slug: made.slug } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "it wasn't made. try again.");
    } finally {
      setBusy(false);
    }
  }

  // it starts the way add inquiry does: typing what it's called, as the title
  const nameField = (
    <label className={cn("studio-task-composer-title", tried && missing.name && "is-missing")}>
      <span className="sr-only">what it's called</span>
      <input
        autoFocus
        value={name}
        maxLength={120}
        placeholder="what it's called…"
        onChange={(event) => setName(event.target.value)}
      />
    </label>
  );

  const clientField = (
    <div
      className={cn("studio-shift-field", tried && missing.client && "is-missing")}
      role="group"
      aria-label="client"
    >
      <span className="studio-ask-label studio-shift-who-label">
        the client
        <button
          type="button"
          className="studio-shift-who-add"
          onClick={() => {
            setNewClient((value) => !value);
            setClientId(null);
          }}
        >
          {newClient ? "find them in the book instead" : "someone new? add them"}
        </button>
      </span>
      {newClient ? (
        <div className="studio-shift-times">
          <input
            value={clientName}
            maxLength={120}
            placeholder="their name"
            aria-label="the client's name"
            onChange={(event) => setClientName(event.target.value)}
          />
          <input
            type="email"
            value={clientEmail}
            maxLength={320}
            placeholder="name@example.com"
            aria-label="the client's email"
            onChange={(event) => setClientEmail(event.target.value)}
          />
        </div>
      ) : chosen ? (
        <div className="studio-shift-picks">
          <button
            type="button"
            className="studio-shift-pick is-on"
            onClick={() => {
              setClientId(null);
              setSearch("");
            }}
            title="choose someone else"
          >
            <i aria-hidden="true">{chosen.name.charAt(0).toLowerCase()}</i>
            {chosen.name}
            <X aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <>
          <input
            value={search}
            placeholder="find a client…"
            aria-label="find a client"
            onChange={(event) => setSearch(event.target.value)}
          />
          {term ? (
            <div className="studio-shift-picks">
              {matches.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="studio-shift-pick"
                  onClick={() => setClientId(client.id)}
                >
                  <i aria-hidden="true">{client.name.charAt(0).toLowerCase()}</i>
                  {client.name}
                </button>
              ))}
              {!matches.length ? (
                <span className="studio-add-quiet-line">
                  no one by that name.{" "}
                  <button
                    type="button"
                    className="studio-shift-who-add"
                    onClick={() => {
                      setNewClient(true);
                      setClientName(search.trim());
                    }}
                  >
                    add them
                  </button>
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const kindField = (
    <div
      className={cn("studio-shift-field", tried && missing.offering && "is-missing")}
      role="group"
      aria-label="what kind of work"
    >
      <span className="studio-ask-label">what kind of work</span>
      <div className="studio-shift-picks">
        {OFFERINGS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={offering === value}
            className={cn("studio-shift-pick", offering === value && "is-on")}
            onClick={() => setOffering(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  // the date, and its hours to the right: the same pickers as the production's own days
  const whenField = (
    <div className="studio-shift-field">
      <span className="studio-ask-label">the date</span>
      <div className="studio-add-production-when">
        <InquiryDatePicker
          value={day}
          withTime={false}
          allowPast
          compact
          placeholder="pick the day"
          onChange={setDay}
        />
        <span className="studio-add-production-hours">
          <InquiryTimePicker
            value={starts}
            times={PRODUCTION_TIMES}
            compact
            placeholder="starts"
            onChange={setStarts}
          />
          <span className="studio-day-dash" aria-hidden="true">
            –
          </span>
          <InquiryTimePicker
            value={ends}
            times={PRODUCTION_TIMES}
            compact
            placeholder="ends"
            onChange={setEnds}
          />
        </span>
      </div>
    </div>
  );

  const teamField = (
    <div className="studio-shift-field" role="group" aria-label="team">
      <span className="studio-ask-label">the team</span>
      <div className="studio-add-production-team">
        <button
          type="button"
          aria-pressed={team}
          className={cn("studio-add-production-card", team && "is-on")}
          onClick={() => setTeam(true)}
        >
          <b>with the gang</b>
          <small>a crew, a schedule, and sharing it with them</small>
        </button>
        <button
          type="button"
          aria-pressed={!team}
          className={cn("studio-add-production-card", !team && "is-on")}
          onClick={() => setTeam(false)}
        >
          <b>just the studio</b>
          <small>a smaller engagement, no crew or schedule. add a team any time</small>
        </button>
      </div>
    </div>
  );

  const foot = (
    <div className="studio-shift-foot">
      <p className={cn("studio-shift-sum", tried && !ready && "is-missing")}>
        {tried && !ready
          ? `still to pick: ${[
              missing.name ? "what it's called" : "",
              missing.client ? "the client" : "",
              missing.offering ? "the kind of work" : "",
            ]
              .filter(Boolean)
              .join(", ")}`
          : ""}
      </p>
      <span className="studio-shift-go">
        <button type="submit" className="studio-today-go" disabled={busy}>
          <Plus aria-hidden="true" strokeWidth={1.5} />
          {busy ? "making it…" : "create production"}
        </button>
      </span>
    </div>
  );

  return (
    <>
      <button type="button" className="studio-today-go" onClick={() => setOpen(true)}>
        add production
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask studio-shift-modal studio-add-production"
          hideClose
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">add a production</DialogTitle>
          <DialogDescription className="sr-only">
            a production for work that didn't come in as an inquiry.
          </DialogDescription>
          <form className="studio-task-form studio-shift-form" onSubmit={(e) => void submit(e)}>
            {nameField}
            {clientField}
            {kindField}
            {whenField}
            {teamField}
            {foot}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
