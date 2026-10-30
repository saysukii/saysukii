import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

export const Route = createFileRoute("/email-preview")({
  head: () => ({
    meta: [{ title: "Email designs — Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: EmailPreviewPage,
});

const loadEmailPreviews = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ origin: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const { inquiryReceivedHtml } = await import("@/lib/os/inquiry-email.server");
    const { changeRequestHtml } = await import("@/lib/os/change-request-email.server");
    const { bookingHtml } = await import("@/lib/os/booking-email.server");
    const { balanceReminderHtml, clientPaidHtml, studioPaidHtml } =
      await import("@/lib/os/paid-email.server");
    // paid in october for a dinner next march, so the balance falls due in february
    const paid = {
      clientName: "Fenty Beauty",
      invoiceNumber: "SS103",
      amountCents: 400250,
      paidCents: 400250,
      totalCents: 400250,
      booking: true,
      occasion: "private dinner",
      eventDate: "2027-03-12",
      paidAt: "2026-10-29T21:20:00.000Z",
      attachments: ["Say Sukii receipt SS103.pdf", "Floral Service Agreement.pdf"],
      inquiryId: "fenty-beauty",
      eventType: "private",
    };
    const deposit = { ...paid, amountCents: 200125, paidCents: 200125 };
    const balance = {
      ...paid,
      amountCents: 200125,
      booking: false,
      paidAt: "2027-02-08T16:00:00.000Z",
      attachments: ["Say Sukii receipt SS103.pdf"],
    };
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
      ...(
        [
          ["events", "Nia Okafor", "brand_activation", "Soho House, Miami Beach"],
          ["deliveries", "Jordan Pierre", "other", "Little Haiti, Miami"],
          ["flowers", "Ana Ruiz", "subscription", "Coconut Grove, Miami"],
        ] as const
      ).map(([kind, clientName, eventType, venue]) => ({
        caption: `to the studio — someone writes in about ${kind}`,
        html: inquiryReceivedHtml(
          {
            clientName,
            email: `${clientName.split(" ")[0]?.toLowerCase()}@example.com`,
            eventDate: "2027-02-06",
            eventType,
            venue,
          },
          origin,
        ),
      })),
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
        caption:
          "to the client — the deposit books the project (receipt + signed agreement attached)",
        html: clientPaidHtml(deposit, origin),
      },
      {
        caption: "to the studio — a deposit books the project",
        html: studioPaidHtml(deposit, origin),
      },
      {
        caption:
          "to the client — paid in full at once books the project (receipt + agreement attached)",
        html: clientPaidHtml(paid, origin),
      },
      {
        caption: "to the studio — paid in full at once books the project",
        html: studioPaidHtml(paid, origin),
      },
      {
        caption: "to the client — the balance is paid, a thank-you (receipt attached)",
        html: clientPaidHtml(balance, origin),
      },
      {
        caption: "to the studio — the balance is paid",
        html: studioPaidHtml(balance, origin),
      },
      ...(["soon", "today"] as const).map((when) => ({
        caption:
          when === "soon"
            ? "to the client — the balance is due in five days (35 days before the event)"
            : "to the client — the balance is due today (30 days before the event)",
        html: balanceReminderHtml(
          {
            clientName: "Fenty Beauty",
            invoiceNumber: "SS103",
            balanceCents: 200125,
            occasion: "private dinner",
            eventDate: "2027-03-12",
            when,
            payUrl: `${origin}/fenty-beauty`,
            eventType: "private",
          },
          origin,
        ),
      })),
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
    <>
      {/* what this letter is, above it */}
      <p
        style={{
          margin: 0,
          padding: "28px 24px 0",
          color: "rgba(36, 34, 31, 0.55)",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        {title}
      </p>
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
    </>
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

  // client letters first, then the studio's own notes, each under its own heading
  const groups = [
    {
      title: "to clients",
      letters: shown.filter((item) => item.caption.startsWith("to the client")),
    },
    {
      title: "to the studio",
      letters: shown.filter((item) => item.caption.startsWith("to the studio")),
    },
  ].filter((group) => group.letters.length);

  return (
    <main style={{ margin: 0, background: "#f5e6e8" }}>
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2
            style={{
              margin: 0,
              padding: "40px 24px 8px",
              color: "#ff4d94",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textAlign: "center",
              textTransform: "uppercase",
            }}
          >
            {group.title} · {group.letters.length}
          </h2>
          {group.letters.map((item) => (
            <LetterFrame
              key={item.caption}
              title={item.caption.replace(/^to (the client|the studio) — /, "")}
              html={item.html}
            />
          ))}
        </section>
      ))}
    </main>
  );
}
