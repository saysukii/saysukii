import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getDocumentUrl,
  getEssenceUrls,
  getProposal,
  markProposalSent,
  savePaymentLink,
  setProposalStatus,
} from "@/lib/portal.functions";
import {
  Field,
  GlassCard,
  PageHeader,
  Pill,
  SoftButton,
  inputClass,
} from "@/components/portal/bits";
import { AGREEMENT_TYPE_LABEL } from "@/lib/agreement-templates";
import { SERVICE_LINE_LABEL, formatDate, formatMoneyExact } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/proposals/$id")({
  head: () => ({
    meta: [
      { title: "Document set — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Proposal, agreement, and invoice for a single Say Sukii project with branded PDF downloads.",
      },
      { property: "og:title", content: "Document set — Say Sukii Portal" },
      {
        property: "og:description",
        content: "One linked proposal, agreement, and invoice set.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProposalDetailPage,
});

function ProposalDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchProposal = useServerFn(getProposal);
  const signDocument = useServerFn(getDocumentUrl);
  const signEssence = useServerFn(getEssenceUrls);
  const sendProposal = useServerFn(markProposalSent);
  const updateStatus = useServerFn(setProposalStatus);
  const updatePaymentLink = useServerFn(savePaymentLink);

  const { data: proposal, isPending } = useQuery({
    queryKey: ["proposal", id],
    queryFn: () => fetchProposal({ data: { id } }),
  });

  const project = proposal?.projects ?? null;
  const account = project?.accounts ?? null;
  const agreement = Array.isArray(proposal?.agreements) ? proposal.agreements[0] : null;
  const invoice = Array.isArray(proposal?.invoices) ? proposal.invoices[0] : null;
  const lineItems = proposal?.proposal_line_items ?? [];

  const [paymentLink, setPaymentLink] = useState("");
  useEffect(() => {
    setPaymentLink(invoice?.stripe_payment_link ?? "");
  }, [invoice?.stripe_payment_link]);

  const essencePaths: string[] = Array.isArray(proposal?.essence_image_paths)
    ? (proposal.essence_image_paths as string[])
    : [];

  const { data: essence } = useQuery({
    queryKey: ["essence", id, essencePaths.join("|")],
    queryFn: () => signEssence({ data: { paths: essencePaths } }),
    enabled: essencePaths.length > 0,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["proposal", id] });
    void queryClient.invalidateQueries({ queryKey: ["proposals"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const send = useMutation({
    mutationFn: () => sendProposal({ data: { id } }),
    onSuccess: () => {
      toast.success("Marked as sent");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = useMutation({
    mutationFn: (next: "draft" | "sent" | "accepted" | "declined") =>
      updateStatus({ data: { id, status: next } }),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const link = useMutation({
    mutationFn: () =>
      updatePaymentLink({ data: { id: invoice!.id, link: paymentLink.trim() } }),
    onSuccess: () => {
      toast.success("Payment link saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openDocument = async (path: string | null | undefined) => {
    if (!path) {
      toast.error("PDF not available yet");
      return;
    }
    try {
      const { url } = await signDocument({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Gathering the document set…</p>;
  }

  if (!proposal) {
    return (
      <div>
        <PageHeader eyebrow="Library" title="Not found" description="This document set is unavailable." />
        <Link to="/proposals" className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
          ← Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/proposals"
        className="text-xs tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground"
      >
        ← Documents
      </Link>

      <PageHeader
        eyebrow={`Proposal ${proposal.number}`}
        title={project?.title ?? "Project"}
        description={`${account?.name ?? "Account"} · ${formatDate(project?.event_date)}${
          project?.venue ? ` · ${project.venue}` : ""
        }`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Pill tone={proposal.status === "accepted" ? "rose" : "neutral"}>{proposal.status}</Pill>
        {project?.service_line ? (
          <Pill>
            {SERVICE_LINE_LABEL[project.service_line as keyof typeof SERVICE_LINE_LABEL]}
          </Pill>
        ) : null}
        {agreement ? (
          <Pill>
            {AGREEMENT_TYPE_LABEL[
              agreement.agreement_type as keyof typeof AGREEMENT_TYPE_LABEL
            ]}
          </Pill>
        ) : null}
        {account?.tier === "high_value" ? <Pill tone="rose">VIP</Pill> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <GlassCard className="p-6">
            <h2 className="text-lg font-light">Scope &amp; pricing</h2>
            <div className="mt-4 space-y-3">
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 border-b border-border/40 pb-3 last:border-0">
                  <div>
                    <p className="text-sm">{item.name}</p>
                    {item.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.quantity} × {formatMoneyExact(item.unit_price_cents)}
                    </p>
                  </div>
                  <p className="display-number text-sm">{formatMoneyExact(item.line_total_cents)}</p>
                </div>
              ))}
            </div>

            <dl className="mt-6 space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoneyExact(proposal.subtotal_cents)} />
              {proposal.discount_cents ? (
                <Row label="Discount" value={`− ${formatMoneyExact(proposal.discount_cents)}`} />
              ) : null}
              {proposal.tax_cents ? (
                <Row label="Tax" value={formatMoneyExact(proposal.tax_cents)} />
              ) : null}
              <div className="flex items-baseline justify-between border-t border-border/50 pt-3">
                <dt className="eyebrow">Total</dt>
                <dd className="display-number text-xl">{formatMoneyExact(proposal.total_cents)}</dd>
              </div>
            </dl>
          </GlassCard>

          {essence?.urls?.length ? (
            <GlassCard className="p-6">
              <h2 className="text-lg font-light">Essence images</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {essence.urls.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt={`Essence reference ${index + 1} for ${project?.title ?? "the project"}`}
                    loading="lazy"
                    className="h-32 w-full rounded-2xl object-cover"
                  />
                ))}
              </div>
            </GlassCard>
          ) : null}

          {proposal.notes ? (
            <GlassCard className="p-6">
              <h2 className="text-lg font-light">Notes</h2>
              <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">
                {proposal.notes}
              </p>
            </GlassCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <h2 className="text-lg font-light">The set</h2>
            <div className="mt-4 space-y-3">
              <DocRow
                label={`Proposal ${proposal.number}`}
                onOpen={() => void openDocument(proposal.pdf_url)}
              />
              {agreement ? (
                <DocRow
                  label={`Agreement v${agreement.version}`}
                  onOpen={() => void openDocument(agreement.pdf_url)}
                />
              ) : null}
              {invoice ? (
                <DocRow
                  label={`Invoice ${invoice.number}`}
                  onOpen={() => void openDocument(invoice.pdf_url)}
                />
              ) : null}
            </div>
          </GlassCard>

          {invoice ? (
            <GlassCard className="p-6">
              <h2 className="text-lg font-light">Invoice</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label="Amount" value={formatMoneyExact(invoice.amount_cents)} />
                <Row label="Deposit due" value={formatMoneyExact(invoice.deposit_cents)} />
                <Row label="Balance" value={formatMoneyExact(invoice.balance_cents)} />
                <Row label="Due" value={formatDate(invoice.due_date)} />
                <Row label="Status" value={invoice.status} />
              </dl>

              <div className="mt-5">
                <Field label="Square payment link">
                  <input
                    className={inputClass}
                    value={paymentLink}
                    onChange={(event) => setPaymentLink(event.target.value)}
                    placeholder="https://square.link/…"
                  />
                </Field>
                <SoftButton
                  className="mt-3"
                  onClick={() => link.mutate()}
                  disabled={link.isPending}
                >
                  Save link
                </SoftButton>
              </div>
            </GlassCard>
          ) : null}

          <GlassCard className="p-6">
            <h2 className="text-lg font-light">Move it forward</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <SoftButton
                variant="primary"
                onClick={() => send.mutate()}
                disabled={send.isPending || proposal.status !== "draft"}
              >
                Mark sent
              </SoftButton>
              <SoftButton
                onClick={() => status.mutate("accepted")}
                disabled={status.isPending || proposal.status === "accepted"}
              >
                Accepted
              </SoftButton>
              <SoftButton
                variant="ghost"
                onClick={() => status.mutate("declined")}
                disabled={status.isPending}
              >
                Declined
              </SoftButton>
            </div>
            {proposal.sent_at ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Sent {formatDate(proposal.sent_at)}
              </p>
            ) : null}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="display-number">{value}</dd>
    </div>
  );
}

function DocRow({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="glass-soft flex items-center justify-between rounded-2xl px-4 py-3">
      <p className="text-sm">{label}</p>
      <button
        onClick={onOpen}
        className="text-[0.6rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase hover:text-foreground"
      >
        Open PDF
      </button>
    </div>
  );
}
