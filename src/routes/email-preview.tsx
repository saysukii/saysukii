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
    const { addOnInvoiceHtml, balanceReminderHtml, clientPaidHtml, studioPaidHtml } =
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
      inquiryId: "fenty-beauty",
      eventType: "private",
    };
    const deposit = { ...paid, amountCents: 200125, paidCents: 200125 };
    const balance = {
      ...paid,
      amountCents: 200125,
      booking: false,
      paidAt: "2027-02-08T16:00:00.000Z",
    };
    // after booking, they asked for an extra arrangement and were billed for it on its own
    const addOn = {
      ...paid,
      invoiceNumber: "SS108",
      amountCents: 38500,
      paidCents: 38500,
      totalCents: 38500,
      booking: false,
      addOn: true,
      occasion: "add-ons",
      paidAt: "2026-11-02T18:00:00.000Z",
    };
    const origin = data.origin.replace(/\/$/, "");
    const { teamInviteHtml, hoursSummaryHtml } = await import("@/lib/os/production-email");
    const { hoursCsv, hoursSummary } = await import("@/lib/os/production");
    // a sample production a week out: two people's shifts, one hourly and one flat
    const shift = (
      profile_id: string,
      day: string,
      starts: string,
      ends: string,
      role: string,
      location: string,
    ) => ({ profile_id, day, starts, ends, role, location });
    const shifts = [
      shift("cara", "2026-11-30", "10:00", "18:00", "production", "studio"),
      shift("cara", "2026-12-01", "09:00", "13:00", "production", "studio"),
      shift("cara", "2026-12-03", "10:00", "22:00", "lead", "studio"),
      shift("cara", "2026-12-04", "07:00", "13:00", "install", "venue"),
      shift("nina", "2026-11-30", "14:00", "22:00", "production hands", "studio"),
      shift("nina", "2026-12-04", "07:00", "13:00", "install", "venue"),
      shift("nina", "2026-12-04", "18:00", "23:00", "breakdown", "venue"),
    ];
    const summary = hoursSummary(
      shifts,
      new Map([
        ["cara", "Cara Ortiz"],
        ["nina", "Nina Park"],
      ]),
      { cara: { cents: 2800, per: "hour" }, nina: { cents: 40000, per: "production" } },
    );
    const productionUrl = `${origin}/production/lumen-studio-live-labs`;
    return [
      {
        caption:
          "to the team — invited to the studio: sent when sukii first shares a production they're on",
        html: teamInviteHtml({
          link: `${origin}/onboarding?walk=1`,
          role: "team",
          invitedBy: "Sukii",
          given: "Maya Lopez",
          projectName: "Lumen Studio: Live + Labs",
          origin,
        }),
      },
      {
        caption: "to the team — an admin invited from the gang",
        html: teamInviteHtml({
          link: `${origin}/onboarding?walk=1`,
          role: "admin",
          invitedBy: "Sukii",
          given: "Cara Ortiz",
          origin,
        }),
      },
      {
        caption:
          "to the studio — the hours for a production, at each person's rate (the spreadsheet is attached for google sheets)",
        html: hoursSummaryHtml({
          projectName: "Lumen Studio: Live + Labs",
          range: "11/30 – 12/4",
          url: productionUrl,
          summary,
          origin,
        }),
        sheet: {
          name: "lumen-studio-live-labs-hours.csv",
          csv: hoursCsv("Lumen Studio: Live + Labs", summary),
        },
      },
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
          ["subscriptions", "Ana Ruiz", "subscription", "Coconut Grove, Miami"],
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
          "to the client — the deposit books the project (proposal + signed agreement + receipt attached)",
        html: clientPaidHtml(deposit, origin),
      },
      {
        caption: "to the studio — a deposit books the project",
        html: studioPaidHtml(deposit, origin),
      },
      {
        caption:
          "to the client — paid in full at once books the project (proposal + agreement + receipt attached)",
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
      {
        caption: "to the client — an add-on invoice (extras they asked for after booking)",
        html: addOnInvoiceHtml(
          {
            clientName: "Fenty Beauty",
            invoiceNumber: "SS108",
            amountCents: 38500,
            eventDate: "2027-03-12",
            payUrl: `${origin}/fenty-beauty/invoice/SS108`,
            eventType: "private",
          },
          origin,
        ),
      },
      {
        caption: "to the client — the add-on is paid, a thank-you (receipt attached)",
        html: clientPaidHtml(addOn, origin),
      },
      {
        caption: "to the studio — an add-on is paid",
        html: studioPaidHtml(addOn, origin),
      },
      ...(["soon", "today", "now"] as const).map((when) => ({
        caption: {
          soon: "to the client — the balance is due in five days (35 days before the event)",
          today: "to the client — the balance is due today (30 days before the event)",
          now: "to the client — the studio sends the balance invoice by hand",
        }[when],
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

/** read a csv the way a spreadsheet does: commas between cells, quotes around ones with commas */
function readCsv(csv: string) {
  return csv.split("\n").map((line) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (quoted && char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  });
}

/** the attached spreadsheet, the way it opens in google sheets, and the file itself to download */
function SheetPreview({ name, csv }: { name: string; csv: string }) {
  const [head = [], ...rows] = readCsv(csv);
  const numeric = (value: string) => /^\d+(\.\d+)?$/.test(value);
  const letter = (index: number) => String.fromCharCode(65 + index);
  const cell = {
    padding: "5px 10px",
    border: "1px solid #e2e3e3",
    whiteSpace: "nowrap" as const,
    fontSize: 12,
    color: "#1f1f1f",
  };
  const gutter = {
    ...cell,
    background: "#f8f9fa",
    color: "#5f6368",
    fontSize: 11,
    textAlign: "center" as const,
  };
  return (
    <figure style={{ maxWidth: 1040, margin: "0 auto", padding: "8px 24px 40px" }}>
      <figcaption
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "0 0 10px",
          color: "rgba(36, 34, 31, 0.55)",
          fontSize: 13,
        }}
      >
        <span>the attached spreadsheet, as it opens in google sheets</span>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
          download={name}
          style={{ color: "#ff4d94" }}
        >
          download {name}
        </a>
      </figcaption>
      <div
        style={{
          overflowX: "auto",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 10px 30px rgba(36, 34, 31, 0.08)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...gutter, width: 36 }} />
              {head.map((_, index) => (
                <th key={index} style={gutter}>
                  {letter(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={gutter}>1</td>
              {head.map((value) => (
                <td key={value} style={{ ...cell, fontWeight: 700 }}>
                  {value}
                </td>
              ))}
            </tr>
            {rows.map((row, at) => (
              <tr key={at}>
                <td style={gutter}>{at + 2}</td>
                {row.map((value, index) => (
                  <td key={index} style={{ ...cell, textAlign: numeric(value) ? "right" : "left" }}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

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
  const [letters, setLetters] = useState<
    Array<{ caption: string; html: string; sheet?: { name: string; csv: string } }>
  >([]);
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

  // client letters first, then the team's, then the studio's own notes, each under its heading
  const groups = [
    {
      title: "to clients",
      letters: shown.filter((item) => item.caption.startsWith("to the client")),
    },
    {
      title: "to the team",
      letters: shown.filter((item) => item.caption.startsWith("to the team")),
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
            <div key={item.caption}>
              <LetterFrame
                title={item.caption.replace(/^to (the client|the team|the studio) — /, "")}
                html={item.html}
              />
              {item.sheet ? <SheetPreview {...item.sheet} /> : null}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
