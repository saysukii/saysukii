import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { StudioChip } from "@/components/portal/studio";
import { PersonName } from "@/components/studio/PersonName";
import {
  readInquiryDrafts,
  resolveInquirySteps,
  resolveSharedSteps,
  snapshotInquiryPath,
  snapshotSharedPath,
  visibleInquirySteps,
  writeInquiryDrafts,
  type InquiryDrafts,
  type InquiryEditorTab,
  type InquiryPathDraft,
} from "@/lib/os/inquiry-draft";
import { getInquiryForms, saveInquiryForms } from "@/lib/os/inquiry-forms.functions";
import { INTEREST_OPTIONS } from "@/lib/os/inquiry-schema";
import {
  beginGoogleOAuth,
  beginSquareOAuth,
  deactivateTeamMember,
  disconnectGoogle,
  getGmailStatus,
  inviteTeamMember,
  listAdminSettings,
  updateOwnProfile,
} from "@/lib/os/settings.functions";
import { sendSignInEmail } from "@/lib/os/sign-in-email.functions";
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
  { id: "account", label: "account", blurb: "your name and password." },
  { id: "connections", label: "connections", blurb: "google and square." },
  { id: "people", label: "people", blurb: "invite someone into the studio." },
  { id: "forms", label: "forms", blurb: "the questions a client answers." },
  { id: "health", label: "health", blurb: "sends and payment links that did not go through." },
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

const formTabs: Array<{ id: InquiryEditorTab; label: string }> = [
  { id: "shared", label: "contact" },
  ...INTEREST_OPTIONS.map((option) => ({ id: option.value, label: option.label.toLowerCase() })),
];

type FormQuestion = {
  id: string;
  label: string;
  hint: string;
  options: Array<{ value: string; label: string }>;
};

function questionsFor(tab: InquiryEditorTab, drafts: InquiryDrafts): FormQuestion[] {
  const steps =
    tab === "shared"
      ? resolveSharedSteps(drafts)
      : visibleInquirySteps(resolveInquirySteps(tab, drafts));
  return steps
    .filter((step) => step.kind !== "review")
    .map((step) => ({
      id: step.id,
      label: step.label.toLowerCase(),
      hint: (step.hint ?? "").toLowerCase(),
      options:
        step.kind === "choice" || step.kind === "multi"
          ? step.options.map((option) => ({
              value: option.value,
              label: option.label.toLowerCase(),
            }))
          : [],
    }));
}

function storeTab(
  drafts: InquiryDrafts,
  tab: InquiryEditorTab,
  questions: FormQuestion[],
): InquiryDrafts {
  const path: InquiryPathDraft =
    tab === "shared"
      ? (drafts.shared ?? snapshotSharedPath())
      : (drafts[tab] ?? snapshotInquiryPath(tab));
  const copy = { ...path.copy };
  for (const question of questions) {
    const options = question.options.length
      ? Object.fromEntries(
          question.options.map((option) => [option.value, option.label.trim().toLowerCase()]),
        )
      : copy[question.id]?.options;
    copy[question.id] = {
      label: question.label.trim().toLowerCase(),
      hint: question.hint.trim().toLowerCase(),
      ...(options ? { options } : {}),
    };
  }
  const nextPath = { ...path, copy };
  return tab === "shared" ? { ...drafts, shared: nextPath } : { ...drafts, [tab]: nextPath };
}

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
  const [accountName, setAccountName] = useState(profile.full_name ?? "");
  const [resetting, setResetting] = useState(false);
  const [formTab, setFormTab] = useState<InquiryEditorTab>("shared");
  const [drafts, setDrafts] = useState<InquiryDrafts>(() => readInquiryDrafts());
  const [formQuestions, setFormQuestions] = useState<FormQuestion[]>(() =>
    questionsFor("shared", readInquiryDrafts()),
  );
  const [savingForm, setSavingForm] = useState(false);
  const formTabRef = useRef(formTab);
  formTabRef.current = formTab;
  const saveName = useServerFn(updateOwnProfile);
  const sendStudioLetter = useServerFn(sendSignInEmail);
  const fetchForms = useServerFn(getInquiryForms);
  const saveForms = useServerFn(saveInquiryForms);

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
    let stop = false;
    void fetchForms()
      .then((saved) => {
        if (stop || !saved) return;
        setDrafts(saved);
        setFormQuestions(questionsFor(formTabRef.current, saved));
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [fetchForms]);

  useEffect(() => {
    if (!integration || !status) return;
    const provider = integration === "square" ? "Square" : "Google";
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

  const rename = useMutation({
    mutationFn: (fullName: string) => {
      if (devPreview) {
        toast.message("preview mode — name stays on this screen");
        return Promise.resolve({ fullName });
      }
      return saveName({ data: { fullName } });
    },
    onSuccess: () => {
      if (!devPreview) toast.success("name saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function sendReset() {
    if (devPreview) {
      toast.message("preview mode — reset email is not sent");
      return;
    }
    setResetting(true);
    try {
      await sendStudioLetter({ data: { email: profile.email, kind: "reset" } });
      toast.success("password reset sent.");
    } catch {
      toast.error("we couldn't send the reset email.");
    } finally {
      setResetting(false);
    }
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invite.mutate({ email, role });
  }

  function showForm(next: InquiryEditorTab) {
    const stored = storeTab(drafts, formTab, formQuestions);
    setDrafts(stored);
    setFormTab(next);
    setFormQuestions(questionsFor(next, stored));
  }

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = storeTab(drafts, formTab, formQuestions);
    setDrafts(next);
    setFormQuestions(questionsFor(formTab, next));
    writeInquiryDrafts(next);
    setSavingForm(true);
    try {
      if (!devPreview) await saveForms({ data: next });
      toast.success("form saved");
    } catch {
      toast.error("the form could not save.");
    } finally {
      setSavingForm(false);
    }
  }

  const connections = data?.connections ?? [];
  const members = data?.members ?? [];
  const pendingInvites = data?.invites ?? [];
  const failedEvents = data?.failedEvents ?? [];

  const accountBlock = (
    <section className="studio-panel">
      <div className="studio-connect-list studio-account">
        <div className="studio-connect-row studio-account-name">
          <label className="studio-field">
            <span>name</span>
            <input
              className="studio-input"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              autoComplete="name"
            />
          </label>
          <div className="studio-connect-go">
            <button
              type="button"
              className="studio-today-go"
              disabled={!accountName.trim() || rename.isPending}
              onClick={() => rename.mutate(accountName.trim())}
            >
              {rename.isPending ? "saving…" : "save name"}
            </button>
          </div>
        </div>
        <div className="studio-connect-row">
          <div>
            <b>email</b>
            <p>used to sign in.</p>
          </div>
          <span className="studio-account-value">{profile.email}</span>
        </div>
        <div className="studio-connect-row">
          <div>
            <b>password</b>
            <p>a reset link goes to your email.</p>
          </div>
          <div className="studio-connect-go">
            <button
              type="button"
              className="studio-ghost"
              disabled={resetting}
              onClick={() => void sendReset()}
            >
              {resetting ? "sending…" : "reset password"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );

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
              ? ((gmail && "account_email" in gmail ? gmail.account_email : null) ??
                (stored?.metadata &&
                typeof stored.metadata === "object" &&
                !Array.isArray(stored.metadata) &&
                "account_email" in stored.metadata &&
                typeof stored.metadata["account_email"] === "string"
                  ? stored.metadata["account_email"]
                  : null))
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
                  onClick={() =>
                    provider.id === "square" ? squareOAuth.mutate() : googleOAuth.mutate()
                  }
                >
                  {pending &&
                  (provider.id === "square" ? squareOAuth.isPending : googleOAuth.isPending)
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
          <p className="studio-kicker">the studio</p>
          <h2>invite someone in</h2>
          <p>
            an invitation emails a link that lasts 7 days. they set a password and join this studio.
            team can work the book. an admin can also change settings and invite others.
          </p>
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
          <select
            className="studio-select"
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "team")}
          >
            <option value="team">team — works the book</option>
            <option value="admin">admin — settings and invites too</option>
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
              <StudioChip tone={member.active ? "soft" : "due"}>
                {member.active ? member.role : "inactive"}
              </StudioChip>
              {member.active && member.id !== profile.id ? (
                <button
                  type="button"
                  className="studio-ghost"
                  disabled={removeMember.isPending}
                  onClick={() => removeMember.mutate(member.id)}
                >
                  deactivate
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const formsBlock = (
    <section className="studio-panel">
      <div className="studio-form-tabs" role="tablist" aria-label="forms">
        {formTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={formTab === tab.id}
            className={formTab === tab.id ? "is-on" : undefined}
            onClick={() => showForm(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <form className="studio-stack" onSubmit={saveForm}>
        {formQuestions.map((question) => (
          <div key={question.id} className="studio-form-question">
            <div className="studio-ask-grid is-two">
              <label className="studio-field">
                <span>question</span>
                <input
                  className="studio-input"
                  value={question.label}
                  onChange={(event) =>
                    setFormQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id
                          ? { ...item, label: event.target.value.toLowerCase() }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="studio-field">
                <span>note</span>
                <input
                  className="studio-input"
                  value={question.hint}
                  onChange={(event) =>
                    setFormQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id
                          ? { ...item, hint: event.target.value.toLowerCase() }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
            {question.options.length ? (
              <div className="studio-ask-grid is-two">
                {question.options.map((option) => (
                  <label key={option.value} className="studio-field">
                    <span>choice</span>
                    <input
                      className="studio-input"
                      value={option.label}
                      onChange={(event) =>
                        setFormQuestions((current) =>
                          current.map((item) =>
                            item.id === question.id
                              ? {
                                  ...item,
                                  options: item.options.map((choice) =>
                                    choice.value === option.value
                                      ? { ...choice, label: event.target.value.toLowerCase() }
                                      : choice,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button
          type="submit"
          className="studio-today-go"
          disabled={savingForm || formQuestions.some((question) => !question.label.trim())}
        >
          {savingForm ? "saving" : "save form"}
        </button>
      </form>
    </section>
  );

  const healthBlock = (
    <section className="studio-panel">
      <p className="studio-kicker">recent issues</p>
      {failedEvents.length ? (
        <div>
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
        <p className="studio-empty">no recent issues.</p>
      )}
    </section>
  );

  function panelFor(id: SettingsSection) {
    if (id === "account") return accountBlock;
    if (id === "forms") return formsBlock;
    if (isPending) return null;
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
          <p>{isAdmin ? "your account, connections, and who can come in." : "your account."}</p>
        </div>
      </header>

      <div className="studio-settings-index">
        {(isAdmin ? sections : sections.filter((item) => item.id === "account")).map((item) => {
          const isOpen = open === item.id;
          return (
            <section
              key={item.id}
              className={isOpen ? "studio-settings-fold is-open" : "studio-settings-fold"}
            >
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
