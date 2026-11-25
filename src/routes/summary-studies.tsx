import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Wordmark } from "@/components/portal/bits";
import { isNextSteps, parseSummary, type SummarySection } from "@/lib/meeting-summary-format";
import { cn } from "@/lib/utils";

// a local-only page for choosing how a call's granola summary reads on the schedule
export const Route = createFileRoute("/summary-studies")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Summary studies — Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: SummaryStudies,
});

/** a sample in granola's markdown, written from today's call */
const SAMPLE = `### love note portal
- voice recording: saves and sends recording to sukii
- video recording: tested, camera permissions resolved
- consent language needed for voice/video use in marketing
  - draft: "i consent for saysukii to use my voice/video for marketing purposes"
  - text-only notes: no consent required
- color palette: all options except white, rotating on refresh
- layout: date field moved to top
- data routes to google sheet; easy to connect to os later

### art basel prep
- no confirmed bookings yet; one large 4-event project still unconfirmed
- taī will start building out the production/ops space proactively
- sukii noted decor is always last to be hired; basel calls typically come in very last minute

### next steps
- write love note portal welcome text and anniversary shout-out copy (sukii)
  - also draft consent language for voice/video recording use in marketing.
- reorder and upload final images in framer (sukii)
  - blue porsche/soho image to go first; gallery images also need reordering.
- optimize site for all screen sizes and publish (taī)
  - targeting tomorrow morning; also applying color rotation, layout fixes, and consent language once copy is received.
- connect love note portal google sheet and go live (taī)`;

const STUDIES: Array<{
  id: string;
  name: string;
  idea: string;
  render: (s: SummarySection[]) => ReactNode;
}> = [
  {
    id: "now",
    name: "as it is now",
    idea: "granola's plain text, one line after another. headings and bullets come out as ordinary lines.",
    render: () => <p className="summary-study-plain">{plainText(SAMPLE)}</p>,
  },
  {
    id: "sections",
    name: "sections",
    idea: "granola's own headings as small labels, each point a line with a soft dot, and the finer points tucked under it in grey.",
    render: (sections) => <Sections sections={sections} />,
  },
  {
    id: "steps",
    name: "next steps first",
    idea: "what has to happen next sits on top, each with who it's on. the rest of the call follows as notes.",
    render: (sections) => <StepsFirst sections={sections} />,
  },
  {
    id: "people",
    name: "by person",
    idea: "what's on sukii and what's on taī, side by side. each topic shows its first two points, with the rest a tap away.",
    render: (sections) => <ByPerson sections={sections} />,
  },
  {
    id: "cards",
    name: "cards",
    idea: "each topic in its own soft card, so a long call reads in pieces. next steps get a pink wash.",
    render: (sections) => <Cards sections={sections} />,
  },
];

function SummaryStudies() {
  const sections = parseSummary(SAMPLE);
  return (
    <main className="client-packet summary-studies">
      <div className="summary-studies-wrap">
        <Wordmark tone="ink" className="client-packet-mark" />
        <p className="pay-studies-idea">
          five ways a call&apos;s summary could read on the schedule, with a sample written from
          today&apos;s call. only on this computer.
        </p>
        <div className="summary-studies-grid">
          {STUDIES.map((study, index) => (
            <section key={study.id} className="summary-study">
              <header>
                <p className="summary-study-name">
                  <span>{index + 1}</span> {study.name}
                </p>
                <p className="summary-study-idea">{study.idea}</p>
              </header>
              <div className="summary-study-panel">
                <p className="summary-study-who">Sukii</p>
                <p className="summary-study-when">wednesday, november 5 · 11:00 – 11:45 am</p>
                <p className="summary-study-label">summary</p>
                {study.render(sections)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function plainText(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*]\s+/, ""))
    .join("\n");
}

function Owner({ name }: { name: string | null }) {
  return name ? <span className="summary-owner">{name}</span> : null;
}

function Points({ section, compact = false }: { section: SummarySection; compact?: boolean }) {
  return (
    <ul className={cn("summary-points", compact && "is-compact")}>
      {section.points.map((point) => (
        <li key={point.text}>
          <span>
            {point.text} <Owner name={point.owner} />
          </span>
          {point.details.length ? (
            <ul className="summary-details">
              {point.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Sections({ sections }: { sections: SummarySection[] }) {
  return (
    <div className="summary-study-box summary-sections">
      {sections.map((section) => (
        <div key={section.title}>
          {section.title ? <p className="summary-section-title">{section.title}</p> : null}
          <Points section={section} />
        </div>
      ))}
    </div>
  );
}

function Steps({ section }: { section: SummarySection }) {
  return (
    <ul className="summary-steps">
      {section.points.map((point) => (
        <li key={point.text}>
          <i aria-hidden="true" />
          <div>
            <p>
              {point.text} <Owner name={point.owner} />
            </p>
            {point.details.map((detail) => (
              <small key={detail}>{detail}</small>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StepsFirst({ sections }: { sections: SummarySection[] }) {
  const steps = sections.find(isNextSteps);
  const rest = sections.filter((section) => section !== steps);
  return (
    <div className="summary-study-box summary-sections">
      {steps ? (
        <div>
          <p className="summary-section-title is-pink">next steps</p>
          <Steps section={steps} />
        </div>
      ) : null}
      {rest.map((section) => (
        <div key={section.title}>
          <p className="summary-section-title">{section.title}</p>
          <Points section={section} compact />
        </div>
      ))}
    </div>
  );
}

function ByPerson({ sections }: { sections: SummarySection[] }) {
  const steps = sections.find(isNextSteps);
  const rest = sections.filter((section) => section !== steps);
  const owners = [...new Set((steps?.points ?? []).map((point) => point.owner ?? "everyone"))];
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="summary-study-box summary-sections">
      <div className="summary-people">
        {owners.map((owner) => (
          <div key={owner}>
            <p className="summary-section-title is-pink">on {owner}</p>
            <ul className="summary-points is-compact">
              {steps?.points
                .filter((point) => (point.owner ?? "everyone") === owner)
                .map((point) => (
                  <li key={point.text}>{point.text}</li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      {rest.map((section) => {
        const shown = open === section.title ? section.points : section.points.slice(0, 2);
        const more = section.points.length - 2;
        return (
          <div key={section.title}>
            <p className="summary-section-title">{section.title}</p>
            <Points section={{ ...section, points: shown }} compact />
            {more > 0 ? (
              <button
                type="button"
                className="summary-more"
                onClick={() => setOpen(open === section.title ? null : section.title)}
              >
                {open === section.title ? "less" : `${more} more`}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Cards({ sections }: { sections: SummarySection[] }) {
  const steps = sections.find(isNextSteps);
  const ordered = steps ? [steps, ...sections.filter((section) => section !== steps)] : sections;
  return (
    <div className="summary-cards">
      {ordered.map((section) => (
        <div key={section.title} className={cn("summary-card", section === steps && "is-steps")}>
          <p className="summary-section-title">{section.title}</p>
          {section === steps ? <Steps section={section} /> : <Points section={section} compact />}
        </div>
      ))}
    </div>
  );
}
