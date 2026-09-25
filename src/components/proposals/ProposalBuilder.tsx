import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Field,
  GlassCard,
  PageHeader,
  Pill,
  SoftButton,
  inputClass,
} from "@/components/portal/bits";
import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import { supabase } from "@/integrations/supabase/client";
import type {
  ArrangementRow,
  ClientRow,
  InquiryRow,
  ProposalItemKind,
  VenueRow,
} from "@/integrations/supabase/types";
import { formatMoneyExact, lineTotalCents, parseDollarsToCents } from "@/lib/money";
import { getDevPreviewProposalBuilderData, PREVIEW_IDS } from "@/lib/dev-preview";
import { proposalBuilderData, saveProposal } from "@/lib/os/proposals.functions";
import { useDevPreview } from "@/lib/use-dev-preview";

type DraftLine = {
  key: string;
  arrangement_id: string | null;
  kind: ProposalItemKind;
  label: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type VisionImage = {
  path: string;
  preview: string;
  name: string;
};

type BuilderData = {
  clients: ClientRow[];
  inquiries: Array<InquiryRow & { clients: Pick<ClientRow, "name" | "email"> | null }>;
  arrangements: ArrangementRow[];
  venues: VenueRow[];
};

const SERVICE_LINES: Array<{ kind: ProposalItemKind; label: string }> = [
  { kind: "labor", label: "Labor" },
  { kind: "delivery", label: "Delivery" },
  { kind: "install", label: "Installation" },
  { kind: "breakdown", label: "Breakdown" },
  { kind: "custom", label: "Custom service" },
];

function newServiceLine(kind: ProposalItemKind, label: string): DraftLine {
  return {
    key: crypto.randomUUID(),
    arrangement_id: null,
    kind,
    label,
    description: "",
    quantity: "1",
    unitPrice: "0.00",
  };
}

export function ProposalBuilder({ inquiryId: inquiryFromLead }: { inquiryId?: string } = {}) {
  const router = useRouter();
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const fetchBuilderData = useServerFn(proposalBuilderData);
  const submitProposal = useServerFn(saveProposal);
  const { data, isPending, isError } = useQuery({
    queryKey: ["os", "proposal-builder", devPreview],
    queryFn: () => (devPreview ? getDevPreviewProposalBuilderData() : fetchBuilderData()),
  });
  const builderData = data as unknown as BuilderData | undefined;

  const [clientId, setClientId] = useState("");
  const [inquiryId, setInquiryId] = useState(inquiryFromLead ?? "");
  const [eventDate, setEventDate] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venueText, setVenueText] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [tax, setTax] = useState("0.00");
  const [depositPercent, setDepositPercent] = useState("50");
  const [visionBoardUrl, setVisionBoardUrl] = useState("");
  const [visionImages, setVisionImages] = useState<VisionImage[]>([]);
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [uploading, setUploading] = useState(false);

  const availableInquiries = useMemo(
    () =>
      (builderData?.inquiries ?? []).filter(
        (inquiry) => !clientId || inquiry.client_id === clientId,
      ),
    [builderData?.inquiries, clientId],
  );

  useEffect(() => {
    if (!inquiryFromLead || !builderData) return;
    chooseInquiry(inquiryFromLead);
    // chooseInquiry is stable enough for initial prefills
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderData, inquiryFromLead]);

  const pricedLines = lines.map((line) => {
    const quantity = Number.parseFloat(line.quantity) || 0;
    const unitPriceCents = parseDollarsToCents(line.unitPrice);
    return {
      ...line,
      quantityNumber: quantity,
      unitPriceCents,
      totalCents: lineTotalCents(quantity, unitPriceCents),
    };
  });
  const subtotalCents = pricedLines.reduce((sum, line) => sum + line.totalCents, 0);
  const taxCents = parseDollarsToCents(tax);
  const totalCents = subtotalCents + taxCents;
  const depositCents = Math.round(
    totalCents * Math.min(100, Math.max(0, Number.parseFloat(depositPercent) || 0)) * 0.01,
  );

  function chooseInquiry(id: string) {
    setInquiryId(id);
    const inquiry = builderData?.inquiries.find((item) => item.id === id);
    if (!inquiry) return;
    setClientId(inquiry.client_id);
    setEventDate(inquiry.event_date ?? "");
    setVenueId(inquiry.venue_id ?? "");
    setVenueText(inquiry.venue_text ?? "");
  }

  function addArrangement(arrangementId: string) {
    const arrangement = builderData?.arrangements.find((item) => item.id === arrangementId);
    if (!arrangement) return;
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        arrangement_id: arrangement.id,
        kind: "arrangement",
        label: arrangement.name,
        description: arrangement.description ?? "",
        quantity: "1",
        unitPrice: (arrangement.price_cents / 100).toFixed(2),
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    const remaining = 12 - visionImages.length;
    if (remaining <= 0) {
      toast.error("A proposal can include up to 12 images");
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of selected) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`${file.name} is not an image`);
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `proposal-drafts/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from("vision-images").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) throw error;
        setVisionImages((current) => [
          ...current,
          { path, preview: URL.createObjectURL(file), name: file.name },
        ]);
      }
      if (selected.length < files.length) {
        toast.info("Only the first 12 proposal images were added");
      } else {
        toast.success(`${selected.length} image${selected.length === 1 ? "" : "s"} added`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(image: VisionImage) {
    const { error } = await supabase.storage.from("vision-images").remove([image.path]);
    if (error) {
      toast.error(error.message);
      return;
    }
    URL.revokeObjectURL(image.preview);
    setVisionImages((current) => current.filter((item) => item.path !== image.path));
  }

  const save = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — proposal not saved");
        return Promise.resolve({ id: PREVIEW_IDS.proposalDraft });
      }
      return submitProposal({
        data: {
          client_id: clientId,
          inquiry_id: inquiryId,
          event_date: eventDate || null,
          venue_id: venueId || null,
          venue_text: venueText.trim() || null,
          tax_cents: taxCents,
          deposit_percent: Number.parseFloat(depositPercent) || 0,
          vision_board_url: visionBoardUrl.trim(),
          vision_image_paths: visionImages.map((image) => image.path),
          notes: notes.trim() || null,
          valid_until: validUntil || null,
          line_items: pricedLines.map((line) => ({
            arrangement_id: line.arrangement_id,
            kind: line.kind,
            label: line.label.trim(),
            description: line.description.trim() || null,
            quantity: line.quantityNumber,
            unit_price_cents: line.unitPriceCents,
          })),
        },
      });
    },
    onSuccess: async ({ id }) => {
      toast.success("Proposal saved as a draft");
      await queryClient.invalidateQueries({ queryKey: ["os", "proposals"] });
      await router.navigate({ to: "/proposals/$id", params: { id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSave =
    Boolean(clientId && inquiryId && eventDate) &&
    pricedLines.length > 0 &&
    pricedLines.every(
      (line) => line.label.trim() && line.quantityNumber > 0 && line.unitPriceCents >= 0,
    ) &&
    !uploading;

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Preparing the proposal builder…</p>;
  }

  if (isError || !builderData) {
    return (
      <GlassCard className="border-destructive/30">
        <p className="text-sm text-destructive">
          Proposal tools are available to studio admins only.
        </p>
      </GlassCard>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <PageHeader
        eyebrow="Proposal studio"
        title="Build a proposal"
        description="Start with the inquiry, shape the client-facing scope, and save a draft before sending."
        actions={
          <SoftButton type="submit" variant="primary" disabled={!canSave || save.isPending}>
            {save.isPending ? "Saving draft" : "Save draft"}
          </SoftButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <GlassCard>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">01 · Client</p>
                <h2 className="mt-2 text-xl font-light">Choose the inquiry</h2>
              </div>
              {inquiryId ? <Pill tone="rose">Selected</Pill> : null}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Client">
                <select
                  required
                  className={inputClass}
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                    setInquiryId("");
                  }}
                >
                  <option value="">Select a client…</option>
                  {builderData.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {client.organization ? ` · ${client.organization}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Inquiry"
                hint={
                  clientId && availableInquiries.length === 0
                    ? "This client has no open inquiry available for a proposal."
                    : ""
                }
              >
                <select
                  required
                  className={inputClass}
                  value={inquiryId}
                  onChange={(event) => chooseInquiry(event.target.value)}
                >
                  <option value="">Select an inquiry…</option>
                  {availableInquiries.map((inquiry) => (
                    <option key={inquiry.id} value={inquiry.id}>
                      {inquiry.clients?.name ?? "Client"} ·{" "}
                      {inquiry.event_type.replaceAll("_", " ")}
                      {inquiry.event_date ? ` · ${inquiry.event_date}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <span className="eyebrow">Event date</span>
                <div className="mt-2">
                  <InquiryDatePicker
                    compact
                    withTime={false}
                    allowPast
                    value={eventDate || null}
                    placeholder="Select a date"
                    onChange={(next) => setEventDate(next ?? "")}
                  />
                </div>
              </div>
              <Field label="Venue directory">
                <select
                  className={inputClass}
                  value={venueId}
                  onChange={(event) => setVenueId(event.target.value)}
                >
                  <option value="">No directory venue</option>
                  {builderData.venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Venue details" className="sm:col-span-2">
                <input
                  className={inputClass}
                  value={venueText}
                  maxLength={240}
                  onChange={(event) => setVenueText(event.target.value)}
                  placeholder="Venue name, neighborhood, or details shown to the client"
                />
              </Field>
            </div>
          </GlassCard>

          <GlassCard>
            <div>
              <p className="eyebrow">02 · Scope</p>
              <h2 className="mt-2 text-xl font-light">Select arrangements</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add any arrangement more than once when it needs a separate description or price.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {builderData.arrangements.map((arrangement) => (
                <button
                  key={arrangement.id}
                  type="button"
                  onClick={() => addArrangement(arrangement.id)}
                  className="rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:bg-accent"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">{arrangement.name}</span>
                    <Plus className="size-4 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {formatMoneyExact(arrangement.price_cents)} ·{" "}
                    {arrangement.type.replaceAll("_", " ")}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <p className="eyebrow">Add service line</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SERVICE_LINES.map((service) => (
                  <SoftButton
                    key={service.kind}
                    type="button"
                    onClick={() =>
                      setLines((current) => [
                        ...current,
                        newServiceLine(service.kind, service.label),
                      ])
                    }
                  >
                    <Plus className="size-3.5" /> {service.label}
                  </SoftButton>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {lines.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-5 py-9 text-center">
                  <p className="text-sm text-muted-foreground">
                    Add at least one arrangement or service line.
                  </p>
                </div>
              ) : null}
              {pricedLines.map((line, index) => (
                <div key={line.key} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow">
                        {String(index + 1).padStart(2, "0")} · {line.kind.replaceAll("_", " ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${line.label}`}
                      onClick={() =>
                        setLines((current) => current.filter((item) => item.key !== line.key))
                      }
                      className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
                    <Field label="Client-facing name">
                      <input
                        required
                        className={inputClass}
                        value={line.label}
                        maxLength={200}
                        onChange={(event) => updateLine(line.key, { label: event.target.value })}
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        required
                        type="number"
                        min="0.01"
                        max="10000"
                        step="0.01"
                        className={inputClass}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      />
                    </Field>
                    <Field label="Unit price">
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <input
                          required
                          inputMode="decimal"
                          className={`${inputClass} pl-8`}
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(line.key, { unitPrice: event.target.value })
                          }
                        />
                      </div>
                    </Field>
                    <Field label="Description" className="sm:col-span-2">
                      <textarea
                        rows={2}
                        className={`${inputClass} resize-y`}
                        value={line.description}
                        maxLength={800}
                        onChange={(event) =>
                          updateLine(line.key, { description: event.target.value })
                        }
                        placeholder="Design, scale, palette, placement…"
                      />
                    </Field>
                    <div className="flex items-end justify-between gap-3 border-t border-border pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
                      <span className="eyebrow sm:block">Line total</span>
                      <span className="display-number text-lg sm:mt-3 sm:block">
                        {formatMoneyExact(line.totalCents)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <p className="eyebrow">03 · Vision</p>
            <h2 className="mt-2 text-xl font-light">Creative direction</h2>
            <div className="mt-6">
              <Field label="Pinterest board URL">
                <input
                  type="url"
                  className={inputClass}
                  value={visionBoardUrl}
                  onChange={(event) => setVisionBoardUrl(event.target.value)}
                  placeholder="https://www.pinterest.com/…"
                />
              </Field>
            </div>
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Reference images</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {visionImages.length} of 12 images
                  </p>
                </div>
                <label className="bloom-glow neu inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase">
                  {uploading ? (
                    <Upload className="size-3.5 animate-pulse" />
                  ) : (
                    <ImagePlus className="size-3.5" />
                  )}
                  {uploading ? "Uploading" : "Add images"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploading || visionImages.length >= 12}
                    className="sr-only"
                    onChange={(event) => {
                      void uploadImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {visionImages.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {visionImages.map((image) => (
                    <div
                      key={image.path}
                      className="group relative overflow-hidden rounded-2xl border border-border bg-muted"
                    >
                      <img
                        src={image.preview}
                        alt={image.name}
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${image.name}`}
                        onClick={() => void removeImage(image)}
                        className="absolute top-2 right-2 rounded-full bg-background/90 p-2 text-foreground shadow-sm"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </GlassCard>

          <GlassCard>
            <p className="eyebrow">04 · Terms</p>
            <h2 className="mt-2 text-xl font-light">Finishing details</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Field label="Tax">
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <input
                    inputMode="decimal"
                    className={`${inputClass} pl-8`}
                    value={tax}
                    onChange={(event) => setTax(event.target.value)}
                  />
                </div>
              </Field>
              <Field label="Deposit">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={`${inputClass} pr-9`}
                    value={depositPercent}
                    onChange={(event) => setDepositPercent(event.target.value)}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </Field>
              <div>
                <span className="eyebrow">Valid until</span>
                <div className="mt-2">
                  <InquiryDatePicker
                    compact
                    withTime={false}
                    value={validUntil || null}
                    placeholder="Select a date"
                    onChange={(next) => setValidUntil(next ?? "")}
                  />
                </div>
              </div>
              <Field label="Client notes" className="sm:col-span-3">
                <textarea
                  rows={6}
                  className={`${inputClass} resize-y`}
                  value={notes}
                  maxLength={4000}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Scope notes, substitutions, timing, or client-facing terms…"
                />
              </Field>
            </div>
          </GlassCard>
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <GlassCard>
            <p className="eyebrow">Proposal summary</p>
            <dl className="mt-5 space-y-3 text-sm">
              <MoneyRow label="Subtotal" value={subtotalCents} />
              <MoneyRow label="Tax" value={taxCents} />
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
                <dt className="font-medium">Total</dt>
                <dd className="display-number text-2xl">{formatMoneyExact(totalCents)}</dd>
              </div>
              <MoneyRow
                label={`${Number.parseFloat(depositPercent) || 0}% deposit`}
                value={depositCents}
              />
            </dl>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              The server recalculates and stores all totals when the draft is saved.
            </p>
            <SoftButton
              type="submit"
              variant="primary"
              className="mt-5 w-full"
              disabled={!canSave || save.isPending}
            >
              {save.isPending ? "Saving draft" : "Save draft"}
            </SoftButton>
          </GlassCard>
        </aside>
      </div>
    </form>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="display-number">{formatMoneyExact(value)}</dd>
    </div>
  );
}
