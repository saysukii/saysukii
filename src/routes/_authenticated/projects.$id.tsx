import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  Pill,
  SoftButton,
  inputClass,
} from "@/components/portal/bits";
import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import type { OrderStatus, ProjectStatus } from "@/integrations/supabase/types";
import {
  getProject,
  setOrderItemReceived,
  setOrderStatus,
  updateProject,
} from "@/lib/os/projects.functions";
import { getDevPreviewProject } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({
    meta: [{ title: "Project — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectDetailPage,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const fetchProject = useServerFn(getProject);
  const submitProject = useServerFn(updateProject);
  const submitOrderStatus = useServerFn(setOrderStatus);
  const toggleReceived = useServerFn(setOrderItemReceived);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    event_name: "",
    event_date: "",
    venue_id: "",
    venue_text: "",
    status: "pre_production" as ProjectStatus,
    notes: "",
  });

  const { data, isPending } = useQuery({
    queryKey: ["os", "project", id, devPreview],
    queryFn: () => (devPreview ? getDevPreviewProject(id) : fetchProject({ data: { id } })),
  });

  useEffect(() => {
    if (!data?.project) return;
    setForm({
      event_name: data.project.event_name,
      event_date: data.project.event_date,
      venue_id: data.project.venue_id ?? "",
      venue_text: data.project.venue_text ?? "",
      status: data.project.status,
      notes: data.project.notes ?? "",
    });
  }, [data?.project]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["os", "project", id] });

  const save = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — project not saved");
        return Promise.resolve(data?.project);
      }
      return submitProject({ data: { id, ...form } });
    },
    onSuccess: () => {
      toast.success("Project updated");
      setEditing(false);
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["os", "projects"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const orderState = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      if (devPreview) {
        toast.message("Preview mode — order not updated");
        return Promise.resolve(data?.order);
      }
      return submitOrderStatus({ data: { id: orderId, status } });
    },
    onSuccess: () => {
      toast.success("Floral order updated");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const receive = useMutation({
    mutationFn: ({ itemId, received }: { itemId: string; received: boolean }) => {
      if (devPreview) {
        toast.message("Preview mode — receipt not saved");
        return Promise.resolve({ ok: true as const });
      }
      return toggleReceived({ data: { id: itemId, received } });
    },
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const shoppingGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        vendor: { name: string; ordering_method: string | null } | null;
        items: NonNullable<typeof data>["order_items"];
      }
    >();
    for (const item of data?.order_items ?? []) {
      const key = item.vendor_id ?? "unassigned";
      const group = groups.get(key) ?? { vendor: item.vendor, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [data]);

  if (isPending)
    return <p className="text-sm text-muted-foreground">Loading production details…</p>;
  if (!data)
    return <EmptyState title="Project unavailable" body="This project could not be found." />;

  const isAdmin = data.role === "admin";
  const { project, admin, arrangements, files, order, venue } = data;
  const receivedCount = data.order_items.filter((item) => item.received).length;

  return (
    <div>
      <Link
        to="/projects"
        className="text-xs tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground"
      >
        ← Projects
      </Link>
      <PageHeader
        eyebrow={project.status.replaceAll("_", " ")}
        title={project.event_name}
        description={`${formatDate(project.event_date)} · ${venue?.name ?? project.venue_text ?? "Venue TBD"}`}
        actions={
          <>
            <SoftButton onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print production sheet
            </SoftButton>
            {isAdmin ? (
              <SoftButton variant="primary" onClick={() => setEditing((open) => !open)}>
                {editing ? "Close editor" : "Edit project"}
              </SoftButton>
            ) : null}
          </>
        }
      />

      {editing && isAdmin ? (
        <GlassCard className="mb-6 print:hidden">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Event name">
              <input
                required
                className={inputClass}
                value={form.event_name}
                onChange={(event) => setForm({ ...form, event_name: event.target.value })}
              />
            </Field>
            <div>
              <span className="eyebrow">Event date</span>
              <div className="mt-2">
                <InquiryDatePicker
                  compact
                  withTime={false}
                  allowPast
                  value={form.event_date || null}
                  placeholder="Select a date"
                  onChange={(next) => setForm({ ...form, event_date: next ?? "" })}
                />
              </div>
            </div>
            <Field label="Status">
              <select
                className={inputClass}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as ProjectStatus })
                }
              >
                <option value="pre_production">Pre-production</option>
                <option value="production">Production</option>
                <option value="post_production">Post-production</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Venue text">
              <input
                className={inputClass}
                value={form.venue_text}
                onChange={(event) => setForm({ ...form, venue_text: event.target.value })}
                placeholder="Used when no directory venue is selected"
              />
            </Field>
            <Field label="Production notes" className="md:col-span-2">
              <textarea
                rows={6}
                className={inputClass}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <div className="md:col-span-2">
              <SoftButton type="submit" variant="primary" disabled={save.isPending}>
                {save.isPending ? "Saving" : "Save project"}
              </SoftButton>
            </div>
          </form>
        </GlassCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <GlassCard>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-light">Accepted arrangements</h2>
              <Pill>{arrangements.length} lines</Pill>
            </div>
            <div className="mt-5 space-y-3">
              {arrangements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No arrangement lines were copied from the accepted proposal.
                </p>
              ) : (
                arrangements.map((arrangement) => (
                  <div
                    key={arrangement.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4"
                  >
                    <p className="text-sm font-medium">{arrangement.label}</p>
                    <span className="display-number text-lg">× {arrangement.quantity}</span>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-light">Floral order</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {receivedCount} of {data.order_items.length} lines received
                </p>
              </div>
              {order ? (
                isAdmin ? (
                  <select
                    aria-label="Floral order status"
                    className={`${inputClass} w-auto min-w-40`}
                    value={order.status}
                    disabled={orderState.isPending}
                    onChange={(event) =>
                      orderState.mutate({
                        orderId: order.id,
                        status: event.target.value as OrderStatus,
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="ordered">Ordered</option>
                    <option value="received">Received</option>
                  </select>
                ) : (
                  <Pill>{order.status}</Pill>
                )
              ) : null}
            </div>

            {!order || shoppingGroups.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">No floral order lines.</p>
            ) : (
              <div className="mt-6 space-y-6">
                {shoppingGroups.map((group, groupIndex) => (
                  <section key={`${group.vendor?.name ?? "supplier"}-${groupIndex}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="eyebrow">
                          {isAdmin
                            ? (group.vendor?.name ?? "Unassigned")
                            : `Shopping group ${groupIndex + 1}`}
                        </p>
                        {isAdmin && group.vendor?.ordering_method ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {group.vendor.ordering_method}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border">
                      {group.items.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-4 bg-card px-4 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={item.received}
                            disabled={receive.isPending}
                            onChange={(event) =>
                              receive.mutate({
                                itemId: item.id,
                                received: event.target.checked,
                              })
                            }
                            className="size-4 accent-primary"
                          />
                          <span
                            className={item.received ? "flex-1 line-through opacity-60" : "flex-1"}
                          >
                            <span className="block text-sm">
                              {item.manual_label ?? item.stem?.common_name ?? "Custom floral item"}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {[item.stem?.variety, item.color ?? item.stem?.color]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="display-number text-sm">
                            {item.quantity} {item.unit ?? ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </GlassCard>

          {project.notes ? (
            <GlassCard>
              <h2 className="text-xl font-light">Production notes</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {project.notes}
              </p>
            </GlassCard>
          ) : null}
        </div>

        <div className="space-y-6">
          {isAdmin && admin ? (
            <GlassCard>
              <h2 className="text-xl font-light">Client & financials</h2>
              <div className="mt-5 space-y-4">
                <div>
                  <p className="eyebrow">Client</p>
                  <p className="mt-2 text-sm font-medium">{admin.client?.name ?? "Client"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[admin.client?.organization, admin.client?.email, admin.client?.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {admin.proposal ? (
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="eyebrow">Proposal</p>
                        <Link
                          to="/proposals/$id"
                          params={{ id: admin.proposal.id }}
                          className="mt-2 block text-sm font-medium hover:underline"
                        >
                          {admin.proposal.number}
                        </Link>
                      </div>
                      <Pill>{admin.proposal.status}</Pill>
                    </div>
                    <dl className="mt-4 space-y-2 text-sm">
                      <MoneyRow label="Subtotal" value={admin.proposal.subtotal_cents} />
                      <MoneyRow label="Tax" value={admin.proposal.tax_cents} />
                      <MoneyRow label="Accepted total" value={admin.proposal.total_cents} />
                      <MoneyRow label="Deposit" value={admin.proposal.deposit_amount_cents} />
                    </dl>
                  </div>
                ) : null}
                <div className="border-t border-border pt-4">
                  <p className="eyebrow">Invoices</p>
                  {admin.invoices.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No invoice recorded.</p>
                  ) : (
                    admin.invoices.map((invoice) => (
                      <div key={invoice.id} className="mt-3 flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          {invoice.number} · {invoice.status}
                        </span>
                        <span className="display-number">{formatMoney(invoice.amount_cents)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border pt-4">
                  <p className="eyebrow">Payments</p>
                  {admin.payments.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No payments recorded.</p>
                  ) : (
                    admin.payments.map((payment) => (
                      <div key={payment.id} className="mt-3 flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          {payment.status} · {formatDate(payment.paid_at)}
                        </span>
                        <span className="display-number">{formatMoney(payment.amount_cents)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          ) : null}

          {venue ? (
            <GlassCard>
              <h2 className="text-xl font-light">Venue & load-in</h2>
              <p className="mt-4 text-sm font-medium">{venue.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{venue.address}</p>
              {venue.load_in_notes ? (
                <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
                  {venue.load_in_notes}
                </p>
              ) : null}
            </GlassCard>
          ) : null}

          <GlassCard>
            <h2 className="text-xl font-light">Project files</h2>
            <div className="mt-5 space-y-3">
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No project files.</p>
              ) : (
                files.map((file) => (
                  <a
                    key={file.id}
                    href={file.signed_url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-border p-4 hover:bg-accent"
                  >
                    <p className="truncate text-sm">{file.file_path.split("/").at(-1)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {file.file_type || "File"} · {formatDate(file.created_at)}
                    </p>
                  </a>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="display-number">{formatMoney(value)}</dd>
    </div>
  );
}
