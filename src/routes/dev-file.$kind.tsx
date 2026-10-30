import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { renderDemoFile } from "@/lib/dev-demo-files.functions";
import { fentyDemoProposal } from "@/lib/preview-proposals";

// local only: opens the fenty demo's signed agreement or receipt from the inquiry's files tab
export const Route = createFileRoute("/dev-file/$kind")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: DemoFile,
});

/** the owner's stand-in signature, drawn to a png the pdf can hold */
async function studioSignaturePng() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140" viewBox="0 0 480 140"><path d="M24 92c18-58 46-70 52-30s-20 56-4 40 40-70 60-58-10 62 6 52 30-44 46-40-6 40 10 36 26-30 40-28 2 24 16 22 30-18 44-16" fill="none" stroke="#24221f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 140;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function DemoFile() {
  const { kind } = Route.useParams();
  const render = useServerFn(renderDemoFile);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    void (async () => {
      const demo = fentyDemoProposal();
      if (!demo.signedName || !demo.signedAt || (kind !== "agreement" && kind !== "receipt")) {
        setProblem("sign and pay the fenty demo first.");
        return;
      }
      const base64 = await render({
        data: {
          kind,
          number: demo.number,
          clientName: demo.clientName,
          clientEmail: demo.clientEmail ?? "",
          clientPhone: demo.clientPhone ?? "",
          eventLabel: demo.eventLabel,
          eventDate: demo.eventDate,
          venue: demo.venueText,
          totalCents: demo.totalCents,
          depositCents: demo.depositCents,
          courtesyCents: demo.courtesyCents ?? 0,
          paidAt: demo.paidAt ?? null,
          client: {
            first: demo.signer?.first ?? "",
            last: demo.signer?.last ?? "",
            image: demo.signedName,
            signedAt: demo.signedAt,
          },
          studio: {
            first: "Sukii",
            last: "",
            image: await studioSignaturePng(),
            signedAt: demo.signedAt,
          },
        },
      });
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      window.location.replace(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    })().catch((error: unknown) =>
      setProblem(error instanceof Error ? error.message : "could not open the file."),
    );
  }, [kind, render]);

  return <p style={{ padding: 24, fontSize: 13 }}>{problem || "opening…"}</p>;
}
