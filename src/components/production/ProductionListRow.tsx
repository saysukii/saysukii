import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { EventFacts } from "@/components/production/EventFacts";
import { productionDateRange, productionStatusLabel } from "@/lib/os/production";
import { cn } from "@/lib/utils";

export type ProductionListItem = {
  inquiry_id: string;
  title: string;
  project_name: string;
  path: string;
  status: string;
  first: string | null;
  last: string | null;
  venue: string;
  address?: string;
  client?: string;
  open_tasks: number;
  tasks: number;
  crew?: number;
  people?: string[];
  team_open: boolean;
};

const slugOf = (path: string) => path.split("/").pop() ?? "";

/**
 * A production as a row: its name, when and where, where it stands, how far along its tasks are,
 * and who's on it. The productions page and a member's today both list productions this way.
 */
export function ProductionListRow({ item }: { item: ProductionListItem }) {
  return (
    // the whole row opens the production; the place inside it opens maps instead
    <div
      className={cn(
        "studio-member-event studio-productions-row is-linked",
        !item.team_open && "is-quiet",
      )}
    >
      <span>
        <Link
          to="/production/$slug"
          params={{ slug: slugOf(item.path) }}
          className="studio-row-open"
        >
          <b>{item.project_name}</b>
        </Link>
        <em>
          <EventFacts
            date={productionDateRange(item.first, item.last)}
            venue={item.venue}
            address={item.address ?? ""}
            client={item.client && item.client !== item.project_name ? item.client : ""}
          />
        </em>
      </span>
      <span className="studio-productions-facts">
        <span className={cn("studio-prod-status", `is-${item.status}`)}>
          {productionStatusLabel(item.status as Parameters<typeof productionStatusLabel>[0])}
        </span>
        <ChevronRight aria-hidden="true" strokeWidth={1.5} />
      </span>
      {/* how far along it is, and who's on it */}
      {item.tasks || item.people?.length ? (
        <span className="studio-row-progress">
          {item.tasks ? (
            <span className="studio-row-bar">
              <span className="studio-row-track" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.round(((item.tasks - item.open_tasks) / item.tasks) * 100)}%`,
                  }}
                />
              </span>
              <small>
                {item.tasks - item.open_tasks} of {item.tasks} done
              </small>
            </span>
          ) : (
            <span />
          )}
          {item.people?.length ? (
            <span className="studio-row-faces" aria-label={item.people.join(", ")}>
              {item.people.map((name) => (
                <i key={name} data-name={name}>
                  {name.charAt(0).toLowerCase()}
                </i>
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
