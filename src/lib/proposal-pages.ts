import { knockPageGround } from "@/lib/proposal-ground";

async function pdfBytes(src: string) {
  if (!src.startsWith("data:")) return null;
  const comma = src.indexOf(",");
  const binary = atob(src.slice(comma + 1));
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return data;
}

export async function paintProposal(src: string, host: HTMLElement, cancelled: () => boolean) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = await pdfBytes(src);
  const task = pdfjs.getDocument(data ? { data, isEvalSupported: false } : { url: src, isEvalSupported: false });
  const doc = await task.promise;
  try {
    for (let number = 1; number <= doc.numPages; number += 1) {
      if (cancelled()) return;
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1600 / base.width, 2) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("could not open the proposal");
      await page.render({ canvasContext: context, viewport, background: "rgba(0,0,0,0)" }).promise;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      knockPageGround(pixels);
      context.putImageData(pixels, 0, 0);
      if (cancelled()) return;
      host.append(canvas);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}
