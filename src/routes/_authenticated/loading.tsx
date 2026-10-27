import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { StudioLoader, type StudioLoaderKind } from "@/components/portal/StudioLoader";

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

function LoaderCard({ kind, label, screen = false }: { kind: StudioLoaderKind; label: string; screen?: boolean }) {
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

function LoadingPage() {
  return (
    <div className="studio-home studio-load-page">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">loading</p>
          <h1>ways to wait</h1>
          <p>today uses the line. play the others and say which one to keep.</p>
        </div>
      </header>
      <section className="studio-load-hero" aria-label="today">
        <div className="studio-today-wait">
          <StudioLoader kind="line" waiting />
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
    </div>
  );
}
