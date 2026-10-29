import { Link } from "@tanstack/react-router";

import { useQuietCursor } from "@/components/glitter-cursor-trail";
import { InquireScene } from "@/components/inquiry/InquireScene";

const WEEKDAYS = ["s", "m", "t", "w", "t", "f", "s"];

/** The 404: this month on the books, with the missing page held on today. */
export function NotOnTheBooks() {
  useQuietCursor();
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const month = today.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toLowerCase();

  return (
    <InquireScene>
      <section className="studio-lost" aria-labelledby="studio-lost-title">
        <div className="studio-lost-cal" aria-hidden="true">
          <div className="studio-lost-cal-head">
            <span>{month}</span>
            <span>nothing held</span>
          </div>
          <div className="studio-lost-cal-grid">
            {WEEKDAYS.map((day, index) => (
              <span key={`wk-${index}`} className="is-weekday">
                {day}
              </span>
            ))}
            {Array.from({ length: first.getDay() }, (_, index) => (
              <span key={`pad-${index}`} />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              return day === today.getDate() ? (
                <span key={day} className="is-lost">
                  404
                </span>
              ) : (
                <span key={day}>{day}</span>
              );
            })}
          </div>
        </div>

        <div className="studio-lost-say">
          <h1 id="studio-lost-title">this one's out of season</h1>
          <p>we looked in every bucket. the page you asked for isn't here today.</p>
        </div>

        <div className="studio-lost-go">
          <Link to="/dashboard" className="studio-lost-pill">
            back to today
          </Link>
          <Link to="/calendar" className="studio-lost-ghost">
            see the schedule
          </Link>
        </div>
      </section>
    </InquireScene>
  );
}
