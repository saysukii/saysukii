import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";

import { generateProposalSet, listProjects, listRateCard } from "@/lib/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Field, GlassCard, PageHeader, Pill, SoftButton, inputClass } from "@/components/portal/bits";
import { AGREEMENT_TYPE_LABEL, type AgreementType } from "@/lib/agreement-templates";
import { SERVICE_LINE_LABEL, formatMoney, formatDate, lineTotalCents } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Proposal Studio — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Build a Say Sukii proposal, agreement, and invoice as one linked set: scope, essence board, and deposit terms.",
      },
      { property: "og:title", content: "Proposal Studio — Say Sukii Portal" },
      {
        property: "og:description",
        content: "Build a proposal, agreement, and invoice as one linked, branded set.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioPage,
});

type DraftLine = { key: string; rate_card_item_id: string; qty: string };

function StudioPage() {
  const router = useRouter();
  const fetchProjects = useServerFn(listProjects);
  const fetchRateCard = useServerFn(listRateCard);
  const generate = useServerFn(generateProposalSet);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });
  const { data: rateCard = [] } = useQuery({
    queryKey: ["rate-card"],
    queryFn: () => fetchRateCard(),
  });

  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [agreementType, setAgreementType] = useState<AgreementType>("standard");
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">("deposit");
  const [dueDate, setDueDate] = useState("");
  const [essence, setEssence] = useState<Array<{ path: string; preview: string }>>([]);
  const [uploading, setUploading] = useState(false);

  const project = projects.find((item) => item.id === projectId);
  const priceById = useMemo(
    () => new Map(rateCard.map((item) => [item.id, item])),
    [rateCard],
  );

  const priced = lines.map((line) => {
    const item = priceById.get(line.rate_card_item_id);
    const qty = Number.parseFloat(line.qty) || 0;
    const unit = item?.unit_price_cents ?? 0;
    return { ...line, item, qty, unit, total: lineTotalCents(qty, unit) };
  });
  const subtotal = priced.reduce((sum, line) => sum + line.total, 0);
  const deposit = paymentOption === "deposit" ? Math.round(subtotal / 2) : subtotal;

  function addLine() {
    const first = rateCard[0];
    if (!first) {
      toast.error("Add rate card items first");
      return;
    }
    setLines((current) => [
      ...current,
      { key: crypto.randomUUID(), rate_card_item_id: first.id, qty: "1" },
    ]);
  }

  async function uploadEssence(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error } = await supabase.storage.from("essence-images").upload(path, file);
        if (error) throw error;
        setEssence((current) => [...current, { path, preview: URL.createObjectURL(file) }]);
      }
      toast.success("Essence images added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const build = useMutation({
    mutationFn: () =>
      generate({
        data: {
          project_id: projectId,
          agreement_type: agreementType,
          payment_option: paymentOption,
          due_date: dueDate || null,
          essence_image_paths: essence.map((item) => item.path),
          line_items: priced.map((line) => ({
            rate_card_item_id: line.rate_card_item_id,
            name: line.item?.name ?? "Line item",
            qty: line.qty,
          })),
        },
      }),
    onSuccess: async (result) => {
      toast.success(`${result.number} created with invoice ${result.invoice_number}`);
      await router.navigate({ to: "/proposals/$id", params: { id: result.proposal_id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canBuild = Boolean(projectId) && priced.length > 0 && subtotal > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Proposal Studio"
        title="Build the set"
        description="One pass produces three linked documents: a numbered proposal, a versioned agreement, and an invoice with deposit terms."
        actions={
          <SoftButton
            variant="primary"
            disabled={!canBuild || build.isPending}
            onClick={() => build.mutate()}
          >
            {build.isPending ? "Generating" : "Generate documents"}
          </SoftButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <GlassCard>
            <h2 className="text-xl font-light">1 · The engagement</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Project" className="sm:col-span-2">
                <select
                  className={inputClass}
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">Select a project…</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.accounts?.name} — {item.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {project ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Pill>
                  {SERVICE_LINE_LABEL[project.service_line as keyof typeof SERVICE_LINE_LABEL]}
                </Pill>
                {project.accounts?.tier === "high_value" ? <Pill tone="rose">High value</Pill> : null}
                <span className="text-xs text-muted-foreground">
                  {formatDate(project.event_date)} · {project.venue ?? "Venue TBC"}
                </span>
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Projects come from Accounts. Add one there if the engagement isn't listed.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-light">2 · Scope</h2>
              <SoftButton onClick={addLine}>
                <Plus className="size-3.5" /> Add line
              </SoftButton>
            </div>

            {priced.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                No lines yet. Pull items from the rate card — pricing is resolved server-side at
                generation, so totals always match the studio rate card.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {priced.map((line) => (
                  <div
                    key={line.key}
                    className="neu flex flex-wrap items-end gap-3 rounded-2xl px-4 py-4"
                  >
                    <div className="min-w-[14rem] flex-1">
                      <span className="eyebrow">Item</span>
                      <select
                        className={`${inputClass} mt-2`}
                        value={line.rate_card_item_id}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.key === line.key
                                ? { ...entry, rate_card_item_id: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      >
                        {rateCard.map((item) => (
                          <option key={item.id} value={item.id}>
                            {SERVICE_LINE_LABEL[item.service_line as keyof typeof SERVICE_LINE_LABEL]}
                            {" · "}
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <span className="eyebrow">Qty</span>
                      <input
                        className={`${inputClass} mt-2`}
                        value={line.qty}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.key === line.key
                                ? { ...entry, qty: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="w-28">
                      <span className="eyebrow">Rate</span>
                      <p className="mt-4 text-sm text-muted-foreground">{formatMoney(line.unit)}</p>
                    </div>
                    <div className="w-28 text-right">
                      <span className="eyebrow">Total</span>
                      <p className="display-number mt-3 text-lg">{formatMoney(line.total)}</p>
                    </div>
                    <button
                      aria-label="Remove line"
                      onClick={() =>
                        setLines((current) => current.filter((entry) => entry.key !== line.key))
                      }
                      className="mb-2 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-light">3 · Essence board</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Reference imagery that sets palette and mood. Stored privately with the proposal.
            </p>
            <label className="neu bloom-glow mt-5 flex cursor-pointer items-center justify-center gap-3 rounded-2xl px-6 py-8 text-sm text-muted-foreground transition-transform duration-300 hover:-translate-y-0.5">
              <Upload className="size-4" />
              {uploading ? "Uploading…" : "Add images"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void uploadEssence(event.target.files)}
              />
            </label>
            {essence.length > 0 ? (
              <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {essence.map((image) => (
                  <div key={image.path} className="group relative overflow-hidden rounded-2xl">
                    <img src={image.preview} alt="" className="aspect-square w-full object-cover" />
                    <button
                      onClick={() =>
                        setEssence((current) => current.filter((item) => item.path !== image.path))
                      }
                      className="glass absolute right-2 top-2 rounded-full p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="xl:sticky xl:top-6">
            <h2 className="text-xl font-light">4 · Terms</h2>
            <div className="mt-6 space-y-4">
              <Field label="Agreement">
                <select
                  className={inputClass}
                  value={agreementType}
                  onChange={(event) => setAgreementType(event.target.value as AgreementType)}
                >
                  {(Object.keys(AGREEMENT_TYPE_LABEL) as AgreementType[]).map((type) => (
                    <option key={type} value={type}>
                      {AGREEMENT_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { value: "deposit", label: "50% deposit" },
                      { value: "full", label: "Paid in full" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPaymentOption(option.value)}
                      className={`rounded-2xl px-4 py-3 text-xs font-semibold tracking-[0.1em] uppercase transition-all ${
                        paymentOption === option.value
                          ? "bg-primary text-primary-foreground"
                          : "neu text-muted-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Invoice due date">
                <input
                  type="date"
                  className={inputClass}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </div>

            <div className="mt-7 border-t border-border/60 pt-6">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Subtotal</span>
                <span className="text-sm">{formatMoney(subtotal)}</span>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="eyebrow">Investment</span>
                <span className="display-number text-3xl">{formatMoney(subtotal)}</span>
              </div>
              {paymentOption === "deposit" ? (
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Deposit now (50%)</span>
                    <span>{formatMoney(deposit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Balance before event</span>
                    <span>{formatMoney(subtotal - deposit)}</span>
                  </div>
                </div>
              ) : null}
              <SoftButton
                variant="primary"
                className="mt-7 w-full py-3"
                disabled={!canBuild || build.isPending}
                onClick={() => build.mutate()}
              >
                {build.isPending ? "Generating" : "Generate documents"}
              </SoftButton>
              {!canBuild ? (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Pick a project and at least one priced line.
                </p>
              ) : null}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
