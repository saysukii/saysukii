import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";

import { BloomWait, releaseLoginBloom } from "@/components/portal/StudioLoader";
import { EventFacts } from "@/components/production/EventFacts";
import type { ProductionShiftRow } from "@/integrations/supabase/types";
import {
  hoursLabel,
  productionDateRange,
  productionDayLabel,
  productionStatusLabel,
  ratePay,
  shiftHours,
  shiftSpan,
  studioToday,
} from "@/lib/os/production";
import { formatMoneyExact } from "@/lib/money";
import { useProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

const slugOf = (path: string) => path.split("/").pop() ?? "";

/**
 * A member's schedule: just their own shifts, for each production they're on, with each event's
 * hours. The studio sets them and shares them.
 */
export function MemberSchedule() {
  const api = useProductionApi();
  const mine = useQuery({ queryKey: ["os", "my-productions"], queryFn: () => api.mine() });
  const today = studioToday();

  useEffect(() => {
    if (mine.data || mine.isError) releaseLoginBloom();
  }, [mine.data, mine.isError]);

  const productions = useMemo(() => mine.data?.productions ?? [], [mine.data]);
  type Production = (typeof productions)[number];
  const shifts = useMemo(
    () =>
      productions
        .flatMap((production) => (production.shifts ?? []).map((shift) => ({ shift, production })))
        .sort((a, b) =>
          `${a.shift.day}${a.shift.starts}`.localeCompare(`${b.shift.day}${b.shift.starts}`),
        ),
    [productions],
  );
  const coming = shifts.filter(({ shift }) => shift.day >= today);
  // their rate, and every production's hours and pay together
  const rate = mine.data?.rate ?? null;
  const totalHours = shifts.reduce(
    (sum, { shift }) => sum + shiftHours(shift.starts, shift.ends),
    0,
  );
  const totalPay = rate
    ? productions.reduce(
        (sum, production) =>
          sum +
          (ratePay(
            rate,
            (production.shifts ?? []).reduce(
              (hours, shift) => hours + shiftHours(shift.starts, shift.ends),
              0,
            ),
          ) ?? 0),
        0,
      )
    : null;
  const comingHours = coming.reduce(
    (sum, { shift }) => sum + shiftHours(shift.starts, shift.ends),
    0,
  );

  if (mine.isPending) return <BloomWait label="opening your schedule" />;

  const row = (shift: ProductionShiftRow, production?: Production) => (
    <li
      key={shift.id}
      className={cn(
        "studio-my-shift",
        shift.day === today && "is-today",
        shift.day < today && "is-past",
      )}
    >
      <b>{shift.day === today ? "today" : productionDayLabel(shift.day)}</b>
      <span className="studio-my-shift-time">{shiftSpan(shift.starts, shift.ends)}</span>
      <span className="studio-my-shift-hours">
        {hoursLabel(shiftHours(shift.starts, shift.ends))}
      </span>
      <span className="studio-my-shift-what">
        {[production?.project_name, shift.role, shift.location].filter(Boolean).join(" · ")}
      </span>
    </li>
  );

  return (
    <div className="studio-home studio-member-today studio-my-schedule">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">your schedule</p>
          <h1>schedule</h1>
          <p>
            {coming.length
              ? `${hoursLabel(comingHours)} across ${coming.length} ${coming.length === 1 ? "shift" : "shifts"} coming up.`
              : productions.length
                ? "no shifts coming up. when the studio shares new ones, they show here."
                : "nothing yet. when the studio shares a production with you, your shifts show here."}
            {/* what all their hours come to */}
            {rate && totalPay != null && totalHours ? (
              <> that's {formatMoneyExact(totalPay)} in all.</>
            ) : null}
          </p>
        </div>
      </header>

      {mine.isError ? (
        <p className="studio-pearl-note">your schedule didn't open. try again in a moment.</p>
      ) : null}

      {productions
        .filter((production) => (production.shifts ?? []).length)
        .map((production) => {
          const theirs = [...(production.shifts ?? [])].sort((a, b) =>
            `${a.day}${a.starts}`.localeCompare(`${b.day}${b.starts}`),
          );
          const hours = theirs.reduce(
            (sum, shift) => sum + shiftHours(shift.starts, shift.ends),
            0,
          );
          return (
            <section key={production.inquiry_id} className="studio-module studio-my-event">
              <div className="studio-my-event-head">
                <span>
                  <Link
                    to="/production/$slug"
                    params={{ slug: slugOf(production.path) }}
                    className="studio-my-event-name"
                  >
                    {production.project_name}
                    <ChevronRight aria-hidden="true" strokeWidth={1.5} />
                  </Link>
                  <em>
                    <EventFacts
                      date={productionDateRange(production.first, production.last)}
                      venue={production.venue}
                      address={production.address}
                    />
                  </em>
                </span>
                <span className="studio-my-event-sum">
                  <span className={cn("studio-prod-status", `is-${production.status}`)}>
                    {productionStatusLabel(production.status)}
                  </span>
                  <small>
                    {hoursLabel(hours)} · {theirs.length} {theirs.length === 1 ? "shift" : "shifts"}
                  </small>
                  {/* what this production comes to for them */}
                  {rate ? (
                    <small className="studio-my-pay">
                      {formatMoneyExact(ratePay(rate, hours) ?? 0)}
                    </small>
                  ) : null}
                </span>
              </div>
              <ol className="studio-my-shifts">{theirs.map((shift) => row(shift))}</ol>
            </section>
          );
        })}
    </div>
  );
}
