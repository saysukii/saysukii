import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getDashboard } from "@/lib/portal.functions";
import { GlassCard, PageHeader, Pill, SoftButton, EmptyState } from "@/components/portal/bits";
import { formatMoney, formatDate, STAGE_LABEL, type Stage } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Studio Dashboard — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Pipeline value, proposals out, and upcoming installs across the Say Sukii floral studio.",
      },
      { property: "og:title", content: "Studio Dashboard — Say Sukii Portal" },
      { property: "og:description", content: "Pipeline value, proposals out, and upcoming installs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
  });

  const proposals = data?.proposals ?? [];
  const projects = data?.projects ?? [];
  const invoices = data?.invoices ?? [];

  const outstanding = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + (invoice.amount_cents ?? 0), 0);
  const proposalsOut = proposals.filter((proposal) => proposal.status === "sent").length;
  const pipelineValue = proposals
    .filter((proposal) => proposal.status !== "declined")
    .reduce((sum, proposal) => sum + (proposal.total_cents ?? 0), 0);

  const upcoming = projects
    .filter((project) => project.event_date && new Date(project.event_date) >= new Date(Date.now() - 864e5))
    .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow="Say Sukii"
        title="The studio, at a glance"
        description="Everything in motion right now: what's quoted, what's out for signature, and what installs next."
        actions={
          <Link to="/studio">
            <SoftButton variant="primary">New proposal</SoftButton>
          </Link>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Pipeline value", value: formatMoney(pipelineValue) },
          { label: "Proposals out", value: String(proposalsOut) },
          { label: "Open invoices", value: formatMoney(outstanding) },
          { label: "Active projects", value: String(projects.filter((p) => p.stage !== "complete").length) },
        ].map((stat) => (
          <GlassCard key={stat.label} className="py-7">
            <p className="eyebrow">{stat.label}</p>
            <p className="display-number mt-4 text-4xl text-foreground">{stat.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-light">Latest proposals</h2>
            <Link to="/proposals" className="text-xs tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground">
              All documents
            </Link>
          </div>
          <div className="mt-6 space-y-3">
            {isPending ? <p className="text-sm text-muted-foreground">Gathering…</p> : null}
            {!isPending && proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No proposals yet. Build the first one in the Proposal Studio.
              </p>
            ) : null}
            {proposals.slice(0, 6).map((proposal) => (
              <Link
                key={proposal.id}
                to="/proposals/$id"
                params={{ id: proposal.id }}
                className="neu bloom-glow flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {proposal.projects?.accounts?.name ?? "Client"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {proposal.number} · {proposal.projects?.title}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <Pill tone={proposal.status === "accepted" ? "ink" : "neutral"}>
                    {proposal.status}
                  </Pill>
                  <span className="display-number text-lg">{formatMoney(proposal.total_cents)}</span>
                </div>
              </Link>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h2 className="text-xl font-light">Next on the calendar</h2>
          <div className="mt-6 space-y-4">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dated projects on the books.</p>
            ) : null}
            {upcoming.map((project) => (
              <div key={project.id} className="border-b border-border/60 pb-4 last:border-0">
                <p className="text-sm font-medium">{project.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(project.event_date)} · {project.venue ?? "Venue TBC"}
                </p>
                <p className="mt-2 text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                  {STAGE_LABEL[project.stage as Stage] ?? project.stage}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {!isPending && proposals.length === 0 && projects.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Start with an account"
            body="Add a client or prospect, give them a project, then build the proposal, agreement, and invoice in one pass."
          />
        </div>
      ) : null}
    </div>
  );
}
