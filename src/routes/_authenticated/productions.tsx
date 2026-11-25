import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { BloomWait, releaseLoginBloom } from "@/components/portal/StudioLoader";
import { AddProduction } from "@/components/production/AddProduction";
import {
  ProductionListRow,
  type ProductionListItem as Row,
} from "@/components/production/ProductionListRow";
import { PersonName } from "@/components/studio/PersonName";
import { productionDateRange, productionStatusLabel } from "@/lib/os/production";
import { useProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/productions")({
  head: () => ({
    meta: [{ title: "Productions — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ProductionsPage,
});

const slugOf = (path: string) => path.split("/").pop() ?? "";

/** The productions room: every booked job for the studio, and a member's own for the team. */
function ProductionsPage() {
  const { profile } = Route.useRouteContext();
  const isAdmin = profile.role === "admin";
  // wrapped productions stay folded away at the bottom until they're asked for
  const [showWrapped, setShowWrapped] = useState(false);
  const api = useProductionApi();
  const list = useQuery({
    queryKey: ["os", "productions", isAdmin],
    queryFn: async (): Promise<Row[]> => {
      if (isAdmin) return (await api.all()).productions;
      const { productions } = await api.mine();
      return productions.map((production) => ({
        inquiry_id: production.inquiry_id,
        title: production.title,
        project_name: production.project_name,
        path: production.path,
        status: production.status,
        first: production.first,
        last: production.last,
        venue: production.venue,
        address: production.address,
        open_tasks: production.tasks.filter((task) => task.status === "open").length,
        tasks: production.tasks.length,
        team_open: production.open,
      }));
    },
  });

  useEffect(() => {
    if (list.data || list.isError) releaseLoginBloom();
  }, [list.data, list.isError]);

  const rows = list.data ?? [];
  const current = rows.filter((row) => row.status !== "wrapped" && row.team_open);
  const done = rows.filter((row) => !(row.status !== "wrapped" && row.team_open));

  const row = (item: Row) => <ProductionListRow key={item.inquiry_id} item={item} />;

  return (
    <div className="studio-home studio-member-today studio-productions">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">studio</p>
          <h1>productions</h1>
          <p>
            {isAdmin ? (
              "every booked job, from pre-production to wrapped."
            ) : (
              <>
                the productions you're on,{" "}
                {profile.full_name ? <PersonName name={profile.full_name.split(" ")[0]!} /> : ""}.
              </>
            )}
          </p>
        </div>
        {isAdmin ? (
          <div className="studio-home-hello-go">
            <AddProduction />
          </div>
        ) : null}
      </header>

      {list.isPending ? <BloomWait label="opening the productions" compact /> : null}
      {list.isError ? (
        <p className="studio-pearl-note">
          the productions didn't open.{" "}
          {list.error instanceof Error ? list.error.message : "try again in a moment."}
        </p>
      ) : null}

      {!list.isPending && !rows.length ? (
        <section className="studio-module studio-prod-section">
          <p className="studio-prod-muted">
            {isAdmin
              ? "nothing booked yet. once an inquiry is booked, its production shows here."
              : "you're not on a production yet. when the studio adds you, it shows here."}
          </p>
        </section>
      ) : null}

      {current.length ? (
        <section className="studio-module studio-prod-section">
          <p className="studio-home-label">coming up</p>
          <div className="studio-member-events">{current.map(row)}</div>
        </section>
      ) : null}

      {isAdmin && done.length ? (
        <div className="studio-wrapped">
          <button
            type="button"
            className={cn("studio-wrapped-toggle", showWrapped && "is-open")}
            aria-expanded={showWrapped}
            onClick={() => setShowWrapped((value) => !value)}
          >
            wrapped · {done.length}
            <ChevronDown aria-hidden="true" strokeWidth={1.5} />
          </button>
          {showWrapped ? <div className="studio-member-events">{done.map(row)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
