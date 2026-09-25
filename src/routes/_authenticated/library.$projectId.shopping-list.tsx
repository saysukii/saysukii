import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Printer } from "lucide-react";

import { EmptyState, GlassCard, PageHeader, Pill, SoftButton } from "@/components/portal/bits";
import { getDevPreviewShoppingList } from "@/lib/dev-preview";
import { getProjectShoppingList } from "@/lib/os/library.functions";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/library/$projectId/shopping-list")({
  head: () => ({
    meta: [
      { title: "Project Shopping List — Say Sukii OS" },
      {
        name: "description",
        content: "Printable stem shopping list grouped by vendor for a Say Sukii project.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectShoppingListPage,
});

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatQuantity(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatCost(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ProjectShoppingListPage() {
  const { projectId } = Route.useParams();
  const devPreview = useDevPreview();
  const fetchShoppingList = useServerFn(getProjectShoppingList);
  const { data, isPending, error } = useQuery({
    queryKey: ["project-shopping-list", projectId, devPreview],
    queryFn: () =>
      devPreview
        ? getDevPreviewShoppingList(projectId)
        : fetchShoppingList({ data: { project_id: projectId } }),
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Preparing the stem order…</p>;
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader
          eyebrow="Production"
          title="Shopping list unavailable"
          description={error instanceof Error ? error.message : "This project could not be found."}
        />
        <a
          href="/library"
          className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground"
        >
          ← Back to library
        </a>
      </div>
    );
  }

  const itemCount = data.groups.reduce((count, group) => count + group.items.length, 0);
  const hasAnyCost = data.groups.some((group) =>
    group.items.some((item) => item.total_cost_cents !== null),
  );

  return (
    <div className="shopping-list-print">
      <style>{`
        @media print {
          @page { size: portrait; margin: 0.55in; }
          body { background: white !important; color: #181513 !important; }
          .portal-ground > header, .portal-ground aside, .print-hide { display: none !important; }
          .portal-ground, .portal-ground > div { min-height: 0 !important; background: white !important; }
          .portal-ground > div { display: block !important; max-width: none !important; padding: 0 !important; }
          .portal-ground main { padding: 0 !important; }
          .shopping-list-print .glass {
            background: white !important;
            border: 1px solid #d8d1cd !important;
            box-shadow: none !important;
          }
          .shopping-list-print section { break-inside: avoid; }
          .shopping-list-print table { font-size: 10pt; }
        }
      `}</style>

      <div className="print-hide mb-7 flex flex-wrap items-center justify-between gap-3">
        <a
          href="/library"
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Library
        </a>
        <SoftButton variant="primary" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print shopping list
        </SoftButton>
      </div>

      <PageHeader
        eyebrow="Project shopping list"
        title={data.project.event_name}
        description={`${data.project.client_name} · ${formatDate(data.project.event_date)}${
          data.project.venue_name ? ` · ${data.project.venue_name}` : ""
        }`}
        actions={
          <div className="flex gap-2">
            <Pill>{data.order?.status ?? "No order"}</Pill>
            <Pill tone="rose">
              {itemCount} {itemCount === 1 ? "line" : "lines"}
            </Pill>
          </div>
        }
      />

      {!data.order || itemCount === 0 ? (
        <EmptyState
          title="Nothing to order yet"
          body="This project has no order items. Its arrangement recipes may not have generated a stem order yet."
        />
      ) : (
        <div className="space-y-6">
          {data.groups.map((group) => (
            <section key={group.vendor_id ?? "unassigned"}>
              <GlassCard className="overflow-hidden p-0">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 px-5 py-5 sm:px-6">
                  <div>
                    <p className="eyebrow">Vendor</p>
                    <h2 className="mt-2 text-2xl font-light">{group.vendor_name}</h2>
                  </div>
                  {group.ordering_method ? (
                    <p className="max-w-sm text-right text-xs text-muted-foreground">
                      {group.ordering_method}
                    </p>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem] border-collapse text-left">
                    <thead>
                      <tr className="text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        <th className="w-12 px-5 py-3 sm:px-6">Done</th>
                        <th className="px-3 py-3">Stem</th>
                        <th className="px-3 py-3">Color</th>
                        <th className="px-3 py-3 text-right">Quantity</th>
                        <th className="px-3 py-3">Unit</th>
                        {hasAnyCost ? (
                          <>
                            <th className="px-3 py-3 text-right">Unit cost</th>
                            <th className="px-5 py-3 text-right sm:px-6">Est. total</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {group.items.map((item) => (
                        <tr key={item.key} className="text-sm">
                          <td className="px-5 py-4 sm:px-6">
                            <span
                              aria-label={item.received ? "Received" : "Not received"}
                              className={`inline-flex size-5 items-center justify-center rounded border ${
                                item.received
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background"
                              }`}
                            >
                              {item.received ? <Check className="size-3" /> : null}
                            </span>
                          </td>
                          <td className="px-3 py-4 font-medium">{item.label}</td>
                          <td className="px-3 py-4 text-muted-foreground">{item.color}</td>
                          <td className="display-number px-3 py-4 text-right">
                            {formatQuantity(item.quantity)}
                          </td>
                          <td className="px-3 py-4 text-muted-foreground">{item.unit ?? "—"}</td>
                          {hasAnyCost ? (
                            <>
                              <td className="display-number px-3 py-4 text-right text-muted-foreground">
                                {item.unit_cost_cents === null
                                  ? null
                                  : formatCost(item.unit_cost_cents)}
                              </td>
                              <td className="display-number px-5 py-4 text-right sm:px-6">
                                {item.total_cost_cents === null
                                  ? null
                                  : formatCost(item.total_cost_cents)}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </section>
          ))}

          {data.grand_total_cents !== null ? (
            <div className="flex items-baseline justify-end gap-6 border-t border-border pt-5">
              <span className="eyebrow">Estimated flower total</span>
              <span className="display-number text-2xl">{formatCost(data.grand_total_cents)}</span>
            </div>
          ) : null}
        </div>
      )}

      <footer className="mt-10 hidden border-t border-border pt-4 text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase print:block">
        Say Sukii OS · Printed {new Date().toLocaleDateString("en-US")}
      </footer>
    </div>
  );
}
