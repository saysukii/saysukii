import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink, FileText, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, GlassCard, PageHeader, Pill, SoftButton } from "@/components/portal/bits";
import { supabase } from "@/integrations/supabase/client";
import type {
  AgreementRow,
  ClientRow,
  InquiryRow,
  InvoiceRow,
  ProposalLineItemRow,
  ProposalRow,
  ProposalStatus,
  VenueRow,
} from "@/integrations/supabase/types";
import { formatDate, formatMoneyExact } from "@/lib/money";
import { getProposal, sendProposal } from "@/lib/os/proposals.functions";
import { getDevPreviewProposal } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/proposals/$id")({
  head: () => ({
    meta: [
      { title: "Proposal detail — Say Sukii OS" },
      {
        name: "description",
        content: "Review and send a Say Sukii client proposal.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProposalDetailPage,
});

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

type ProposalDetail = ProposalRow & {
  clients: ClientRow;
  inquiries: InquiryRow;
  venues: VenueRow | null;
  proposal_line_items: ProposalLineItemRow[];
  agreements: AgreementRow[];
  invoices: InvoiceRow[];
};

function ProposalDetailPage() {
  const { id } = Route.useParams();
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const fetchProposal = useServerFn(getProposal);
  const submitSend = useServerFn(sendProposal);
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const {
    data: rawProposal,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["os", "proposal", id, devPreview],
    queryFn: () => (devPreview ? getDevPreviewProposal(id) : fetchProposal({ data: { id } })),
  });
  const proposal = rawProposal as unknown as ProposalDetail | undefined;

  const imagePaths = proposal?.vision_image_paths ?? [];
  const { data: visionUrls = [] } = useQuery({
    queryKey: ["os", "proposal-images", id, imagePaths.join("|")],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("vision-images")
        .createSignedUrls(imagePaths, 60 * 30);
      if (error) throw error;
      return data.map((image) => image.signedUrl).filter((url): url is string => Boolean(url));
    },
    enabled: imagePaths.length > 0,
  });

  const send = useMutation({
    mutationFn: () => {
      if (devPreview) {
        toast.message("Preview mode — proposal not sent");
        return Promise.resolve({ url: `${window.location.origin}/proposal/preview` });
      }
      return submitSend({ data: { id } });
    },
    onSuccess: ({ url }) => {
      setPublicUrl(url);
      toast.success("Proposal sent to the client");
      void queryClient.invalidateQueries({ queryKey: ["os", "proposal", id] });
      void queryClient.invalidateQueries({ queryKey: ["os", "proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function openDocument(path: string | null | undefined) {
    if (!path) return;
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 15);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function copyPublicUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success("Client link copied");
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading proposal…</p>;
  }

  if (isError || !proposal) {
    return (
      <div>
        <PageHeader
          eyebrow="Client proposals"
          title="Proposal unavailable"
          description="This proposal could not be found or you do not have access."
        />
        <EmptyState title="Nothing to show" body="Return to the proposal list and try again." />
      </div>
    );
  }

  const client = proposal.clients;
  const inquiry = proposal.inquiries;
  const venue = proposal.venues;
  const lineItems = [...proposal.proposal_line_items].sort(
    (first, second) => first.sort_order - second.sort_order,
  );
  const agreement = proposal.agreements.at(0);
  const invoice = proposal.invoices.at(0);

  return (
    <div>
      <Link
        to="/proposals"
        className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground"
      >
        ← Proposals
      </Link>

      <PageHeader
        eyebrow={`Proposal ${proposal.number}`}
        title={client?.name ?? "Client proposal"}
        description={`${inquiry?.event_type.replaceAll("_", " ") ?? "Event"} · ${formatDate(
          proposal.event_date,
        )} · ${venue?.name ?? proposal.venue_text ?? "Venue TBD"}`}
        actions={
          proposal.status === "draft" ? (
            <SoftButton variant="primary" disabled={send.isPending} onClick={() => send.mutate()}>
              <Send className="size-3.5" />
              {send.isPending ? "Sending" : "Send to client"}
            </SoftButton>
          ) : proposal.pdf_path ? (
            <SoftButton onClick={() => void openDocument(proposal.pdf_path)}>
              <FileText className="size-3.5" /> Open proposal PDF
            </SoftButton>
          ) : null
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Pill tone={proposal.status === "accepted" ? "ink" : "rose"}>
          {STATUS_LABEL[proposal.status]}
        </Pill>
        <Pill>{lineItems.length} lines</Pill>
        {proposal.valid_until ? (
          <Pill>Valid through {formatDate(proposal.valid_until)}</Pill>
        ) : null}
      </div>

      {publicUrl ? (
        <GlassCard className="mb-6 border-primary/20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="eyebrow">Client link created</p>
              <p className="mt-2 break-all text-sm text-muted-foreground">{publicUrl}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <SoftButton type="button" onClick={() => void copyPublicUrl()}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </SoftButton>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <SoftButton type="button">
                  <ExternalLink className="size-3.5" /> Open
                </SoftButton>
              </a>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {proposal.status === "declined" && proposal.declined_reason ? (
        <GlassCard className="mb-6 border-destructive/20">
          <p className="eyebrow">Client response</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {proposal.declined_reason}
          </p>
        </GlassCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
        <div className="space-y-6">
          <GlassCard>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Client-facing scope</p>
                <h2 className="mt-2 text-xl font-light">Arrangements &amp; services</h2>
              </div>
              <p className="display-number text-2xl">{formatMoneyExact(proposal.total_cents)}</p>
            </div>
            <div className="mt-6 divide-y divide-border">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <Pill>{item.kind.replaceAll("_", " ")}</Pill>
                    </div>
                    {item.description ? (
                      <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.quantity} × {formatMoneyExact(item.unit_price_cents)}
                    </p>
                  </div>
                  <p className="display-number text-sm sm:text-right">
                    {formatMoneyExact(item.line_total_cents)}
                  </p>
                </div>
              ))}
            </div>
            <dl className="mt-3 space-y-3 border-t border-border pt-5 text-sm">
              <MoneyRow label="Subtotal" value={proposal.subtotal_cents} />
              <MoneyRow label="Tax" value={proposal.tax_cents} />
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
                <dt className="font-medium">Total</dt>
                <dd className="display-number text-2xl">
                  {formatMoneyExact(proposal.total_cents)}
                </dd>
              </div>
              <MoneyRow
                label={`${proposal.deposit_percent ?? 0}% deposit`}
                value={proposal.deposit_amount_cents}
              />
            </dl>
          </GlassCard>

          {visionUrls.length > 0 || proposal.vision_board_url ? (
            <GlassCard>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Creative direction</p>
                  <h2 className="mt-2 text-xl font-light">Vision references</h2>
                </div>
                {proposal.vision_board_url ? (
                  <a
                    href={proposal.vision_board_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
                  >
                    Pinterest board <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
              {visionUrls.length > 0 ? (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {visionUrls.map((url, index) => (
                    <img
                      key={url}
                      src={url}
                      alt={`Proposal vision reference ${index + 1}`}
                      className="aspect-square w-full rounded-2xl object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </GlassCard>
          ) : null}

          {proposal.notes ? (
            <GlassCard>
              <p className="eyebrow">Client notes</p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {proposal.notes}
              </p>
            </GlassCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <GlassCard>
            <p className="eyebrow">Activity</p>
            <h2 className="mt-2 text-xl font-light">Proposal timeline</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <DateRow label="Created" value={proposal.created_at} />
              <DateRow label="Sent" value={proposal.sent_at} />
              <DateRow label="Viewed" value={proposal.viewed_at} />
              <DateRow label="Accepted" value={proposal.accepted_at} />
              <DateRow label="Declined" value={proposal.declined_at} />
            </dl>
          </GlassCard>

          <GlassCard>
            <p className="eyebrow">Client</p>
            <h2 className="mt-2 text-xl font-light">{client?.name ?? "Client"}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{client?.email}</p>
            {client?.organization ? (
              <p className="mt-1 text-sm text-muted-foreground">{client.organization}</p>
            ) : null}
            <div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
              <p>{formatDate(proposal.event_date)}</p>
              <p className="mt-1">{venue?.name ?? proposal.venue_text ?? "Venue TBD"}</p>
            </div>
          </GlassCard>

          {agreement || invoice ? (
            <GlassCard>
              <p className="eyebrow">Accepted documents</p>
              <div className="mt-4 space-y-3">
                {agreement?.pdf_path ? (
                  <DocumentButton
                    label={`Agreement v${agreement.version}`}
                    onClick={() => void openDocument(agreement.pdf_path)}
                  />
                ) : null}
                {invoice?.pdf_path ? (
                  <DocumentButton
                    label={`Invoice ${invoice.number}`}
                    onClick={() => void openDocument(invoice.pdf_path)}
                  />
                ) : null}
              </div>
              {invoice ? (
                <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
                  <MoneyRow label="Deposit invoice" value={invoice.amount_cents} />
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <Pill>{invoice.status}</Pill>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </GlassCard>
          ) : null}
        </div>
      </div>
    </div>
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

function DateRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        {value
          ? new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(value))
          : "—"}
      </dd>
    </div>
  );
}

function DocumentButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left hover:bg-accent"
    >
      <span className="text-sm">{label}</span>
      <ExternalLink className="size-3.5 text-muted-foreground" />
    </button>
  );
}
