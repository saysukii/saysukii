import { knockPageGround } from "@/lib/proposal-ground";

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    background?: string;
  }) => { promise: Promise<void> };
  cleanup: () => void;
};

export type ProposalDocument = {
  numPages: number;
  getPage: (number: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

async function pdfBytes(src: string) {
  if (!src.startsWith("data:")) return null;
  const comma = src.indexOf(",");
  const binary = atob(src.slice(comma + 1));
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return data;
}

let opening: Promise<unknown> = Promise.resolve();

async function loadProposal(src: string): Promise<ProposalDocument> {
  const pdfjs = await import("pdfjs-dist");
  // The module worker never answers in this browser. Importing it on the page
  // installs the same handler, and pdf.js then paints on the main thread.
  // @ts-expect-error pdf.js ships this worker without a declaration file.
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
  const data = await pdfBytes(src);
  const bytes = data ?? new Uint8Array(await (await fetch(src)).arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  return task.promise as unknown as Promise<ProposalDocument>;
}

export function openProposal(src: string, cancelled: () => boolean = () => false) {
  const run = opening.then(async () => {
    if (cancelled()) return null;
    const doc = await loadProposal(src);
    if (cancelled()) {
      await doc.destroy();
      return null;
    }
    return doc;
  });
  opening = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function releaseProposal(doc: ProposalDocument | null) {
  if (!doc) return;
  const run = opening.then(() => doc.destroy());
  opening = run.then(
    () => undefined,
    () => undefined,
  );
}

export async function paintProposalPage(
  doc: ProposalDocument,
  pageNumber: number,
  host: HTMLElement,
  cancelled: () => boolean,
) {
  const page = await doc.getPage(pageNumber);
  if (cancelled()) {
    page.cleanup();
    return;
  }
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1600 / base.width, 2) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("could not open the proposal");
  await page.render({ canvasContext: context, viewport, background: "rgba(0,0,0,0)" }).promise;
  if (cancelled()) {
    page.cleanup();
    return;
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  knockPageGround(pixels);
  context.putImageData(pixels, 0, 0);
  host.replaceChildren(canvas);
  page.cleanup();
}
