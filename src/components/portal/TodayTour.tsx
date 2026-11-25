import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useServerFn } from "@tanstack/react-start";

import { isDevPreviewEnabled } from "@/lib/dev-preview";
import { needsFlow } from "@/lib/os/how-we-flow";
import { finishTodayTour } from "@/lib/os/settings.functions";
import { previewProduction } from "@/lib/preview-production";
import { useStudioSession } from "@/lib/studio-session";

/**
 * The first time a member comes in, after they've agreed to how we flow, a short tour of their
 * today: the numbers at the top, their productions, and their schedule. Each step lights up one
 * part of the page. Once it's done or skipped it's kept on their account, so it never comes back,
 * on any device.
 */
const STEPS = [
  {
    target: "glance",
    title: "your today",
    body: "your day at a glance: what's on today, the productions you're on, this week's hours, and your to do. tap to do to check things off.",
  },
  {
    target: "productions",
    title: "your productions",
    body: "every production you're on lives here. open one for the event, the vision, the order, and who's on the team with you.",
  },
  {
    target: "schedule",
    title: "your schedule",
    body: "your shifts and tasks. pick a day on the calendar, or move through the week with the arrows.",
  },
] as const;

// locally, the tour can be opened again from today, to look at it
export const TOUR_OPEN_EVENT = "say-sukii-tour-open";
const tourKey = (id: string) => `say-sukii-tour:${id}`;

/** done on their account, or just now in this browser while the account catches up */
function seen(profile: { id: string; tour_seen_at?: string | null | undefined }) {
  if (profile.tour_seen_at) return true;
  try {
    return localStorage.getItem(tourKey(profile.id)) === "done";
  } catch {
    return false;
  }
}

type Box = { top: number; left: number; width: number; height: number };

export function TodayTour({ ready }: { ready: boolean }) {
  const { profile } = useStudioSession();
  const finishTour = useServerFn(finishTodayTour);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  // only the steps whose part of the page is there, so a member with nothing yet isn't shown blanks
  const [steps, setSteps] = useState<ReadonlyArray<(typeof STEPS)[number]>>(STEPS);

  // it starts once today has loaded and how we flow is agreed to
  useEffect(() => {
    if (!ready || needsFlow(profile) || seen(profile)) return;
    const timer = window.setTimeout(() => {
      setSteps(STEPS.filter((item) => document.querySelector(`[data-tour="${item.target}"]`)));
      setStep(0);
      setOpen(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [ready, profile]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const reopen = () => {
      setSteps(STEPS.filter((item) => document.querySelector(`[data-tour="${item.target}"]`)));
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_OPEN_EVENT, reopen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, reopen);
  }, []);

  const current = open ? steps[step] : undefined;

  const measure = useCallback(() => {
    if (!current) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [current]);

  // each step brings its part of the page into view, then follows it as the page moves
  useEffect(() => {
    if (!current) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    if (!el) return;
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
    el.scrollIntoView({ block: tall ? "start" : "center", behavior: "smooth" });
    measure();
    const settle = window.setInterval(measure, 60);
    const stop = window.setTimeout(() => window.clearInterval(settle), 700);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(settle);
      window.clearTimeout(stop);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current, measure]);

  useLayoutEffect(() => {
    if (card.current) setCardHeight(card.current.offsetHeight);
  }, [current, box]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(tourKey(profile.id), "done");
    } catch {
      // the account keeps it
    }
    setOpen(false);
    setBox(null);
    // kept on their account, so it never shows again on any device
    if (isDevPreviewEnabled()) previewProduction.finishTour();
    else void finishTour().catch(() => undefined);
  }, [profile.id, finishTour]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!current || typeof document === "undefined") return null;

  // the card sits under the lit part if there's room, above it if not, and at the foot otherwise
  const pad = 8;
  const gap = 14;
  const edge = 16;
  const width = Math.min(340, window.innerWidth - edge * 2);
  let top = window.innerHeight - cardHeight - edge;
  let left = (window.innerWidth - width) / 2;
  if (box) {
    const below = box.top + box.height + pad + gap;
    const above = box.top - pad - gap - cardHeight;
    if (below + cardHeight <= window.innerHeight - edge) top = below;
    else if (above >= edge) top = above;
    left = Math.min(Math.max(box.left, edge), window.innerWidth - width - edge);
  }
  const last = step === steps.length - 1;

  return createPortal(
    <div
      className="studio-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-tour-title"
    >
      <div className="studio-tour-catch" />
      {box ? (
        <div
          className="studio-tour-light"
          aria-hidden="true"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      ) : null}
      <div ref={card} className="studio-tour-card" style={{ top, left, width }}>
        <p className="studio-tour-kicker">
          a quick look around · {step + 1} of {steps.length}
        </p>
        <h2 id="studio-tour-title">{current.title}</h2>
        <p className="studio-tour-body">{current.body}</p>
        <div className="studio-tour-foot">
          {last ? (
            <span />
          ) : (
            <button type="button" className="studio-tour-skip" onClick={finish}>
              skip
            </button>
          )}
          <span className="studio-tour-go">
            {step ? (
              <button type="button" className="studio-ghost" onClick={() => setStep(step - 1)}>
                back
              </button>
            ) : null}
            <button
              type="button"
              className="studio-today-go"
              onClick={() => (last ? finish() : setStep(step + 1))}
            >
              {last ? "let's go" : "next"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
