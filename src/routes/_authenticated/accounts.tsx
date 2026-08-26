import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { archiveAccount, listAccounts, saveAccount, saveProject } from "@/lib/portal.functions";
import { Field, PageHeader, Pill, SoftButton, inputClass } from "@/components/portal/bits";
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

type AccountForm = {
  id?: string;
  name: string;
  type: "prospect" | "client";
  tier: "standard" | "high_value";
  contact_name: string;
  email: string;
  phone: string;
  notes: string;
};

const emptyAccount: AccountForm = {
  name: "",
  type: "prospect",
  tier: "standard",
  contact_name: "",
  email: "",
  phone: "",
  notes: "",
};

const panelClass = "rounded-2xl border border-border bg-card";

function AccountsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listAccounts);
  const submitAccount = useServerFn(saveAccount);
  const submitProject = useServerFn(saveProject);
  const archive = useServerFn(archiveAccount);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [project, setProject] = useState({
    title: "",
    service_line: "floral" as (typeof SERVICE_LINES)[number],
    event_date: "",
    venue: "",
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => fetchAccounts(),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter((account) =>
      [account.name, account.contact_name, account.email, account.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [accounts, search]);

  const selected = accounts.find((account) => account.id === selectedId) ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: AccountForm) =>
      submitAccount({
        data: {
          ...(values.id ? { id: values.id } : {}),
          name: values.name,
          type: values.type,
          tier: values.tier,
          contact_name: values.contact_name,
          email: values.email,
          phone: values.phone,
          notes: values.notes,
        },
      }),
    onSuccess: (row) => {
      toast.success(form?.id ? "Account updated" : "Account created");
      setForm(null);
      if (row && typeof row === "object" && "id" in row) setSelectedId(String(row.id));
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
      setProjectOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      toast.success("Account archived");
      setSelectedId(null);
      setForm(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Relationships"
        title="Accounts"
        description="Prospects and clients, with the projects attached to each."
        actions={
          <SoftButton
            variant="primary"
            onClick={() => {
              setForm({ ...emptyAccount });
              setSelectedId(null);
            }}
          >
            New account
          </SoftButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <input
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, contact, email…"
            aria-label="Search accounts"
          />

          <div className={`${panelClass} divide-y divide-border overflow-hidden`}>
            {isLoading ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Loading accounts…</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {accounts.length === 0
                  ? "No accounts yet. Create the first one."
                  : "No accounts match that search."}
              </p>
            ) : (
              filtered.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(account.id);
                    setForm(null);
                    setProjectOpen(false);
                  }}
                  className={`flex w-full flex-col items-start gap-1.5 px-4 py-3.5 text-left transition-colors hover:bg-accent ${
                    selectedId === account.id ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{account.name}</span>
                    {account.tier === "high_value" ? <Pill tone="rose">High value</Pill> : null}
                  </div>
                  <span className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                    {account.type}
                    {(account.projects ?? []).length > 0
                      ? ` · ${(account.projects ?? []).length} project${(account.projects ?? []).length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {form ? (
            <form
              className={`${panelClass} space-y-4 p-6`}
              onSubmit={(event) => {
                event.preventDefault();
                saveMutation.mutate(form);
              }}
            >
              <h2 className="text-xl font-light">{form.id ? "Edit account" : "New account"}</h2>
              <Field label="Name">
                <input
                  required
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Faena Hotel"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type">
                  <select
                    className={inputClass}
                    value={form.type}
                    onChange={(event) =>
                      setForm({ ...form, type: event.target.value as AccountForm["type"] })
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
                      setForm({ ...form, tier: event.target.value as AccountForm["tier"] })
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
              <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="flex gap-3">
                <SoftButton type="submit" variant="primary" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving" : "Save account"}
                </SoftButton>
                <SoftButton type="button" variant="ghost" onClick={() => setForm(null)}>
                  Cancel
                </SoftButton>
              </div>
            </form>
          ) : selected ? (
            <div className={`${panelClass} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-light">{selected.name}</h2>
                    {selected.tier === "high_value" ? <Pill tone="rose">High value</Pill> : null}
                    <Pill>{selected.type}</Pill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[selected.contact_name, selected.email, selected.phone]
                      .filter(Boolean)
                      .join(" · ") || "No contact details yet"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <SoftButton
                    onClick={() =>
                      setForm({
                        id: selected.id,
                        name: selected.name,
                        type: selected.type as AccountForm["type"],
                        tier: selected.tier as AccountForm["tier"],
                        contact_name: selected.contact_name ?? "",
                        email: selected.email ?? "",
                        phone: selected.phone ?? "",
                        notes: selected.notes ?? "",
                      })
                    }
                  >
                    Edit
                  </SoftButton>
                  <SoftButton variant="ghost" onClick={() => archiveMutation.mutate(selected.id)}>
                    Archive
                  </SoftButton>
                </div>
              </div>

              {selected.notes ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{selected.notes}</p>
              ) : null}

              <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
                <p className="eyebrow">Projects</p>
                <SoftButton onClick={() => setProjectOpen((open) => !open)}>Add project</SoftButton>
              </div>

              {(selected.projects ?? []).length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No projects attached yet.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(selected.projects ?? []).map((item) => (
                    <div key={item.id} className="rounded-xl border border-border px-4 py-3">
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
              )}

              {projectOpen ? (
                <form
                  className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createProject.mutate(selected.id);
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
            </div>
          ) : (
            <div className={`${panelClass} px-8 py-16 text-center`}>
              <p className="text-lg font-light text-foreground">Select an account</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Choose an account from the list to see its details and projects, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
