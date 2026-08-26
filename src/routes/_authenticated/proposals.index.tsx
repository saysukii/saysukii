import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listProposals } from "@/lib/portal.functions";
import { EmptyState, GlassCard, PageHeader, Pill } from "@/components/portal/bits";
import { SERVICE_LINE_LABEL, formatDate, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/proposals/")({
  head: () => ({
    meta: [
      { title: "Documents — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Every Say Sukii proposal, agreement, and invoice in one numbered library with branded PDFs.",
      },
      { property: "og:title", content: "Documents — Say Sukii Portal" },
      {
        property: "og:description",
        content: "Numbered proposals, agreements, and invoices for the Say Sukii studio.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentsPage,
});

const STATUS_TONE: Record<string, "rose" | "neutral"> = {
  accepted: "rose",
  sent: "rose",
};

function DocumentsPage() {
  const fetchProposals = useServerFn(listProposals);
  const { data: proposals = [], isPending } = useQuery({
    queryKey: ["proposals"],
    queryFn: () => fetchProposals(),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Each proposal carries its agreement and invoice as one linked, numbered set."
      />

      {!isPending && proposals.length === 0 ? (
        <EmptyState
          title="No documents yet"
          body="Build your first proposal in the Studio and its agreement and invoice appear here automatically."
        />
      ) : null}

      <div className="space-y-4">
        {proposals.map((proposal) => {
          const invoice = Array.isArray(proposal.invoices) ? proposal.invoices[0] : null;
          const project = proposal.projects;
          return (
            <Link
              key={proposal.id}
              to="/proposals/$id"
              params={{ id: proposal.id }}
              className="block"
            >
              <GlassCard className="p-6 transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Proposal {proposal.number}</p>
                    <h2 className="mt-1 text-lg font-light">{project?.title ?? "Project"}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project?.accounts?.name ?? "Account"} · {formatDate(project?.event_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="display-number text-xl">{formatMoney(proposal.total_cents)}</p>
                    {invoice ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Invoice {invoice.number}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Pill tone={STATUS_TONE[proposal.status] ?? "neutral"}>{proposal.status}</Pill>
                  {project?.service_line ? (
                    <Pill>
                      {
                        SERVICE_LINE_LABEL[
                          project.service_line as keyof typeof SERVICE_LINE_LABEL
                        ]
                      }
                    </Pill>
                  ) : null}
                  {proposal.sent_at ? (
                    <span className="text-xs text-muted-foreground">
                      Sent {formatDate(proposal.sent_at)}
                    </span>
                  ) : null}
                </div>
              </GlassCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
