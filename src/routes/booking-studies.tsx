import { createFileRoute, notFound } from "@tanstack/react-router";
import { toast } from "sonner";

import { Wordmark } from "@/components/portal/bits";
import { celebrateBooking, type CelebrationStyle } from "@/components/portal/BookingCelebration";

// a local-only page for choosing how a new booking is celebrated in the app
export const Route = createFileRoute("/booking-studies")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Booking studies — Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: BookingStudies,
});

const STUDIES: Array<{ id: CelebrationStyle; name: string; idea: string }> = [
  {
    id: "burst",
    name: "glitter burst",
    idea: "glitter bursts out of the card as it lands in the corner, then drifts down twinkling. the name shines pink, gold, and white.",
  },
  {
    id: "rain",
    name: "glitter rain",
    idea: "fine glitter falls across the whole screen for a few seconds, every fleck twinkling, while the card says it's official.",
  },
  {
    id: "shimmer",
    name: "the shimmer card",
    idea: "the card itself glitters: sparkles twinkle all over it and a sheen of light sweeps across, with a small puff of glitter.",
  },
  {
    id: "bomb",
    name: "glitter bomb",
    idea: "a big pop of glitter from the middle of the screen with the client's name huge in glittering letters, then the card.",
  },
  {
    id: "ribbon",
    name: "glitter ribbon",
    idea: "a pink ribbon drops in at the top with sparkles on it and glitter streaming down from it.",
  },
];

function BookingStudies() {
  const play = (style: CelebrationStyle) => {
    toast.dismiss();
    celebrateBooking(style, {
      name: "Fenty Beauty",
      paid: "$2,001.25 deposit",
      eventDate: "03/12/27",
      onOpen: () => toast.message("this would open the project"),
    });
  };

  return (
    <main className="client-packet booking-studies">
      <div className="client-packet-wrap">
        <Wordmark tone="ink" className="client-packet-mark" />
        <p className="booking-studies-lead">
          a new booking comes in. press play on each to see how it lands.
        </p>
        <div className="booking-studies-list">
          {STUDIES.map((study) => (
            <article key={study.id}>
              <div>
                <b>{study.name}</b>
                <p>{study.idea}</p>
              </div>
              <button type="button" className="client-packet-accept" onClick={() => play(study.id)}>
                play
              </button>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
