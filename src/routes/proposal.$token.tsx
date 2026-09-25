import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Download, ExternalLink, Heart, X } from "lucide-react";
import { useState } from "react";

import { GlassCard, Pill, SoftButton, Wordmark, inputClass } from "@/components/portal/bits";
import { formatDate, formatMoneyExact } from "@/lib/money";
import {
  acceptPublicProposal,
  declinePublicProposal,
  getPublicProposal,
} from "@/lib/os/proposals.functions";

export const Route = createFileRoute("/proposal/$token")({
  head: () => ({
    meta: [
      { title: "Your proposal — Say Sukii" },
      {
        name: "description",
        content: "A floral design proposal prepared for you by Say Sukii.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicProposalPage,
});

function PublicProposalPage() {
  const { token } = Route.useParams() as { token: string };
  const queryClient = useQueryClient();
  const fetchProposal = useServerFn(getPublicProposal);
  const acceptProposal = useServerFn(acceptPublicProposal);
  const declineProposal = useServerFn(declinePublicProposal);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["public-proposal", token],
    queryFn: () => fetchProposal({ data: { token } }),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptProposal({ data: { token } }),
    onSuccess: (result) => {
      setPaymentLink(result.paymentLink);
      void queryClient.invalidateQueries({ queryKey: ["public-proposal", token] });
    },
  });

  const decline = useMutation({
    mutationFn: () =>
      declineProposal({
        data: {
          token,
          reason: declineReason.trim(),
        },
      }),
    onSuccess: () => {
      setShowDecline(false);
      void queryClient.invalidateQueries({ queryKey: ["public-proposal", token] });
    },
  });

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="w-36 animate-pulse">
          <Wordmark />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="max-w-md text-center">
          <div className="mx-auto w-36">
            <Wordmark />
          </div>
          <h1 className="mt-10 text-3xl font-light">This proposal is unavailable.</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {error instanceof Error && error.message !== "Proposal not found"
              ? error.message
              : "The link may be incomplete or no longer active. Please contact Say Sukii for a fresh link."}
          </p>
        </div>
      </main>
    );
  }

  const { proposal, client, venue, items, pdfUrl } = data;
  const canRespond = proposal.status === "sent" || proposal.status === "viewed";
  const accepted = proposal.status === "accepted" || accept.isSuccess;
  const declined = proposal.status === "declined" || decline.isSuccess;

  return (
    <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col items-center justify-between gap-6 border-b border-border pb-7 sm:flex-row">
          <a href="/" aria-label="Say Sukii home" className="w-32 sm:w-40">
            <Wordmark />
          </a>
          <div className="text-center sm:text-right">
            <p className="eyebrow">Floral + experiential design</p>
            <p className="mt-2 text-xs text-muted-foreground">Proposal {proposal.number}</p>
          </div>
        </header>

        <section className="py-12 text-center sm:py-16">
          <Pill tone={accepted ? "ink" : "rose"}>
            {accepted ? "Accepted" : declined ? "Declined" : "Prepared for you"}
          </Pill>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-light tracking-[-0.04em] sm:text-6xl">
            {accepted ? "We can’t wait to create with you." : `A proposal for ${client.name}`}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            {accepted
              ? "Your proposal is accepted. Complete the deposit below to move your event into production."
              : declined
                ? "Thank you for letting us know. The Say Sukii studio has received your response."
                : "Thoughtfully assembled around your event, your space, and the feeling you want to create."}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.7fr)]">
          <div className="space-y-6">
            <GlassCard>
              <p className="eyebrow">Your floral story</p>
              <h2 className="mt-3 text-2xl font-light">Arrangements &amp; services</h2>
              <div className="mt-7 divide-y divide-border">
                {items.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="grid gap-3 py-5 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
                  >
                    <div>
                      <h3 className="text-sm font-medium">{item.label}</h3>
                      {item.description ? (
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
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
                {proposal.tax_cents > 0 ? (
                  <MoneyRow label="Tax" value={proposal.tax_cents} />
                ) : null}
                <div className="flex items-baseline justify-between gap-5 border-t border-border pt-4">
                  <dt className="font-medium">Proposal total</dt>
                  <dd className="display-number text-2xl">
                    {formatMoneyExact(proposal.total_cents)}
                  </dd>
                </div>
                <MoneyRow
                  label="Deposit to reserve your date"
                  value={proposal.deposit_amount_cents}
                />
              </dl>
            </GlassCard>

            {proposal.notes ? (
              <GlassCard>
                <p className="eyebrow">A note from the studio</p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {proposal.notes}
                </p>
              </GlassCard>
            ) : null}
          </div>

          <aside className="space-y-6">
            <GlassCard>
              <p className="eyebrow">Event details</p>
              <dl className="mt-5 space-y-4 text-sm">
                <DetailRow label="Date" value={formatDate(proposal.event_date)} />
                <DetailRow
                  label="Venue"
                  value={venue?.name ?? proposal.venue_text ?? "To be confirmed"}
                />
                {venue?.address ? <DetailRow label="Address" value={venue.address} /> : null}
                <DetailRow
                  label="Valid until"
                  value={proposal.valid_until ? formatDate(proposal.valid_until) : "Open"}
                />
              </dl>
              {proposal.vision_board_url ? (
                <a
                  href={proposal.vision_board_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 border-t border-border pt-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
                >
                  View the vision board <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </GlassCard>

            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="block">
                <GlassCard className="flex items-center justify-between gap-4 transition-transform hover:-translate-y-0.5">
                  <div>
                    <p className="eyebrow">Keep a copy</p>
                    <p className="mt-2 text-sm">Open proposal PDF</p>
                  </div>
                  <Download className="size-5 text-muted-foreground" />
                </GlassCard>
              </a>
            ) : null}

            {!declined ? (
              <GlassCard className={accepted ? "border-primary/20" : ""}>
                <p className="eyebrow">{accepted ? "Next step" : "Ready to bloom?"}</p>
                <h2 className="mt-3 text-2xl font-light">
                  {accepted ? "Reserve your date" : "Make it official"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {accepted
                    ? "Use the secure payment link to complete your deposit."
                    : "Accepting creates your agreement and deposit invoice. Your date is reserved after the deposit is paid."}
                </p>

                {paymentLink ? (
                  <a href={paymentLink} target="_blank" rel="noreferrer" className="mt-5 block">
                    <SoftButton variant="primary" className="w-full">
                      Pay {formatMoneyExact(proposal.deposit_amount_cents)}
                      <ExternalLink className="size-3.5" />
                    </SoftButton>
                  </a>
                ) : accepted ? (
                  <SoftButton
                    variant="primary"
                    className="mt-5 w-full"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate()}
                  >
                    {accept.isPending ? "Preparing payment" : "Continue to deposit"}
                  </SoftButton>
                ) : canRespond ? (
                  <>
                    <SoftButton
                      variant="primary"
                      className="mt-5 w-full"
                      disabled={accept.isPending || decline.isPending}
                      onClick={() => accept.mutate()}
                    >
                      <Heart className="size-3.5" />
                      {accept.isPending ? "Accepting" : "Accept proposal"}
                    </SoftButton>
                    <button
                      type="button"
                      onClick={() => setShowDecline((current) => !current)}
                      className="mt-4 w-full text-center text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
                    >
                      Decline proposal
                    </button>
                  </>
                ) : null}

                {accept.isError ? (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    {accept.error.message}
                  </p>
                ) : null}

                {accepted && accept.isSuccess && !paymentLink ? (
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Your proposal is accepted. The studio will follow up with deposit instructions.
                  </p>
                ) : null}

                {showDecline && canRespond ? (
                  <div className="mt-5 border-t border-border pt-5">
                    <label>
                      <span className="eyebrow">Optional note</span>
                      <textarea
                        rows={4}
                        maxLength={1000}
                        className={`${inputClass} mt-2 resize-y`}
                        value={declineReason}
                        onChange={(event) => setDeclineReason(event.target.value)}
                        placeholder="Share anything you’d like us to know."
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <SoftButton
                        variant="ghost"
                        className="flex-1"
                        disabled={decline.isPending}
                        onClick={() => setShowDecline(false)}
                      >
                        Keep proposal
                      </SoftButton>
                      <SoftButton
                        className="flex-1"
                        disabled={decline.isPending}
                        onClick={() => decline.mutate()}
                      >
                        <X className="size-3.5" />
                        {decline.isPending ? "Sending" : "Confirm"}
                      </SoftButton>
                    </div>
                    {decline.isError ? (
                      <p role="alert" className="mt-3 text-sm text-destructive">
                        {decline.error.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </GlassCard>
            ) : null}

            {accepted ? (
              <div className="flex items-center gap-3 px-2 text-xs leading-5 text-muted-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-4" />
                </span>
                Your acceptance has been shared with Say Sukii.
              </div>
            ) : null}
          </aside>
        </div>

        <footer className="mt-12 border-t border-border py-8 text-center sm:mt-16">
          <div className="mx-auto w-24 opacity-70">
            <Wordmark />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Questions? Reply to your proposal email and the studio will be happy to help.
          </p>
        </footer>
      </div>
    </main>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="display-number text-right">{formatMoneyExact(value)}</dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 leading-6">{value}</dd>
    </div>
  );
}
