import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { archiveRateCardItem, listRateCard, saveRateCardItem } from "@/lib/portal.functions";
import { Field, GlassCard, PageHeader, SoftButton, inputClass } from "@/components/portal/bits";
import {
  SERVICE_LINES,
  SERVICE_LINE_LABEL,
  UNITS,
  formatMoney,
  parseDollarsToCents,
  type ServiceLine,
} from "@/lib/money";

export const Route = createFileRoute("/_authenticated/rate-card")({
  head: () => ({
    meta: [
      { title: "Rate Card — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Studio pricing for floral, wedding, and experiential services, used to build every Say Sukii proposal.",
      },
      { property: "og:title", content: "Rate Card — Say Sukii Portal" },
      { property: "og:description", content: "Studio pricing across floral, wedding, and experiential work." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RateCardPage,
});

function RateCardPage() {
  const queryClient = useQueryClient();
  const fetchItems = useServerFn(listRateCard);
  const saveItem = useServerFn(saveRateCardItem);
  const archive = useServerFn(archiveRateCardItem);

  const [draft, setDraft] = useState({
    service_line: "floral" as ServiceLine,
    name: "",
    description: "",
    unit: "each" as (typeof UNITS)[number],
    price: "",
  });
  const [editing, setEditing] = useState<Record<string, string>>({});

  const { data: items = [] } = useQuery({ queryKey: ["rate-card"], queryFn: () => fetchItems() });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["rate-card"] });

  const create = useMutation({
    mutationFn: () =>
      saveItem({
        data: {
          service_line: draft.service_line,
          name: draft.name,
          description: draft.description || null,
          unit: draft.unit,
          unit_price_cents: parseDollarsToCents(draft.price),
        },
      }),
    onSuccess: () => {
      toast.success("Rate card item added");
      setDraft({ ...draft, name: "", description: "", price: "" });
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updatePrice = useMutation({
    mutationFn: (args: { id: string; item: (typeof items)[number]; price: string }) =>
      saveItem({
        data: {
          id: args.id,
          service_line: args.item.service_line as ServiceLine,
          name: args.item.name,
          description: args.item.description,
          unit: args.item.unit as (typeof UNITS)[number],
          unit_price_cents: parseDollarsToCents(args.price),
        },
      }),
    onSuccess: () => {
      toast.success("Price updated");
      setEditing({});
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveItem = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      toast.success("Item archived");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Pricing"
        title="Rate card"
        description="The single source of truth for proposal pricing. Every line item pulled into a proposal is priced from here, server-side."
      />

      <GlassCard className="mb-6">
        <h2 className="text-xl font-light">Add an item</h2>
        <form
          className="mt-6 grid gap-4 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Service line">
            <select
              className={inputClass}
              value={draft.service_line}
              onChange={(event) =>
                setDraft({ ...draft, service_line: event.target.value as ServiceLine })
              }
            >
              {SERVICE_LINES.map((line) => (
                <option key={line} value={line}>
                  {SERVICE_LINE_LABEL[line]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name" className="md:col-span-2">
            <input
              required
              className={inputClass}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Suspended orchid cloud"
            />
          </Field>
          <Field label="Unit">
            <select
              className={inputClass}
              value={draft.unit}
              onChange={(event) =>
                setDraft({ ...draft, unit: event.target.value as typeof draft.unit })
              }
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (USD)">
            <input
              required
              className={inputClass}
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
              placeholder="1850"
            />
          </Field>
          <Field label="Description" className="md:col-span-4">
            <input
              className={inputClass}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="How this reads on the proposal"
            />
          </Field>
          <div className="flex items-end">
            <SoftButton type="submit" variant="primary" disabled={create.isPending}>
              Add
            </SoftButton>
          </div>
        </form>
      </GlassCard>

      <div className="space-y-6">
        {SERVICE_LINES.map((line) => {
          const lineItems = items.filter((item) => item.service_line === line);
          if (lineItems.length === 0) return null;
          return (
            <GlassCard key={line}>
              <h2 className="text-xl font-light">{SERVICE_LINE_LABEL[line]}</h2>
              <div className="mt-5 divide-y divide-border/60">
                {lineItems.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      ) : null}
                      <p className="mt-1 text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
                        per {item.unit}
                      </p>
                    </div>
                    {editing[item.id] !== undefined ? (
                      <div className="flex items-center gap-2">
                        <input
                          className={`${inputClass} w-28 py-2`}
                          value={editing[item.id]}
                          onChange={(event) =>
                            setEditing({ ...editing, [item.id]: event.target.value })
                          }
                        />
                        <SoftButton
                          variant="primary"
                          onClick={() =>
                            updatePrice.mutate({
                              id: item.id,
                              item,
                              price: editing[item.id] ?? "0",
                            })
                          }
                        >
                          Save
                        </SoftButton>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setEditing({ [item.id]: String(item.unit_price_cents / 100) })
                        }
                        className="display-number text-lg transition-opacity hover:opacity-60"
                      >
                        {formatMoney(item.unit_price_cents)}
                      </button>
                    )}
                    <SoftButton variant="ghost" onClick={() => archiveItem.mutate(item.id)}>
                      Archive
                    </SoftButton>
                  </div>
                ))}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
