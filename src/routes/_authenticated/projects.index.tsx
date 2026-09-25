import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, GlassCard, PageHeader, Pill } from "@/components/portal/bits";
import { listProjects } from "@/lib/os/projects.functions";
import { getDevPreviewProjects } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Say Sukii Portal" },
      {
        name: "description",
        content: "Active floral, wedding, and experiential projects at Say Sukii.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectsPage,
});

const FILTERS = ["all", "pre_production", "production", "post_production"] as const;

type Filter = (typeof FILTERS)[number];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function ProjectsPage() {
  const devPreview = useDevPreview();
  const fetchProjects = useServerFn(listProjects);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["os", "projects", devPreview],
    queryFn: () => (devPreview ? getDevPreviewProjects() : fetchProjects()),
  });
  const projects = useMemo(() => data?.projects ?? [], [data?.projects]);
  const isAdmin = data?.role === "admin";

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter = filter === "all" || project.status === filter;
      const matchesSearch =
        !query ||
        project.event_name.toLowerCase().includes(query) ||
        project.client?.name.toLowerCase().includes(query) ||
        project.venue?.name.toLowerCase().includes(query) ||
        project.venue_text?.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [filter, projects, search]);

  return (
    <div>
      <PageHeader
        eyebrow="The work"
        title="Projects"
        description="Production begins here only after a proposal deposit is paid. Projects cannot be created manually."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={
                filter === item
                  ? "rounded-full bg-primary px-4 py-2 text-[0.65rem] font-semibold tracking-[0.12em] text-primary-foreground uppercase"
                  : "rounded-full border border-border bg-background px-4 py-2 text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
              }
            >
              {item.replaceAll("_", " ")}
            </button>
          ))}
        </div>

        <label className="flex min-w-0 items-center gap-2 border-b border-border px-1 py-2 sm:w-64">
          <Search className="size-3.5 text-muted-foreground" />
          <span className="sr-only">Search projects</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {!isPending && projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="Projects appear automatically when a completed deposit converts an accepted proposal."
        />
      ) : null}

      {!isPending && projects.length > 0 && visibleProjects.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No projects match this view.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleProjects.map((project) => (
          <Link key={project.id} to="/projects/$id" params={{ id: project.id }}>
            <GlassCard className="bloom-glow flex min-h-56 flex-col p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <Pill>{project.status.replaceAll("_", " ")}</Pill>
                {isAdmin && project.proposal ? (
                  <span className="text-[0.6rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {project.proposal.number}
                  </span>
                ) : null}
              </div>

              <div className="mt-7">
                <h2 className="text-2xl font-light leading-tight">{project.event_name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isAdmin ? (project.client?.name ?? "Client") : "Production project"}
                </p>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-4 border-t border-border/70 pt-5">
                <div>
                  <p className="eyebrow">Event</p>
                  <p className="mt-1.5 text-xs">{formatDate(project.event_date)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {project.venue?.name ?? project.venue_text ?? "Venue TBD"}
                  </p>
                </div>
                {isAdmin && project.proposal ? (
                  <div className="text-right">
                    <p className="eyebrow">Accepted total</p>
                    <p className="display-number mt-1 text-base">
                      {formatMoney(project.proposal.total_cents)}
                    </p>
                  </div>
                ) : null}
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
