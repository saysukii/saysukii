import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { StudioChip, StudioHeading } from "@/components/portal/studio";
import {
  beginGmailOAuth,
  beginGoogleOAuth,
  beginSquareOAuth,
  deactivateTeamMember,
  disconnectGmail,
  getGmailStatus,
  inviteTeamMember,
  listAdminSettings,
  refreshGmail,
} from "@/lib/os/settings.functions";
import { getDevPreviewSettings } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

const views = [
  { id: "stack", label: "stack" },
  { id: "columns", label: "columns" },
  { id: "tabs", label: "tabs" },
] as const;

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

const providers = [
  {
    id: "gmail",
    name: "gmail",
    description: "read and send as Sukii. tokens stay encrypted on the server.",
  },
  {
    id: "square",
    name: "square",
    description: "deposit checkout links and payment status.",
  },
  {
    id: "google",
    name: "google calendar",
    description: "project dates synced to the studio calendar.",
  },
  {
    id: "resend",
    name: "resend",
    description: "inquiry notifications and proposal delivery.",
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
  const { view, integration, status } = Route.useSearch();
  const layout = view ?? "stack";
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(listAdminSettings);
  const sendInvite = useServerFn(inviteTeamMember);
  const deactivate = useServerFn(deactivateTeamMember);
  const connectSquare = useServerFn(beginSquareOAuth);
  const connectGoogle = useServerFn(beginGoogleOAuth);
  const connectGmail = useServerFn(beginGmailOAuth);
  const fetchGmail = useServerFn(getGmailStatus);
  const disconnectGmailFn = useServerFn(disconnectGmail);
  const refreshGmailFn = useServerFn(refreshGmail);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "team">("team");
  const [tab, setTab] = useState<"connections" | "access" | "health">("connections");

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
      integration === "square" ? "Square" : integration === "gmail" ? "Gmail" : "Google Calendar";
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
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });

  const gmailOAuth = useMutation({
    mutationFn: () => connectGmail(),
    onSuccess: (result) => {
      if (!result.redirectTo) {
        toast.error(result.error ?? "Gmail could not be connected");
        return;
      }
      window.location.assign(result.redirectTo);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Gmail could not be connected"),
  });

  const gmailDisconnect = useMutation({
    mutationFn: () => disconnectGmailFn(),
    onSuccess: (result) => {
      if (!result.status) {
        toast.error(result.error ?? "Gmail could not be disconnected");
        return;
      }
      toast.success("Gmail disconnected");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Gmail could not be disconnected"),
  });

  const gmailRefresh = useMutation({
    mutationFn: () => refreshGmailFn(),
    onSuccess: (result) => {
      if (!result.status) {
        toast.error(result.error ?? "Gmail token could not be refreshed");
        return;
      }
      toast.success("Gmail token refreshed");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Gmail token could not be refreshed"),
  });

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invite.mutate({ email, role });
  }

  if (!isAdmin) {
    return (
      <div className="studio-page">
        <StudioHeading title="settings" note="studio access is managed by admin users." />
      </div>
    );
  }

  const gmailNotice =
    (gmailOAuth.data && !gmailOAuth.data.redirectTo ? gmailOAuth.data.error : null) ??
    (gmailDisconnect.data && !gmailDisconnect.data.status ? gmailDisconnect.data.error : null) ??
    (gmailRefresh.data && !gmailRefresh.data.status ? gmailRefresh.data.error : null) ??
    (gmailOAuth.error instanceof Error ? gmailOAuth.error.message : null);
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
      <div className="studio-tiles" style={{ marginTop: 16 }}>
        {providers.map((provider) => {
          const connection = connections.find((item) => item.provider === provider.id);
          const connectionStatus = connection?.status ?? "disconnected";
          const gmailBusy =
            gmailOAuth.isPending || gmailDisconnect.isPending || gmailRefresh.isPending;
          const pending =
            provider.id === "square"
              ? squareOAuth.isPending
              : provider.id === "google"
                ? googleOAuth.isPending
                : provider.id === "gmail"
                  ? gmailBusy
                  : false;
          const accountEmail =
            connection && "account_email" in connection
              ? (connection as { account_email?: string | null }).account_email
              : null;
          return (
            <article key={provider.id} className="studio-tile">
              <div className="studio-wait-top">
                <b>{provider.name}</b>
                <StudioChip tone={connectionStatus === "connected" ? "late" : connectionStatus === "error" ? "due" : "soft"}>
                  {connectionStatus}
                </StudioChip>
              </div>
              <p>{provider.description}</p>
              {provider.id === "gmail" && accountEmail ? <p>{accountEmail}</p> : null}
              {provider.id === "gmail" && gmailNotice ? <p>{gmailNotice}</p> : null}
              <p>updated {formatSeen(connection?.updated_at)}</p>
              {provider.id === "square" || provider.id === "google" ? (
                <button
                  type="button"
                  className="studio-today-go"
                  style={{ marginTop: 12 }}
                  disabled={pending}
                  onClick={() => (provider.id === "square" ? squareOAuth.mutate() : googleOAuth.mutate())}
                >
                  {pending ? "redirecting…" : connectionStatus === "connected" ? "reconnect" : "connect"}
                </button>
              ) : provider.id === "gmail" ? (
                <div className="studio-views" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="studio-today-go"
                    disabled={pending}
                    onClick={() => gmailOAuth.mutate()}
                  >
                    {gmailOAuth.isPending
                      ? "redirecting…"
                      : connectionStatus === "connected"
                        ? "reconnect"
                        : "connect gmail"}
                  </button>
                  {connectionStatus !== "disconnected" ? (
                    <button
                      type="button"
                      className="studio-ghost"
                      disabled={pending}
                      onClick={() => gmailDisconnect.mutate()}
                    >
                      {gmailDisconnect.isPending ? "disconnecting…" : "disconnect"}
                    </button>
                  ) : null}
                  {connectionStatus === "connected" ? (
                    <button
                      type="button"
                      className="studio-ghost"
                      disabled={pending}
                      onClick={() => gmailRefresh.mutate()}
                    >
                      {gmailRefresh.isPending ? "refreshing…" : "refresh token"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p>configured on the server.</p>
              )}
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
              <b>{member.full_name || member.email}</b>
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
      <Link to="/settings/directories" className="auth-text-action" style={{ marginTop: 12, display: "inline-flex" }}>
        venues and vendors
      </Link>
    </section>
  );

  const sections: Record<"connections" | "access" | "health", ReactNode> = {
    connections: connectionsBlock,
    access: accessBlock,
    health: healthBlock,
  };

  return (
    <div className="studio-page">
      <StudioHeading title="settings" note="access, connections, and the health of the studio." />
      <nav className="studio-views" aria-label="layout versions">
        {views.map((item) => (
          <Link key={item.id} to="/settings" search={{ view: item.id }} className={cn(layout === item.id && "is-on")}>
            {item.label}
          </Link>
        ))}
      </nav>

      {isPending ? <p className="studio-empty">gathering…</p> : null}

      {layout === "stack" ? (
        <div className="studio-stack">
          {connectionsBlock}
          {accessBlock}
          {healthBlock}
        </div>
      ) : null}

      {layout === "columns" ? (
        <div className="studio-settings-cols">
          {connectionsBlock}
          {accessBlock}
          <div style={{ gridColumn: "1 / -1" }}>{healthBlock}</div>
        </div>
      ) : null}

      {layout === "tabs" ? (
        <>
          <div className="studio-tabs">
            {(["connections", "access", "health"] as const).map((id) => (
              <button key={id} type="button" className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>
                {id}
              </button>
            ))}
          </div>
          {sections[tab]}
        </>
      ) : null}
    </div>
  );
}
