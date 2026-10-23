import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ClientType } from "@/integrations/supabase/types";
import { getDevPreviewClients } from "@/lib/dev-preview";
import { clientSlugs } from "@/lib/os/inquiry-desk";
import { importClients, listClients, saveClient } from "@/lib/os/clients.functions";
import { mergePreviewClients, parseNotionCsv, rememberPreviewClient, type ContactDraft } from "@/lib/preview-clients";
import { useDevPreview } from "@/lib/use-dev-preview";

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
  source: "added by hand",
  notes: "",
};

function ClientsPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchClients = useServerFn(listClients);
  const submitClient = useServerFn(saveClient);
  const submitImport = useServerFn(importClients);
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState("");
  const [form, setForm] = useState(emptyForm);

  const { data: clients = [], isPending, isError } = useQuery({
    queryKey: ["os", "clients", devPreview],
    queryFn: async () => {
      const rows = devPreview ? getDevPreviewClients() : await fetchClients();
      return devPreview ? mergePreviewClients(rows) : rows;
    },
    enabled: isAdmin,
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? clients.filter((client) =>
          [client.name, client.email, client.organization, client.phone]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : clients;
    return [...rows].sort((left, right) => left.name.localeCompare(right.name));
  }, [clients, search]);

  const slugs = useMemo(() => clientSlugs(clients), [clients]);

  const createClient = useMutation({
    mutationFn: async () => {
      if (devPreview) return rememberPreviewClient(form);
      return submitClient({ data: form });
    },
    onSuccess: async (row) => {
      toast.success("added");
      setAdding(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
      const next = devPreview ? mergePreviewClients(getDevPreviewClients()) : clients;
      const slug = clientSlugs(devPreview ? next : [...clients, row]).get(row.id);
      if (slug) await navigate({ to: "/clients/$id", params: { id: slug } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bringIn = useMutation({
    mutationFn: async (contacts: ContactDraft[]) => {
      if (devPreview) {
        const existing = new Set(
          mergePreviewClients(getDevPreviewClients()).map((client) => client.email.toLowerCase()),
        );
        const fresh = contacts.filter((contact) => !existing.has(contact.email.toLowerCase()));
        fresh.forEach((contact) => rememberPreviewClient(contact));
        return { added: fresh.length, skipped: contacts.length - fresh.length };
      }
      return submitImport({ data: contacts });
    },
    onSuccess: async (result) => {
      toast.success(result.added ? `imported ${result.added}` : "those contacts are already here");
      setImporting(false);
      setCsv("");
      await queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">client records are available to admin users only.</p>
      </div>
    );
  }

  return (
    <div className="studio-home is-book">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">the book</p>
          <h1>clients</h1>
          <p>{isPending ? "gathering the book…" : `${clients.length} ${clients.length === 1 ? "person" : "people"}`}</p>
        </div>
        <div className="studio-home-hello-go">
          <button type="button" className="studio-ghost" onClick={() => setImporting(true)}>
            import
          </button>
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add
          </button>
        </div>
      </header>

      {isError ? <p className="studio-pearl-note">the client book is for studio admins.</p> : null}
      {isPending ? <p className="studio-empty">gathering…</p> : null}

      {!isPending ? (
        <div className="studio-book-body">
          <label className="studio-search studio-directory-search">
            <span className="sr-only">find a client</span>
            <input
              value={search}
              placeholder="find a person"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {visible.length === 0 ? <p className="studio-empty">nobody in the book yet.</p> : null}
          {visible.length > 0 ? (
          <div className="studio-directory">
            {visible.map((client) => (
              <Link
                key={client.id}
                to="/clients/$id"
                params={{ id: slugs.get(client.id) ?? client.id }}
                className="studio-book-row"
              >
                <span>
                  <b>{client.name}</b>
                  <em>{client.organization || client.email}</em>
                </span>
                <small>{client.type.replaceAll("_", " ")}</small>
              </Link>
            ))}
          </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask is-soft" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">add a client</DialogTitle>
          <DialogDescription className="sr-only">name, email, and how to reach them.</DialogDescription>
          <form
            className="studio-task-form"
            onSubmit={(event) => {
              event.preventDefault();
              createClient.mutate();
            }}
          >
            <p className="studio-ask-hint">a person, added by hand.</p>
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
              <span>phone</span>
              <input
                className="studio-input"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
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
            <div className="studio-ask-foot">
              <button type="submit" className="studio-today-go" disabled={createClient.isPending}>
                {createClient.isPending ? "adding…" : "add"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importing}
        onOpenChange={(open) => {
          setImporting(open);
          if (!open) setCsv("");
        }}
      >
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask is-soft" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">import from notion</DialogTitle>
          <DialogDescription className="sr-only">
            paste a csv exported from the notion client directory.
          </DialogDescription>
          <form
            className="studio-task-form"
            onSubmit={(event) => {
              event.preventDefault();
              const contacts = parseNotionCsv(csv);
              if (contacts.length === 0) {
                toast.error("that csv needs name and email columns");
                return;
              }
              bringIn.mutate(contacts);
            }}
          >
            <p className="studio-ask-hint">
              export the notion directory as csv. name and email are enough. phone and organization come along when
              they’re there.
            </p>
            <label className="studio-field">
              <span>csv</span>
              <textarea
                className="studio-textarea"
                value={csv}
                placeholder="name,email,phone,organization"
                onChange={(event) => setCsv(event.target.value)}
              />
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setCsv(await file.text());
                event.target.value = "";
              }}
            />
            <div className="studio-ask-foot is-pair is-spread">
              <button type="button" className="studio-ghost" onClick={() => fileRef.current?.click()}>
                choose a file
              </button>
              <button type="submit" className="studio-today-go" disabled={bringIn.isPending || !csv.trim()}>
                {bringIn.isPending ? "importing…" : "import"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
