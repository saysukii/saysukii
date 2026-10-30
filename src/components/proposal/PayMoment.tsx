import type { PayMomentStyle, PayPhase } from "@/lib/pay-moments";
import { cn } from "@/lib/utils";

/** The moment between pressing pay and paid: a quiet wait, then a simple sign that it's done. */
export function PayMoment({
  style,
  phase,
  amount,
}: {
  style: PayMomentStyle;
  phase: PayPhase;
  amount: string;
}) {
  const paid = phase === "paid";
  return (
    <div className={cn("pay-moment", `is-${style}`, `is-${phase}`)} role="status">
      {style === "circle" ? (
        <svg className="pay-moment-circle" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="26" />
          <path d="M22 33l7 7 13-15" />
        </svg>
      ) : null}
      {style === "dot" ? (
        <span className="pay-moment-dot" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6 12.5l4 4 8-9" />
          </svg>
        </span>
      ) : null}
      {style === "line" ? (
        <div className="pay-moment-amount">
          <p>
            {amount}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 12.5l4 4 8-9" />
            </svg>
          </p>
          <span className="pay-moment-bar" aria-hidden="true" />
        </div>
      ) : null}
      {style === "button" ? (
        <span className="pay-moment-pill">{paid ? `paid ✓` : "paying…"}</span>
      ) : null}
      <p className="pay-moment-line">
        {paid ? (style === "line" ? "paid" : `${amount} paid`) : "paying securely…"}
      </p>
      <p className="pay-moment-note">
        {paid ? "thank you. your date is held." : "this takes a moment."}
      </p>
    </div>
  );
}
