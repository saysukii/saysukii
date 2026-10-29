import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { ClientType } from "@/integrations/supabase/types";
import { shownName, isPersonType } from "@/components/studio/PersonName";
import { formatDate } from "@/lib/money";
import { archiveClient, getClient, saveClient } from "@/lib/os/clients.functions";
import { getDevPreviewClient, getDevPreviewInquiryWorkspace } from "@/lib/dev-preview";
import { getInquiryWorkspace } from "@/lib/os/inquiries.functions";
import {
  findPreviewClient,
  previewDirectoryRecord,
  updatePreviewClient,
} from "@/lib/preview-clients";
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
  const fetchWorkspace = useServerFn(getInquiryWorkspace);
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
      return removeClient({ data: { ids: [data?.client.id ?? id] } });
    },
    onSuccess: async () => {
      toast.success("client archived");
      await queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
      await router.navigate({ to: "/directories/clients" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">client records are for studio admins.</p>
      </div>
    );
  }
  if (isPending) {
    return <div className="studio-home is-book is-record" />;
  }
  if (!data) {
    return (
      <div className="studio-home is-book is-record">
        <Link to="/directories/clients" className="auth-text-action">
          back to clients
        </Link>
        <p className="studio-pearl-note">this client could not be found.</p>
      </div>
    );
  }

  const { client, inquiries, files } = data;
  const jobs = [...inquiries].sort((left, right) => {
    const rank = (status: string) => (status === "closed" ? 1 : 0);
    const byOpen = rank(left.status) - rank(right.status);
    if (byOpen !== 0) return byOpen;
    return right.received_at.localeCompare(left.received_at);
  });
  const openJobs = jobs.filter((inquiry) => inquiry.status !== "closed");
  const focus = openJobs[0] ?? jobs[0];
  const line = openJobs[0]
    ? [
        openJobs.length === 1 ? "1 open" : `${openJobs.length} open`,
        jobWhen(openJobs[0]),
        jobPlace(openJobs[0].venue_text, true),
      ]
        .filter(Boolean)
        .join(" · ")
    : jobs.length
      ? "nothing open"
      : "";
  const phone = client.phone?.trim() ?? "";
  const source = client.source?.trim() ?? "";
  const notes = client.notes?.trim() ?? "";
  const organization =
    client.organization && !sameLabel(client.organization, client.name) ? client.organization : "";

  return (
    <div className="studio-home is-book is-record">
      <div className="studio-lead studio-ledger">
        <header className="studio-ledger-head">
          <Link to="/directories/clients" className="studio-ledger-crumb">
            clients
          </Link>
          <div className="studio-ledger-name">
            <h1>{shownName(client.name, isPersonType(client.type))}</h1>
            {focus ? (
              <Link to="/pipeline/$id" params={{ id: focus.slug }} className="studio-today-go">
                open conversation
              </Link>
            ) : null}
          </div>
          <p className="studio-ledger-kind">{client.type.replaceAll("_", " ")}</p>
        </header>

        {line ? <p className="studio-ledger-line">{line}</p> : null}

        {editing ? (
          <form
            className="studio-client-edit"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <label className="studio-field">
              <span>name</span>
              <input
                className="studio-input"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>email</span>
              <input
                className="studio-input"
                required
                type="email"
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
                className="studio-input"
                value={form.source}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
              />
            </label>
            <label className="studio-field is-wide">
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
          </form>
        ) : null}

        <div className="studio-ledger-body">
          <div className="studio-ledger-work">
            <p className="studio-home-label">inquiries</p>
            {jobs.length === 0 ? <p className="studio-empty">no jobs yet.</p> : null}
            {jobs.length > 0 ? (
              <div className="studio-book-review-rows">
                {jobs.map((inquiry) => (
                  <Link
                    key={inquiry.id}
                    to="/pipeline/$id"
                    params={{ id: inquiry.slug }}
                    className={
                      inquiry.status === "closed" ? "studio-book-row is-quiet" : "studio-book-row"
                    }
                    onPointerEnter={() => {
                      void queryClient.prefetchQuery({
                        queryKey: ["os", "inquiry-workspace", inquiry.slug, devPreview],
                        queryFn: () =>
                          devPreview
                            ? getDevPreviewInquiryWorkspace(inquiry.slug)
                            : fetchWorkspace({ data: { id: inquiry.slug } }),
                      });
                    }}
                  >
                    <span>
                      <b>{EVENT_LABEL[inquiry.event_type]}</b>
                      <em>
                        {[jobWhen(inquiry), jobPlace(inquiry.venue_text)]
                          .filter(Boolean)
                          .join(" · ")}
                      </em>
                    </span>
                    <small>{STATUS_LABEL[inquiry.status]}</small>
                  </Link>
                ))}
              </div>
            ) : null}
            {files.length > 0 ? (
              <>
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
              </>
            ) : null}
          </div>

          <aside className="studio-ledger-rail">
            <p className="studio-home-label">contact</p>
            <p>{client.email}</p>
            {phone ? <p>{phone}</p> : null}
            {organization ? (
              <>
                <p className="studio-home-label">organization</p>
                <p>{organization}</p>
              </>
            ) : null}
            {source ? (
              <>
                <hr className="studio-ledger-split" />
                <p className="studio-home-label">found us</p>
                <p>{source.toLowerCase()}</p>
              </>
            ) : null}
            {notes ? (
              <>
                <hr className="studio-ledger-split" />
                <p className="studio-home-label">notes</p>
                <p className="studio-client-note">{notes}</p>
              </>
            ) : null}
            <hr className="studio-ledger-split" />
            <div className="studio-ledger-actions">
              <button
                type="button"
                className="studio-ghost"
                onClick={() => setEditing((open) => !open)}
              >
                {editing ? "close" : "edit"}
              </button>
              {data?.client && "archived" in data.client && data.client.archived ? (
                <i className="studio-archived-pill">archived</i>
              ) : (
                <button
                  type="button"
                  className="studio-ghost is-quiet"
                  disabled={archive.isPending}
                  onClick={() => {
                    if (window.confirm("archive this client?")) archive.mutate();
                  }}
                >
                  archive
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function sameLabel(left: string, right: string) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalize(left) === normalize(right);
}

function jobWhen(inquiry: { event_date: string | null; event_date_tbd: boolean }) {
  if (inquiry.event_date_tbd || !inquiry.event_date) return "date still open";
  return formatDate(inquiry.event_date).toLowerCase();
}

function jobPlace(venue: string | null | undefined, brief = false) {
  const text = venue?.trim();
  if (!text) return "";
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const state = parts.at(-1) ?? "";
  const shown = brief && parts.length > 1 && /^[a-z]{2}$/i.test(state) ? parts.slice(0, -1) : parts;
  return shown.join(", ").toLowerCase();
}
