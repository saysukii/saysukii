import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CalendarHours } from "@/components/portal/CalendarHours";
import { StudioChip } from "@/components/portal/studio";
import { PersonName } from "@/components/studio/PersonName";
import {
  beginGoogleOAuth,
  beginSquareOAuth,
  deactivateTeamMember,
  disconnectGoogle,
  getGmailStatus,
  inviteTeamMember,
  listAdminSettings,
} from "@/lib/os/settings.functions";
import { getDevPreviewSettings } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  integration: z.enum(["square", "google", "gmail"]).optional(),
  status: z.enum(["connected", "error"]).optional(),
  view: z.enum(["stack", "columns", "tabs"]).optional(),
});

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Settings — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

const sections = [
  { id: "hours", label: "hours", blurb: "when the meeting page is open." },
  { id: "connections", label: "connections", blurb: "google and square." },
  { id: "people", label: "people", blurb: "who can come into the studio." },
  { id: "health", label: "health", blurb: "failures, venues, and vendors." },
] as const;

type SettingsSection = (typeof sections)[number]["id"];

const providers = [
  {
    id: "google",
    name: "google",
    description: "one sign-in for calendar, gmail, and drive.",
  },
  {
    id: "square",
    name: "square",
    description: "deposit checkout links and payment status.",
  },
] as const;

function formatSeen(value: string | null | undefined) {
  if (!value) return "never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function SettingsPage() {
  const { profile } = Route.useRouteContext();
  const { integration, status } = Route.useSearch();
  const [open, setOpen] = useState<SettingsSection | null>(null);
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(listAdminSettings);
  const sendInvite = useServerFn(inviteTeamMember);
  const deactivate = useServerFn(deactivateTeamMember);
  const connectSquare = useServerFn(beginSquareOAuth);
  const connectGoogle = useServerFn(beginGoogleOAuth);
  const fetchGmail = useServerFn(getGmailStatus);
  const disconnectGoogleFn = useServerFn(disconnectGoogle);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "team">("team");

  const { data, isPending } = useQuery({
    queryKey: ["os", "admin-settings", devPreview],
    queryFn: async () => {
      const settings = devPreview ? getDevPreviewSettings() : await fetchSettings();
      try {
        const gmail = await fetchGmail();
        return {
          ...settings,
          connections: [
            ...settings.connections.filter((item) => item.provider !== "gmail"),
            {
              id: gmail.id ?? "gmail",
              provider: "gmail" as const,
              status: gmail.status,
              expires_at: null,
              metadata: {},
              connected_by: gmail.connected_by,
              updated_at: gmail.updated_at,
              account_email: gmail.account_email,
            },
          ],
        };
      } catch {
        return settings;
      }
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!integration || !status) return;
    const provider =
      integration === "square" ? "Square" : "Google";
    if (status === "connected") toast.success(`${provider} connected`);
    else toast.error(`${provider} could not be connected`);
    window.history.replaceState({}, "", "/settings");
  }, [integration, status]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["os", "admin-settings"] });

  const invite = useMutation({
    mutationFn: (values: { email: string; role: "admin" | "team" }) => {
      if (devPreview) {
        toast.message("Preview mode — invite not sent");
        return Promise.resolve({ email: values.email });
      }
      return sendInvite({ data: values });
    },
    onSuccess: (result) => {
      toast.success(`Invitation sent to ${result.email}`);
      setEmail("");
      setRole("team");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: (id: string) => {
      if (devPreview) {
        toast.message("Preview mode — member not deactivated");
        return Promise.resolve({ id });
      }
      return deactivate({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Studio access deactivated");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const squareOAuth = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — Square OAuth unavailable");
        return Promise.reject(new Error("Preview mode"));
      }
      return connectSquare();
    },
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
    onError: (error: Error) => {
      if (error.message === "Preview mode") return;
      toast.error(error.message);
    },
  });

  const googleOAuth = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — Google OAuth unavailable");
        return Promise.reject(new Error("Preview mode"));
      }
      return connectGoogle();
    },
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
    onError: (error: Error) => {
      if (error.message === "Preview mode") return;
      toast.error(error.message);
    },
  });

  const googleDisconnect = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — Google stays disconnected");
        return Promise.reject(new Error("Preview mode"));
      }
      return disconnectGoogleFn();
    },
    onSuccess: () => {
      toast.success("Google disconnected");
      void refresh();
    },
    onError: (error: Error) => {
      if (error.message === "Preview mode") return;
      toast.error(error.message);
    },
  });

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invite.mutate({ email, role });
  }

  if (!isAdmin) {
    return (
      <div className="studio-page">
        <div className="studio-page">
          <p className="studio-kicker">studio</p>
          <h1>settings</h1>
          <p>studio access is managed by admin users.</p>
        </div>
      </div>
    );
  }

  const connections = data?.connections ?? [];
  const members = data?.members ?? [];
  const pendingInvites = data?.invites ?? [];
  const failedEvents = data?.failedEvents ?? [];

  const connectionsBlock = (
    <section className="studio-panel">
      <div className="studio-panel-head">
        <div>
          <p className="studio-kicker">integrations</p>
          <h2>connected services</h2>
        </div>
      </div>
      <div className="studio-connect-list">
        {providers.map((provider) => {
          const stored = connections.find((item) => item.provider === provider.id);
          const gmail = connections.find((item) => item.provider === "gmail");
          const linked = provider.id === "google" && gmail?.status === "connected";
          const connectionStatus = linked ? "connected" : (stored?.status ?? "disconnected");
          const accountEmail =
            provider.id === "google"
              ? (gmail && "account_email" in gmail ? gmail.account_email : null) ??
                (stored?.metadata &&
                typeof stored.metadata === "object" &&
                !Array.isArray(stored.metadata) &&
                typeof stored.metadata.account_email === "string"
                  ? stored.metadata.account_email
                  : null)
              : null;
          const pending =
            provider.id === "square"
              ? squareOAuth.isPending
              : googleOAuth.isPending || googleDisconnect.isPending;
          const updatedAt = linked ? (gmail?.updated_at ?? stored?.updated_at) : stored?.updated_at;
          return (
            <article key={provider.id} className="studio-connect-row">
              <div>
                <div className="studio-connect-name">
                  <b>{provider.name}</b>
                  <span
                    className={cn(
                      "studio-connect-status",
                      connectionStatus === "connected" && "is-on",
                      connectionStatus === "error" && "is-due",
                    )}
                  >
                    {connectionStatus}
                  </span>
                </div>
                <p>{provider.description}</p>
                {accountEmail ? <p>{accountEmail}</p> : null}
                <p className="studio-connect-seen">updated {formatSeen(updatedAt)}</p>
              </div>
              <div className="studio-connect-go">
                <button
                  type="button"
                  className="studio-today-go"
                  disabled={pending}
                  onClick={() => (provider.id === "square" ? squareOAuth.mutate() : googleOAuth.mutate())}
                >
                  {pending && (provider.id === "square" ? squareOAuth.isPending : googleOAuth.isPending)
                    ? "redirecting…"
                    : connectionStatus === "connected"
                      ? "reconnect"
                      : "connect"}
                </button>
                {provider.id === "google" && connectionStatus === "connected" ? (
                  <button
                    type="button"
                    className="studio-ghost"
                    disabled={pending}
                    onClick={() => googleDisconnect.mutate()}
                  >
                    {googleDisconnect.isPending ? "disconnecting…" : "disconnect"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  const accessBlock = (
    <section className="studio-panel">
      <div className="studio-panel-head">
        <div>
          <p className="studio-kicker">studio access</p>
          <h2>people</h2>
        </div>
      </div>
      <form className="studio-stack" style={{ marginTop: 16 }} onSubmit={submitInvite}>
        <label className="studio-field">
          <span>email</span>
          <input
            required
            type="email"
            className="studio-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@saysukii.com"
          />
        </label>
        <label className="studio-field">
          <span>role</span>
          <select className="studio-select" value={role} onChange={(event) => setRole(event.target.value as "admin" | "team")}>
            <option value="team">team</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="submit" className="studio-today-go" disabled={invite.isPending || !email}>
          {invite.isPending ? "sending…" : "send invitation"}
        </button>
      </form>
      {pendingInvites.length ? (
        <div style={{ marginTop: 18 }}>
          <p className="studio-kicker">pending</p>
          {pendingInvites.map((item) => (
            <div key={item.id} className="studio-member">
              <span>{item.email}</span>
              <StudioChip>{item.role}</StudioChip>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 18 }}>
        {members.map((member) => (
          <div key={member.id} className="studio-member">
            <div>
              <b>{member.full_name ? <PersonName name={member.full_name} /> : member.email}</b>
              <p>{member.email}</p>
              <p>last seen {formatSeen(member.last_seen_at)}</p>
            </div>
            <div className="studio-views">
              <StudioChip tone={member.active ? "soft" : "due"}>{member.active ? member.role : "inactive"}</StudioChip>
              {member.active && member.id !== profile.id ? (
                <button type="button" className="studio-ghost" disabled={removeMember.isPending} onClick={() => removeMember.mutate(member.id)}>
                  deactivate
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const healthBlock = (
    <section className="studio-panel">
      <div className="studio-panel-head">
        <div>
          <p className="studio-kicker">health</p>
          <h2>recent failures</h2>
        </div>
        <StudioChip tone={failedEvents.length ? "due" : "soft"}>{failedEvents.length || "clear"}</StudioChip>
      </div>
      {failedEvents.length ? (
        <div style={{ marginTop: 16 }}>
          {failedEvents.map((event) => (
            <div key={event.id} className="studio-member">
              <div>
                <b>
                  {event.provider} · {event.event_type.replaceAll("_", " ")}
                </b>
                <p>{event.error_message || "no error detail was recorded."}</p>
              </div>
              <p>{formatSeen(event.updated_at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="studio-empty">no failed integration events.</p>
      )}
      <p className="studio-muted" style={{ marginTop: 18 }}>
        default deposits stay on the server for v1. proposal-specific amounts are set when you send.
      </p>
      <Link to="/library" className="auth-text-action" style={{ marginTop: 12, display: "inline-flex" }}>
        library
      </Link>
    </section>
  );

  function panelFor(id: SettingsSection) {
    if (id !== "hours" && isPending) return <p className="studio-empty">gathering…</p>;
    if (id === "hours") return <CalendarHours />;
    if (id === "connections") return connectionsBlock;
    if (id === "people") return accessBlock;
    return healthBlock;
  }

  return (
    <div className="studio-home studio-settings">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">studio</p>
          <h1>settings</h1>
          <p>hours, connections, and who can come in.</p>
        </div>
      </header>

      <div className="studio-settings-index">
        {sections.map((item) => {
          const isOpen = open === item.id;
          return (
            <section key={item.id} className={isOpen ? "studio-settings-fold is-open" : "studio-settings-fold"}>
              <h2>
                <button
                  type="button"
                  className="studio-settings-fold-toggle"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : item.id)}
                >
                  <b>{item.label}</b>
                  <span>{item.blurb}</span>
                  <em aria-hidden="true" />
                </button>
              </h2>
              {isOpen ? <div className="studio-settings-fold-body">{panelFor(item.id)}</div> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
