import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { StudioChip, StudioHeading, StudioViews } from "@/components/portal/studio";
import type { ClientType } from "@/integrations/supabase/types";
import { listClients, saveClient } from "@/lib/os/clients.functions";
import { getDevPreviewClients } from "@/lib/dev-preview";
import { clientSlugs } from "@/lib/os/inquiry-desk";
import { useDevPreview } from "@/lib/use-dev-preview";

const views = [
  { id: "roll", label: "roll" },
  { id: "grid", label: "grid" },
  { id: "split", label: "split" },
] as const;

export const Route = createFileRoute("/_authenticated/clients/")({
  validateSearch: z.object({
    view: z.enum(["roll", "grid", "split"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Clients — Say Sukii OS" },
      { name: "description", content: "Client relationships and engagement history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientsPage,
});

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  type: "individual" as ClientType,
  source: "",
  notes: "",
};

function ClientsPage() {
  const { profile } = Route.useRouteContext();
  const { view } = Route.useSearch();
  const layout = view ?? "roll";
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchClients = useServerFn(listClients);
  const submitClient = useServerFn(saveClient);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: clients = [], isPending } = useQuery({
    queryKey: ["os", "clients", devPreview],
    queryFn: () => (devPreview ? getDevPreviewClients() : fetchClients()),
    enabled: isAdmin,
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      [client.name, client.email, client.organization, client.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [clients, search]);

  const slugs = useMemo(() => clientSlugs(clients), [clients]);
  const selected = visible.find((client) => client.id === selectedId) ?? visible[0];

  const createClient = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — client not saved");
        return Promise.resolve(clients[0]);
      }
      return submitClient({ data: form });
    },
    onSuccess: () => {
      toast.success("Client created");
      setCreating(false);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="studio-page">
        <StudioHeading title="clients" note="client records are available to admin users only." />
      </div>
    );
  }

  return (
    <div className="studio-page">
      <StudioHeading
        title="clients"
        note="the people and houses we keep in conversation."
        action={
          <button type="button" className="studio-today-go" onClick={() => setCreating((open) => !open)}>
            {creating ? "close" : "new client"}
          </button>
        }
      />
      <StudioViews to="/clients" views={[...views]} current={layout} />

      {creating ? (
        <form
          className="studio-panel"
          onSubmit={(event) => {
            event.preventDefault();
            createClient.mutate();
          }}
        >
          <div className="studio-tiles">
            <label className="studio-field">
              <span>name</span>
              <input
                required
                className="studio-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>email</span>
              <input
                required
                type="email"
                className="studio-input"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>organization</span>
              <input
                className="studio-input"
                value={form.organization}
                onChange={(event) => setForm({ ...form, organization: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>phone</span>
              <input
                className="studio-input"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>client type</span>
              <select
                className="studio-select"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as ClientType })}
              >
                <option value="individual">individual</option>
                <option value="brand">brand</option>
                <option value="corporate">corporate</option>
                <option value="venue_partner">venue partner</option>
              </select>
            </label>
            <label className="studio-field">
              <span>source</span>
              <input
                className="studio-input"
                value={form.source}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
              />
            </label>
          </div>
          <label className="studio-field" style={{ marginTop: 12 }}>
            <span>notes</span>
            <textarea
              className="studio-textarea"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          <button type="submit" className="studio-today-go" style={{ marginTop: 16 }} disabled={createClient.isPending}>
            {createClient.isPending ? "saving" : "create client"}
          </button>
        </form>
      ) : null}

      <label className="studio-search">
        <span className="sr-only">search clients</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search clients"
        />
      </label>

      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {!isPending && clients.length === 0 ? <p className="studio-empty">no clients yet.</p> : null}

      {layout === "roll" ? (
        <div className="studio-ledger">
          {visible.map((client) => (
            <Link key={client.id} to="/clients/$id" params={{ id: slugs.get(client.id) ?? client.id }} className="studio-ledger-row">
              <div>
                <b>{client.name}</b>
                <p>{[client.organization, client.email, client.phone].filter(Boolean).join(" · ")}</p>
              </div>
              <StudioChip>{client.type.replaceAll("_", " ")}</StudioChip>
            </Link>
          ))}
        </div>
      ) : null}

      {layout === "grid" ? (
        <div className="studio-clients-grid">
          {visible.map((client) => (
            <Link key={client.id} to="/clients/$id" params={{ id: slugs.get(client.id) ?? client.id }} className="studio-tile">
              <div className="studio-wait-top">
                <b>{client.name}</b>
                <StudioChip>{client.type.replaceAll("_", " ")}</StudioChip>
              </div>
              <p>{client.organization || client.email}</p>
              <p>{client.email}</p>
              {client.phone ? <p>{client.phone}</p> : null}
            </Link>
          ))}
        </div>
      ) : null}

      {layout === "split" && selected ? (
        <div className="studio-split">
          <div className="studio-split-list">
            {visible.map((client) => (
              <button
                key={client.id}
                type="button"
                className={client.id === selected.id ? "is-on" : undefined}
                onClick={() => setSelectedId(client.id)}
              >
                <b>{client.name}</b>
                <p>{client.organization || client.email}</p>
              </button>
            ))}
          </div>
          <div className="studio-split-pane">
            <h2>{selected.name}</h2>
            <p className="studio-muted">{selected.type.replaceAll("_", " ")}</p>
            <dl className="studio-wait-card" style={{ marginTop: 16, boxShadow: "none" }}>
              <div>
                <dt>email</dt>
                <dd>{selected.email}</dd>
              </div>
              {selected.phone ? (
                <div>
                  <dt>phone</dt>
                  <dd>{selected.phone}</dd>
                </div>
              ) : null}
              {selected.organization ? (
                <div>
                  <dt>house</dt>
                  <dd>{selected.organization}</dd>
                </div>
              ) : null}
              {selected.source ? (
                <div>
                  <dt>source</dt>
                  <dd>{selected.source}</dd>
                </div>
              ) : null}
              {selected.notes ? (
                <div>
                  <dt>notes</dt>
                  <dd>{selected.notes}</dd>
                </div>
              ) : null}
            </dl>
            <Link to="/clients/$id" params={{ id: slugs.get(selected.id) ?? selected.id }} className="studio-today-go" style={{ marginTop: 16 }}>
              open record
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
