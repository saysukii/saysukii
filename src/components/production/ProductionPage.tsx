import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

import { BloomWait, releaseLoginBloom } from "@/components/portal/StudioLoader";
import { ProductionBoard, TeamHeader } from "@/components/production/ProductionBoard";
import { useProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

/**
 * A production in its own space. The team sees the event, the vision, the order, and their tasks;
 * an admin works on it right here, and can flip to the team's view to check what they'll see.
 */
export function ProductionPage({ slug, asTeam = false }: { slug: string; asTeam?: boolean }) {
  const api = useProductionApi();
  const queryClient = useQueryClient();
  const key = ["os", "production-page", slug];
  const page = useQuery({ queryKey: key, queryFn: () => api.page(slug) });
  const view = page.data?.view ?? null;

  useEffect(() => {
    if (page.data || page.isError) releaseLoginBloom();
  }, [page.data, page.isError]);

  useEffect(() => {
    if (view) document.title = view.title.toLowerCase();
  }, [view]);

  if (page.isPending) return <BloomWait label="opening the production" />;

  if (!view) {
    return (
      <div className="studio-home studio-prod-closed">
        <p className="studio-kicker">production</p>
        <h1>this production isn't open to you</h1>
        <p>
          {page.isError
            ? "it didn't open. try again in a moment."
            : "it may have wrapped, or you're not on any of its tasks. if that's a mistake, ask the studio."}
        </p>
        <Link to="/dashboard" className="studio-today-go is-pearl">
          back to today
        </Link>
      </div>
    );
  }

  const mine = view.tasks.filter((task) => task.people.includes(view.viewer.id));
  const openMine = mine.filter((task) => task.status === "open").length;
  const isAdmin = view.viewer.role === "admin";
  const editing = isAdmin && !asTeam;
  const onChanged = () => queryClient.invalidateQueries({ queryKey: key });

  return (
    <div className={cn("studio-home studio-prod-page", editing && "is-editing")}>
      <nav className="studio-prod-crumbs" aria-label="production">
        <Link to="/productions" className="studio-prod-back">
          <ArrowLeft aria-hidden="true" strokeWidth={1.5} />
          productions
        </Link>
        {isAdmin ? (
          <span className="studio-prod-crumbs-go">
            <Link
              to="/pipeline/$id"
              params={{ id: view.production.inquiry_id }}
              className="studio-ghost"
            >
              open the inquiry
            </Link>
            <span className="studio-task-layouts" role="tablist" aria-label="how it shows">
              <Link
                to="/production/$slug"
                params={{ slug }}
                search={{}}
                role="tab"
                aria-selected={editing}
                className={cn(editing && "is-on")}
              >
                edit
              </Link>
              <Link
                to="/production/$slug"
                params={{ slug }}
                search={{ view: "team" }}
                role="tab"
                aria-selected={!editing}
                className={cn(!editing && "is-on")}
              >
                as the team sees it
              </Link>
            </span>
          </span>
        ) : null}
      </nav>
      {editing ? null : <TeamHeader view={view} />}
      {!editing && mine.length ? (
        <a href="#tasks" className="studio-prod-jump">
          {openMine
            ? `you have ${openMine} open ${openMine === 1 ? "task" : "tasks"} here`
            : "your tasks here are all done"}
          <span aria-hidden="true">↓</span>
        </a>
      ) : null}
      <ProductionBoard
        view={view}
        mode={editing ? "studio" : "team"}
        api={api}
        onChanged={onChanged}
      />
    </div>
  );
}
