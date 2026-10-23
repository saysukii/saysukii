import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { ClientType } from "@/integrations/supabase/types";
import { shownName, isPersonType } from "@/components/studio/PersonName";
import { formatDate } from "@/lib/money";
import { archiveClient, getClient, saveClient } from "@/lib/os/clients.functions";
import { getDevPreviewClient } from "@/lib/dev-preview";
import { findPreviewClient, previewDirectoryRecord, updatePreviewClient } from "@/lib/preview-clients";
import { EVENT_LABEL, STATUS_LABEL } from "@/lib/os/inquiry-desk";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({
    meta: [{ title: "Client — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { id } = Route.useParams();
  const devPreview = useDevPreview();
  const { profile } = Route.useRouteContext();
  const isAdmin = profile.role === "admin";
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchClient = useServerFn(getClient);
  const submitClient = useServerFn(saveClient);
  const removeClient = useServerFn(archiveClient);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    organization: "",
    type: "individual" as ClientType,
    source: "",
    notes: "",
  });

  const { data, isPending } = useQuery({
    queryKey: ["os", "client", id, devPreview],
    queryFn: () => {
      if (!devPreview) return fetchClient({ data: { id } });
      return previewDirectoryRecord(id) ?? getDevPreviewClient(id);
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!data?.slug || data.slug === id) return;
    void router.navigate({ to: "/clients/$id", params: { id: data.slug }, replace: true });
  }, [data?.slug, id, router]);

  useEffect(() => {
    if (!data?.client) return;
    setForm({
      name: data.client.name,
      email: data.client.email,
      phone: data.client.phone ?? "",
      organization: data.client.organization ?? "",
      type: data.client.type,
      source: data.client.source ?? "",
      notes: data.client.notes ?? "",
    });
  }, [data?.client]);

  const save = useMutation({
    mutationFn: async () => {
      if (devPreview) {
        const local = data?.client ? findPreviewClient(data.client.id) : null;
        if (!local) return false;
        updatePreviewClient(local.id, form);
        return true;
      }
      await submitClient({ data: { id: data?.client.id ?? id, ...form } });
      return true;
    },
    onSuccess: (saved) => {
      if (!saved) {
        toast.message("preview mode — client not saved");
        setEditing(false);
        return;
      }
      toast.success("client updated");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["os", "client", id] });
      void queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("preview mode — client not archived");
        return Promise.resolve({ ok: true as const });
      }
      return removeClient({ data: { id: data?.client.id ?? id } });
    },
    onSuccess: async () => {
      toast.success("client archived");
      await queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
      await router.navigate({ to: "/clients" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="studio-page">
        <p className="studio-pearl-note">client records are for studio admins.</p>
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="studio-page">
        <p className="studio-empty">opening the client…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="studio-page">
        <Link to="/directories/clients" className="auth-text-action">
          back to clients
        </Link>
        <p className="studio-pearl-note">this client could not be found.</p>
      </div>
    );
  }

  const { client, inquiries, files } = data;
  const openJob = inquiries.find((inquiry) => inquiry.status !== "closed") ?? inquiries[0];

  return (
    <div className="studio-home is-book is-record">
      <div className="studio-lead">
      <header className="studio-home-hello is-beside">
        <div>
          <Link to="/directories/clients" className="studio-record-back" aria-label="back to clients">
            <ArrowLeft aria-hidden="true" strokeWidth={1.5} />
          </Link>
          <h1>{shownName(client.name, isPersonType(client.type))}</h1>
        </div>
        <p className="studio-hello-meta">
          {client.organization ? <span>{client.organization}</span> : null}
          <span>{client.email}</span>
        </p>
      </header>

      <section className="studio-module is-rows studio-person">
        <p className="studio-home-label">the person</p>
        <dl className="studio-facts">
          <div>
            <dt>email</dt>
            <dd>{client.email}</dd>
          </div>
          <div>
            <dt>phone</dt>
            <dd>{client.phone || "—"}</dd>
          </div>
          <div>
            <dt>organization</dt>
            <dd>{client.organization || "—"}</dd>
          </div>
          <div>
            <dt>kind</dt>
            <dd>{client.type.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>found us</dt>
            <dd>{client.source || "—"}</dd>
          </div>
        </dl>
        <div className="studio-row-action">
          {openJob ? (
            <Link to="/pipeline/$id" params={{ id: openJob.slug }} className="studio-today-go">
              open conversation
            </Link>
          ) : null}
          <button type="button" className="studio-ghost" onClick={() => setEditing((open) => !open)}>
            {editing ? "close" : "edit"}
          </button>
          <button
            type="button"
            className="studio-ghost"
            disabled={archive.isPending}
            onClick={() => {
              if (window.confirm("archive this client?")) archive.mutate();
            }}
          >
            archive
          </button>
        </div>
      </section>

      {editing ? (
        <form
          className="studio-module"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="studio-stack">
            <label className="studio-field">
              <span>name</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>email</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>phone</span>
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>organization</span>
              <input
                value={form.organization}
                onChange={(event) => setForm({ ...form, organization: event.target.value })}
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
              <span>found us</span>
              <input
                value={form.source}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>studio notes</span>
              <textarea
                className="studio-textarea"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
            <button type="submit" className="studio-today-go" disabled={save.isPending}>
              {save.isPending ? "saving…" : "save client"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="studio-module">
        <p className="studio-home-label">inquiries</p>
        {inquiries.length === 0 ? <p className="studio-empty">no jobs yet.</p> : null}
        <div className="studio-book-review-rows">
          {inquiries.map((inquiry) => (
            <Link key={inquiry.id} to="/pipeline/$id" params={{ id: inquiry.slug }} className="studio-book-row">
              <span>
                <b>{EVENT_LABEL[inquiry.event_type]}</b>
                <em>
                  {inquiry.event_date_tbd ? "date tbd" : formatDate(inquiry.event_date)}
                  {inquiry.venue_text ? ` · ${inquiry.venue_text}` : ""}
                </em>
              </span>
              <small>{STATUS_LABEL[inquiry.status]}</small>
            </Link>
          ))}
        </div>
      </section>

      {files.length > 0 ? (
        <section className="studio-module">
          <p className="studio-home-label">files</p>
          <div className="studio-book-review-rows">
            {files.map((file) => (
              <a
                key={file.id}
                href={file.signed_url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="studio-book-row"
              >
                <span>
                  <b>{file.file_path.split("/").at(-1)}</b>
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {client.notes ? (
        <section className="studio-module">
          <p className="studio-home-label">notes</p>
          <p className="studio-client-note">{client.notes}</p>
        </section>
      ) : null}
      </div>
    </div>
  );
}
