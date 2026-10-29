import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/portal/bits";
import {
  StudioLoader,
  STUDIO_LOADERS,
  type StudioLoaderKind,
} from "@/components/portal/StudioLoader";

export const Route = createFileRoute("/_authenticated/loading")({
  head: () => ({
    meta: [{ title: "Loading — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: LoadingPage,
});

const proposalLoaders: Array<{ kind: StudioLoaderKind; label: string }> = [
  { kind: "bloom", label: "bloom" },
  { kind: "page", label: "page" },
  { kind: "line", label: "line" },
  { kind: "dots", label: "dots" },
];

const screenLoaders: Array<{ kind: StudioLoaderKind; label: string }> = [
  { kind: "line", label: "line" },
  { kind: "bloom", label: "bloom" },
  { kind: "page", label: "page" },
  { kind: "dots", label: "dots" },
  { kind: "veil", label: "veil" },
  { kind: "ring", label: "ring" },
];

const views = [
  { id: "samples", label: "samples" },
  { id: "proposal", label: "proposal" },
  { id: "screen", label: "full screen" },
] as const;

type LoadView = (typeof views)[number]["id"];

function LoaderCard({
  kind,
  label,
  screen = false,
}: {
  kind: StudioLoaderKind;
  label: string;
  screen?: boolean;
}) {
  const [play, setPlay] = useState(0);
  return (
    <article className={screen ? "studio-load-card is-screen" : "studio-load-card"}>
      <p>{label}</p>
      <div className="studio-load-stage" key={play}>
        <span className="is-playing">
          <StudioLoader kind={kind} />
        </span>
      </div>
      <button type="button" onClick={() => setPlay((current) => current + 1)}>
        play {label}
      </button>
    </article>
  );
}

function LoadPicks({
  kind,
  onPlay,
}: {
  kind: StudioLoaderKind | null;
  onPlay: (kind: StudioLoaderKind) => void;
}) {
  return (
    <div className="studio-load-picks" role="group" aria-label="animations">
      {STUDIO_LOADERS.map((item) => (
        <button
          key={item}
          type="button"
          className={kind === item ? "is-on" : undefined}
          onClick={() => onPlay(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

const proposalPages = [1, 2, 3, 4, 5, 6].map(
  (page) => `/attachments/fenty-pages/page-0${page}.png?v=2`,
);

function ProposalLive() {
  const [kind, setKind] = useState<StudioLoaderKind | null>(null);
  const [play, setPlay] = useState(0);
  const [opening, setOpening] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => setOpening(false), 1600);
    return () => window.clearTimeout(timer);
  }, [opening, play]);

  function open(next: StudioLoaderKind) {
    setKind(next);
    setPlay((current) => current + 1);
    setOpening(true);
  }

  return (
    <section>
      <LoadPicks kind={kind} onPlay={open} />
      <p className="studio-load-note">play one. it runs on the proposal, then the page is there.</p>
      <div className="client-packet studio-load-packet">
        <header className="client-packet-mast">
          <Wordmark tone="ink" className="client-packet-mark" />
        </header>
        <div className="client-packet-steps" aria-label="packet">
          <button type="button" className="is-on">
            proposal
          </button>
          <button type="button">agreement</button>
          <button type="button">invoice</button>
        </div>
        <div className="client-packet-nav">
          <button
            type="button"
            className="client-packet-arrow"
            aria-label="Previous page"
            disabled={page <= 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={18} strokeWidth={1.4} />
          </button>
          <div className="client-packet-count">
            proposal
            <span>
              {" "}
              · {page + 1} / {proposalPages.length}
            </span>
          </div>
          <button
            type="button"
            className="client-packet-arrow"
            aria-label="Next page"
            disabled={page >= proposalPages.length - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={18} strokeWidth={1.4} />
          </button>
        </div>
        <div className="studio-load-sheet">
          <img src={proposalPages[page]} alt={`Proposal page ${page + 1}`} draggable={false} />
          {opening && kind ? (
            <div className="studio-load-sheet-veil" key={play}>
              <div className="studio-load-stage">
                <span className="is-playing">
                  <StudioLoader kind={kind} />
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScreenLive() {
  const [kind, setKind] = useState<StudioLoaderKind | null>(null);
  const [play, setPlay] = useState(0);
  const [phase, setPhase] = useState<"off" | "on" | "out">("off");

  useEffect(() => {
    if (phase !== "on") return;
    const out = window.setTimeout(() => setPhase("out"), 1500);
    return () => window.clearTimeout(out);
  }, [phase, play]);

  useEffect(() => {
    if (phase !== "out") return;
    const off = window.setTimeout(() => setPhase("off"), 400);
    return () => window.clearTimeout(off);
  }, [phase]);

  function open(next: StudioLoaderKind) {
    setKind(next);
    setPlay((current) => current + 1);
    setPhase("on");
  }

  return (
    <section>
      <LoadPicks kind={kind} onPlay={open} />
      <p className="studio-load-note">play one. it covers the screen, then this page returns.</p>
      {phase !== "off" && kind ? (
        <div
          className={phase === "out" ? "studio-load-cover is-out" : "studio-load-cover"}
          key={play}
        >
          <div className="studio-load-stage">
            <span className="is-playing">
              <StudioLoader kind={kind} />
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LoadingPage() {
  const [view, setView] = useState<LoadView>("samples");

  return (
    <div className="studio-home studio-load-page">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">loading</p>
          <h1>ways to wait</h1>
          <p>
            bloom opens the studio, a proposal, and any page that needs a moment. the page is
            already there.
          </p>
        </div>
      </header>
      <div className="studio-form-tabs" role="tablist" aria-label="where to watch">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? "is-on" : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {view === "samples" ? (
        <>
          <section className="studio-load-hero" aria-label="today">
            <div className="studio-today-wait">
              <StudioLoader kind="bloom" waiting />
            </div>
            <p>today, while it opens</p>
          </section>
          <section>
            <p className="studio-kicker">opening a proposal</p>
            <div className="studio-load-grid">
              {proposalLoaders.map((item) => (
                <LoaderCard key={item.kind} kind={item.kind} label={item.label} />
              ))}
            </div>
          </section>
          <section>
            <p className="studio-kicker">a full screen</p>
            <div className="studio-load-grid">
              {screenLoaders.map((item) => (
                <LoaderCard key={item.kind} kind={item.kind} label={item.label} screen />
              ))}
            </div>
          </section>
        </>
      ) : null}
      {view === "proposal" ? <ProposalLive /> : null}
      {view === "screen" ? <ScreenLive /> : null}
    </div>
  );
}
