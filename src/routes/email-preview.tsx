import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

export const Route = createFileRoute("/email-preview")({
  head: () => ({
    meta: [
      { title: "Email designs — Say Sukii" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmailPreviewPage,
});

const loadEmailPreviews = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ origin: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const { inquiryReceivedHtml } = await import("@/lib/os/inquiry-email.server");
    const { changeRequestHtml } = await import("@/lib/os/change-request-email.server");
    const { bookingHtml } = await import("@/lib/os/booking-email.server");
    const { renderSaySukiiEmail } = await import("@/lib/os/email-layout");
    const origin = data.origin.replace(/\/$/, "");
    return [
      {
        caption: "to the studio — someone finishes the inquiry form",
        html: inquiryReceivedHtml(
          {
            clientName: "Camila Reyes",
            email: "camila.reyes@gmail.com",
            eventDate: "2027-03-14",
            eventType: "wedding",
            venue: "The W Hotel, Fort Lauderdale",
          },
          origin,
        ),
      },
      {
        caption: "to the studio — a client asks for a change",
        html: changeRequestHtml(
          {
            clientName: "Fenty Beauty",
            clientEmail: "studio@fentybeauty.example",
            eventDate: "2026-09-17",
            place: "The Shelbourne by Proper, Miami Beach",
            investment: "$4,610",
            note: "Please shift the roses toward a deeper pink.",
          },
          origin,
        ),
      },
      {
        caption: "to the client — a conversation is booked",
        html: bookingHtml(
          {
            startsAt: "2026-10-22T18:30:00.000Z",
            name: "Amelia Chen",
            email: "amelia@example.com",
            note: "vizcaya palette",
            durationMinutes: 30,
          },
          origin,
        ),
      },
      {
        caption: "to the client — the deposit is paid",
        html: renderSaySukiiEmail({
          origin,
          eyebrow: "deposit",
          eyebrowColor: "#6F8A72",
          headline: "your date is held",
          body: "thank you, Camila Reyes. your deposit is complete and your project has moved into the studio.",
          facts: [{ label: "proposal", value: "SS-1042" }],
        }),
      },
    ];
  });

function LetterFrame({ title, html }: { title: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);

  function fit() {
    const doc = frame.current?.contentDocument;
    const next = doc?.documentElement.scrollHeight ?? 0;
    if (next > 0) setHeight(next);
  }

  return (
    <iframe
      ref={frame}
      title={title}
      srcDoc={html}
      onLoad={fit}
      style={{
        display: "block",
        width: "100%",
        height,
        border: 0,
        background: "#f5e6e8",
      }}
    />
  );
}

const DEVICES = [
  { id: "phone", label: "phone", screen: 200, tall: 430, layout: 390 },
  { id: "tablet", label: "tablet", screen: 300, tall: 430, layout: 768 },
  { id: "desktop", label: "desktop", screen: 360, tall: 460, layout: 640 },
] as const;

function DeviceMock({
  id,
  label,
  screen,
  tall,
  layout,
  title,
  html,
}: {
  id: string;
  label: string;
  screen: number;
  tall: number;
  layout: number;
  title: string;
  html: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [letterHeight, setLetterHeight] = useState(780);
  const scale = screen / layout;
  const shown = Math.min(tall, Math.max(280, Math.round(letterHeight * scale)));

  function fit() {
    const next = frame.current?.contentDocument?.documentElement.scrollHeight ?? 0;
    if (next > 0) setLetterHeight(next);
  }

  return (
    <figure className={`email-device is-${id}`}>
      <div className="email-device-bezel">
        {id === "phone" ? <div className="email-device-ear" /> : null}
        {id === "desktop" ? (
          <div className="email-device-bar" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : null}
        <div className="email-device-screen" style={{ width: screen, height: shown }}>
          <iframe
            ref={frame}
            title={`${title} on ${label}`}
            srcDoc={html}
            onLoad={fit}
            style={{ width: layout, height: letterHeight, transform: `scale(${scale})` }}
          />
        </div>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function EmailPreviewPage() {
  const load = useServerFn(loadEmailPreviews);
  const [letters, setLetters] = useState<Array<{ caption: string; html: string }>>([]);
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const focus = params.get("letter");
  const mockup = params.get("mockup") === "1";

  useEffect(() => {
    void load({ data: { origin: window.location.origin } }).then(setLetters);
  }, [load]);

  const shown = focus ? letters.filter((letter) => letter.caption.includes(focus)) : letters;
  const letter = shown[0];

  if (mockup && letter) {
    return (
      <main className="email-mock">
        {DEVICES.map((device) => (
          <DeviceMock key={device.id} {...device} title={letter.caption} html={letter.html} />
        ))}
      </main>
    );
  }

  return (
    <main style={{ margin: 0, background: "#f5e6e8" }}>
      {shown.map((item) => (
        <LetterFrame key={item.caption} title={item.caption} html={item.html} />
      ))}
    </main>
  );
}
