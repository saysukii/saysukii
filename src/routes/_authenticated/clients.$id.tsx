import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { StudioChip } from "@/components/portal/studio";
import type { ClientType } from "@/integrations/supabase/types";
import { formatDate, formatMoneyExact } from "@/lib/money";
import { archiveClient, getClient, saveClient } from "@/lib/os/clients.functions";
import { getDevPreviewClient } from "@/lib/dev-preview";
import { EVENT_LABEL, STATUS_LABEL, boardStageId } from "@/lib/os/inquiry-desk";
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
    queryFn: () => (devPreview ? getDevPreviewClient(id) : fetchClient({ data: { id } })),
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
    mutationFn: () => {
      if (devPreview) {
        toast.message("preview mode — client not saved");
        return Promise.resolve(data?.client);
      }
      return submitClient({ data: { id: data?.client.id ?? id, ...form } });
    },
    onSuccess: () => {
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
        <Link to="/clients" className="auth-text-action">
          back to clients
        </Link>
        <p className="studio-pearl-note">this client could not be found.</p>
      </div>
    );
  }

  const { client, inquiries, proposals, projects, files } = data;
  const openJob = inquiries.find((inquiry) => inquiry.status !== "closed") ?? inquiries[0];

  return (
    <div className="studio-page">
      <Link to="/clients" className="auth-text-action" activeOptions={{ exact: true }}>
        back to clients
      </Link>

      <div className="studio-crm-top">
        <div>
          <p className="studio-kicker">{client.type.replaceAll("_", " ")}</p>
          <h1>{client.name}</h1>
          <p>{[client.organization, client.email, client.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="studio-crm-actions">
          {openJob ? (
            <>
              <Link to="/pipeline/$id" params={{ id: openJob.slug }} className="studio-today-go">
                open conversation
              </Link>
              <Link to="/proposals/new" search={{ inquiry: openJob.id }} className="studio-ghost">
                create proposal
              </Link>
            </>
          ) : null}
          <button type="button" className="studio-ghost" onClick={() => setEditing((open) => !open)}>
            {editing ? "close editor" : "edit"}
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
      </div>

      {editing ? (
        <form
          className="studio-panel"
          style={{ marginTop: 16 }}
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

      <div className="studio-crm" style={{ marginTop: 16 }}>
        <section className="studio-crm-main">
          <div className="studio-panel">
            <p className="studio-kicker">jobs</p>
            <h2>inquiries</h2>
            <p className="studio-muted" style={{ marginTop: 8 }}>
              conversation, proposals, and project files live on the job — not only the contact.
            </p>
            <div className="studio-stack" style={{ marginTop: 16 }}>
              {inquiries.length === 0 ? <p className="studio-empty">no jobs yet.</p> : null}
              {inquiries.map((inquiry) => (
                <Link
                  key={inquiry.id}
                  to="/pipeline/$id"
                  params={{ id: inquiry.slug }}
                  className="studio-ledger-row"
                >
                  <div>
                    <b>{EVENT_LABEL[inquiry.event_type]}</b>
                    <p>
                      {inquiry.event_date_tbd ? "date tbd" : formatDate(inquiry.event_date)}
                      {inquiry.venue_text ? ` · ${inquiry.venue_text}` : ""}
                    </p>
                  </div>
                  <StudioChip stage={boardStageId(inquiry)}>{STATUS_LABEL[inquiry.status]}</StudioChip>
                </Link>
              ))}
            </div>
          </div>

          <div className="studio-panel">
            <p className="studio-kicker">work</p>
            <h2>proposals</h2>
            <div className="studio-stack" style={{ marginTop: 16 }}>
              {proposals.length === 0 ? <p className="studio-empty">no proposal yet.</p> : null}
              {proposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  to="/proposals/$id"
                  params={{ id: proposal.id }}
                  className="studio-ledger-row"
                >
                  <div>
                    <b>{proposal.number}</b>
                    <p>
                      {formatDate(proposal.event_date)} · {proposal.status}
                    </p>
                  </div>
                  <strong>{formatMoneyExact(proposal.total_cents)}</strong>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <aside className="studio-crm-side">
          <div className="studio-panel">
            <p className="studio-kicker">booked work</p>
            <h2>projects</h2>
            <div className="studio-stack" style={{ marginTop: 16 }}>
              {projects.length === 0 ? (
                <p className="studio-empty">projects appear after a paid deposit.</p>
              ) : null}
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to="/projects/$id"
                  params={{ id: project.id }}
                  className="studio-ledger-row"
                >
                  <div>
                    <b>{project.event_name}</b>
                    <p>
                      {formatDate(project.event_date)} · {project.status.replaceAll("_", " ")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="studio-panel">
            <p className="studio-kicker">internal</p>
            <h2>files</h2>
            <p className="studio-muted" style={{ marginTop: 8 }}>
              job files — floor plans, palettes, contracts — sit on the inquiry.
            </p>
            <div className="studio-stack" style={{ marginTop: 16 }}>
              {files.length === 0 ? <p className="studio-empty">no client-level files.</p> : null}
              {files.map((file) => (
                <a
                  key={file.id}
                  href={file.signed_url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="studio-ledger-row"
                >
                  <b>{file.file_path.split("/").at(-1)}</b>
                </a>
              ))}
            </div>
          </div>

          {client.notes ? (
            <div className="studio-panel">
              <p className="studio-kicker">studio</p>
              <h2>notes</h2>
              <p className="studio-muted" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
                {client.notes}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
