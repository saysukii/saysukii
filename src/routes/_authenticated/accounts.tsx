import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { archiveAccount, listAccounts, saveAccount, saveProject } from "@/lib/portal.functions";
import {
  Field,
  GlassCard,
  PageHeader,
  Pill,
  SoftButton,
  inputClass,
} from "@/components/portal/bits";
import { SERVICE_LINE_LABEL, SERVICE_LINES, STAGE_LABEL, formatDate, type Stage } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts & Projects — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Clients, prospects, and their projects across floral, wedding, and experiential work at Say Sukii.",
      },
      { property: "og:title", content: "Accounts & Projects — Say Sukii Portal" },
      { property: "og:description", content: "Clients, prospects, and their projects at Say Sukii." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountsPage,
});

const emptyAccount = {
  name: "",
  type: "prospect" as "prospect" | "client",
  tier: "standard" as "standard" | "high_value",
  contact_name: "",
  email: "",
  phone: "",
  notes: "",
};

function AccountsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listAccounts);
  const submitAccount = useServerFn(saveAccount);
  const submitProject = useServerFn(saveProject);
  const archive = useServerFn(archiveAccount);

  const [form, setForm] = useState(emptyAccount);
  const [projectFor, setProjectFor] = useState<string | null>(null);
  const [project, setProject] = useState({
    title: "",
    service_line: "floral" as (typeof SERVICE_LINES)[number],
    event_date: "",
    venue: "",
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => fetchAccounts(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createAccount = useMutation({
    mutationFn: (values: typeof emptyAccount) => submitAccount({ data: values }),
    onSuccess: () => {
      toast.success("Account saved");
      setForm(emptyAccount);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createProject = useMutation({
    mutationFn: (accountId: string) =>
      submitProject({
        data: {
          account_id: accountId,
          title: project.title,
          service_line: project.service_line,
          event_date: project.event_date || null,
          venue: project.venue || null,
        },
      }),
    onSuccess: () => {
      toast.success("Project added");
      setProject({ title: "", service_line: "floral", event_date: "", venue: "" });
      setProjectFor(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      toast.success("Account archived");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Relationships"
        title="Accounts & projects"
        description="Prospects and clients, with the projects attached to each. High-value accounts get flagged so the studio can lead with white-glove service."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <GlassCard className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xl font-light">New account</h2>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createAccount.mutate(form);
            }}
          >
            <Field label="Name">
              <input
                required
                className={inputClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Faena Hotel"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <select
                  className={inputClass}
                  value={form.type}
                  onChange={(event) =>
                    setForm({ ...form, type: event.target.value as typeof form.type })
                  }
                >
                  <option value="prospect">Prospect</option>
                  <option value="client">Client</option>
                </select>
              </Field>
              <Field label="Tier">
                <select
                  className={inputClass}
                  value={form.tier}
                  onChange={(event) =>
                    setForm({ ...form, tier: event.target.value as typeof form.tier })
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="high_value">High value</option>
                </select>
              </Field>
            </div>
            <Field label="Contact">
              <input
                className={inputClass}
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                placeholder="Camila Reyes"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                rows={3}
                className={inputClass}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Palette preferences, allergies, access notes…"
              />
            </Field>
            <SoftButton type="submit" variant="primary" disabled={createAccount.isPending}>
              {createAccount.isPending ? "Saving" : "Save account"}
            </SoftButton>
          </form>
        </GlassCard>

        <div className="space-y-5 lg:col-span-3">
          {accounts.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-muted-foreground">
                No accounts yet. Add the first client or prospect on the left.
              </p>
            </GlassCard>
          ) : null}
          {accounts.map((account) => (
            <GlassCard key={account.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-light">{account.name}</h3>
                    {account.tier === "high_value" ? <Pill tone="rose">High value</Pill> : null}
                    <Pill>{account.type}</Pill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[account.contact_name, account.email, account.phone]
                      .filter(Boolean)
                      .join(" · ") || "No contact details yet"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <SoftButton
                    onClick={() => setProjectFor(projectFor === account.id ? null : account.id)}
                  >
                    Add project
                  </SoftButton>
                  <SoftButton variant="ghost" onClick={() => archiveMutation.mutate(account.id)}>
                    Archive
                  </SoftButton>
                </div>
              </div>

              {account.notes ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{account.notes}</p>
              ) : null}

              {(account.projects ?? []).length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(account.projects ?? []).map((item) => (
                    <div key={item.id} className="neu rounded-2xl px-4 py-3">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {SERVICE_LINE_LABEL[item.service_line as keyof typeof SERVICE_LINE_LABEL]} ·{" "}
                        {formatDate(item.event_date)}
                      </p>
                      <p className="mt-2 text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
                        {STAGE_LABEL[item.stage as Stage] ?? item.stage}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {projectFor === account.id ? (
                <form
                  className="mt-5 grid gap-4 border-t border-border/60 pt-5 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createProject.mutate(account.id);
                  }}
                >
                  <Field label="Project title">
                    <input
                      required
                      className={inputClass}
                      value={project.title}
                      onChange={(event) => setProject({ ...project, title: event.target.value })}
                      placeholder="Rooftop launch dinner"
                    />
                  </Field>
                  <Field label="Service line">
                    <select
                      className={inputClass}
                      value={project.service_line}
                      onChange={(event) =>
                        setProject({
                          ...project,
                          service_line: event.target.value as typeof project.service_line,
                        })
                      }
                    >
                      {SERVICE_LINES.map((line) => (
                        <option key={line} value={line}>
                          {SERVICE_LINE_LABEL[line]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Event date">
                    <input
                      type="date"
                      className={inputClass}
                      value={project.event_date}
                      onChange={(event) => setProject({ ...project, event_date: event.target.value })}
                    />
                  </Field>
                  <Field label="Venue">
                    <input
                      className={inputClass}
                      value={project.venue}
                      onChange={(event) => setProject({ ...project, venue: event.target.value })}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <SoftButton type="submit" variant="primary" disabled={createProject.isPending}>
                      {createProject.isPending ? "Adding" : "Add project"}
                    </SoftButton>
                  </div>
                </form>
              ) : null}
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}
