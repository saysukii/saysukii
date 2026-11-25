import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BloomWait } from "@/components/portal/StudioLoader";
import { knockPageGround } from "@/lib/proposal-ground";
import { openProposal, releaseProposal, type ProposalDocument } from "@/lib/proposal-pages";
import { cn } from "@/lib/utils";

/**
 * One pdf page, drawn the way the shared proposal draws it: the page's own flat wash lifted off so
 * it sits on the packet's blush paper.
 */
async function paintPage(
  doc: ProposalDocument,
  pageNumber: number,
  host: HTMLElement,
  width: number,
  cancelled: () => boolean,
) {
  const page = await doc.getPage(pageNumber);
  if (cancelled()) {
    page.cleanup();
    return;
  }
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(width / base.width, 2.5) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  await page.render({ canvasContext: context, viewport, background: "rgba(0,0,0,0)" }).promise;
  page.cleanup();
  if (cancelled()) return;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  knockPageGround(pixels);
  context.putImageData(pixels, 0, 0);
  host.replaceChildren(canvas);
}

/**
 * Pages of a pdf, one under the other. With no pages named it draws them all (the vision's own pdf
 * holds only the chosen pages); with pages named it draws just those (the preview, and the picker).
 */
export function VisionPages({
  src,
  pages,
  width = 1800,
  className,
  onCount,
  renderPage,
  carousel = false,
}: {
  src: string;
  pages?: number[] | undefined;
  width?: number;
  className?: string;
  onCount?: (count: number) => void;
  /** wraps each drawn page, for the picker's toggles */
  renderPage?: (pageNumber: number, canvas: React.ReactNode) => React.ReactNode;
  /** one page at a time, scrolling sideways to the next */
  carousel?: boolean;
}) {
  const [doc, setDoc] = useState<ProposalDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => {
    let cancel = false;
    let opened: ProposalDocument | null = null;
    setDoc(null);
    setFailed(false);
    void openProposal(src, () => cancel)
      .then((result) => {
        if (cancel || !result) return;
        opened = result;
        onCountRef.current?.(result.numPages);
        setDoc(result);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
      releaseProposal(opened);
    };
  }, [src]);

  if (failed)
    return <p className="studio-prod-empty">the pages didn't open. try again in a moment.</p>;
  if (!doc) return <BloomWait label="opening the pages" compact />;

  const shown = (
    pages?.length ? pages : Array.from({ length: doc.numPages }, (_, i) => i + 1)
  ).filter((page) => page >= 1 && page <= doc.numPages);
  if (carousel) {
    return (
      <VisionCarousel className={className}>
        {shown.map((page) => (
          <VisionPage key={page} doc={doc} page={page} width={width} />
        ))}
      </VisionCarousel>
    );
  }
  return (
    <div className={cn("studio-prod-vision-pages", className)}>
      {shown.map((page) => {
        const canvas = <VisionPage key={page} doc={doc} page={page} width={width} />;
        return renderPage ? <div key={page}>{renderPage(page, canvas)}</div> : canvas;
      })}
    </div>
  );
}

/** pages side by side, one in view, snapping as you scroll; arrows and a count for a mouse */
function VisionCarousel({
  className,
  children,
}: {
  className?: string | undefined;
  children: React.ReactNode[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const count = children.length;

  function go(to: number) {
    const node = track.current;
    if (!node) return;
    const next = Math.max(0, Math.min(count - 1, to));
    node.scrollTo({ left: next * node.clientWidth, behavior: "smooth" });
  }

  return (
    <div className={cn("studio-prod-vision-carousel", className)}>
      <div
        ref={track}
        className="studio-prod-vision-track"
        onScroll={(event) => {
          const node = event.currentTarget;
          setAt(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)));
        }}
      >
        {children.map((child, index) => (
          <div key={index} className="studio-prod-vision-slide" aria-hidden={index !== at}>
            {child}
          </div>
        ))}
      </div>
      {count > 1 ? (
        <div className="studio-prod-vision-nav">
          <button
            type="button"
            aria-label="previous page"
            disabled={at === 0}
            onClick={() => go(at - 1)}
          >
            <ChevronLeft aria-hidden="true" strokeWidth={1.5} />
          </button>
          <span>
            {at + 1} / {count}
          </span>
          <button
            type="button"
            aria-label="next page"
            disabled={at >= count - 1}
            onClick={() => go(at + 1)}
          >
            <ChevronRight aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VisionPage({ doc, page, width }: { doc: ProposalDocument; page: number; width: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancel = false;
    void paintPage(doc, page, node, width, () => cancel).catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [doc, page, width]);
  return <div ref={host} className="studio-prod-vision-page" aria-label={`page ${page}`} />;
}
