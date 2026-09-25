import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { StudioChip, StudioHeading, StudioViews } from "@/components/portal/studio";
import type { ClientRow, InquiryRow, ProposalRow, ProposalStatus } from "@/integrations/supabase/types";
import { formatDate, formatMoneyExact } from "@/lib/money";
import { listProposals } from "@/lib/os/proposals.functions";
import { getDevPreviewProposals } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

const views = [
  { id: "ledger", label: "ledger" },
  { id: "tiles", label: "tiles" },
  { id: "board", label: "board" },
] as const;

const viewSchema = z.object({
  view: z.enum(["ledger", "tiles", "board"]).optional(),
});

export const Route = createFileRoute("/_authenticated/proposals/")({
  validateSearch: viewSchema,
  head: () => ({
    meta: [
      { title: "Proposals — Say Sukii OS" },
      { name: "description", content: "Draft, send, and follow every client proposal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProposalsPage,
});

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  accepted: "accepted",
  declined: "declined",
};

const BOARD_COLUMNS: Array<{ id: string; label: string; statuses: ProposalStatus[] }> = [
  { id: "draft", label: "drafting", statuses: ["draft"] },
  { id: "out", label: "with the client", statuses: ["sent", "viewed"] },
  { id: "yes", label: "accepted", statuses: ["accepted"] },
  { id: "no", label: "declined", statuses: ["declined"] },
];

type ProposalListItem = ProposalRow & {
  clients: Pick<ClientRow, "name" | "email"> | null;
  inquiries: Pick<InquiryRow, "event_type"> | null;
};

function chipTone(status: ProposalStatus): "soft" | "due" | "late" {
  if (status === "accepted") return "late";
  if (status === "sent" || status === "viewed") return "due";
  return "soft";
}

function ProposalsPage() {
  const { view } = Route.useSearch();
  const layout = view ?? "ledger";
  const devPreview = useDevPreview();
  const fetchProposals = useServerFn(listProposals);
  const {
    data: rawProposals,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["os", "proposals", devPreview],
    queryFn: () => (devPreview ? getDevPreviewProposals() : fetchProposals()),
  });
  const proposals = (rawProposals ?? []) as unknown as ProposalListItem[];

  return (
    <div className="studio-page">
      <StudioHeading
        title="proposals"
        note="prepare the note, send it, and follow the decision."
        action={
          <a href="/proposals/new" className="studio-today-go">
            new proposal
          </a>
        }
      />
      <StudioViews to="/proposals" views={[...views]} current={layout} />

      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {isError ? <p className="studio-pearl-note">proposals are available to studio admins only.</p> : null}
      {!isPending && !isError && proposals.length === 0 ? (
        <p className="studio-empty">no proposals yet — start from an open inquiry.</p>
      ) : null}

      {layout === "ledger" ? (
        <div className="studio-ledger">
          {proposals.map((proposal) => (
            <Link key={proposal.id} to="/proposals/$id" params={{ id: proposal.id }} className="studio-ledger-row">
              <div>
                <b>{proposal.clients?.name ?? "client"}</b>
                <p>
                  {proposal.number} · {proposal.inquiries?.event_type.replaceAll("_", " ") ?? "event"} ·{" "}
                  {formatDate(proposal.event_date)}
                </p>
              </div>
              <div className="text-right">
                <StudioChip tone={chipTone(proposal.status)}>{STATUS_LABEL[proposal.status]}</StudioChip>
                <p>
                  <strong>{formatMoneyExact(proposal.total_cents)}</strong>
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {layout === "tiles" ? (
        <div className="studio-tiles">
          {proposals.map((proposal) => (
            <Link key={proposal.id} to="/proposals/$id" params={{ id: proposal.id }} className="studio-tile">
              <div className="studio-wait-top">
                <b>{proposal.clients?.name ?? "client"}</b>
                <StudioChip tone={chipTone(proposal.status)}>{STATUS_LABEL[proposal.status]}</StudioChip>
              </div>
              <p>
                {proposal.number} · {proposal.inquiries?.event_type.replaceAll("_", " ") ?? "event"}
              </p>
              <p>{formatDate(proposal.event_date)}</p>
              <strong>{formatMoneyExact(proposal.total_cents)}</strong>
            </Link>
          ))}
        </div>
      ) : null}

      {layout === "board" ? (
        <div className="studio-board-cols">
          {BOARD_COLUMNS.map((column) => {
            const items = proposals.filter((proposal) => column.statuses.includes(proposal.status));
            return (
              <section key={column.id} className="studio-pipe-col">
                <h2>
                  {column.label}
                  <span>{items.length}</span>
                </h2>
                <div className="studio-pipe-list">
                  {items.length === 0 ? <p className="studio-empty">none yet</p> : null}
                  {items.map((proposal) => (
                    <Link key={proposal.id} to="/proposals/$id" params={{ id: proposal.id }} className="studio-tile">
                      <b>{proposal.clients?.name ?? "client"}</b>
                      <p>{proposal.number}</p>
                      <p>{formatDate(proposal.event_date)}</p>
                      <strong>{formatMoneyExact(proposal.total_cents)}</strong>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
