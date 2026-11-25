import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BloomWait } from "@/components/portal/StudioLoader";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { viewable } from "@/lib/os/viewable-file";
import { openProposal, releaseProposal, type ProposalDocument } from "@/lib/proposal-pages";

/** one page, drawn as a picture, so there's no text to select or file to save */
function Page({ doc, number, width }: { doc: ProposalDocument; number: number; width: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled || !host.current) return page.cleanup();
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: Math.min((width * ratio) / base.width, 3) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvasContext: context, viewport, background: "#fff" }).promise;
      page.cleanup();
      if (!cancelled) host.current?.replaceChildren(canvas);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, number, width]);
  return <div ref={host} className="studio-viewer-canvas" />;
}

/**
 * A logistics file, as the team sees it: inside the studio, in a pop-up, drawn page by page. No
 * download, no printing, no right-click to save, and marked for internal use only.
 */
export function ProtectedFile({
  file,
  onClose,
}: {
  file: { name: string; href: string | null; file_type: string | null } | null;
  onClose: () => void;
}) {
  const kind = file ? viewable(file) : null;
  const [doc, setDoc] = useState<ProposalDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(820);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file?.href || kind !== "pdf") return;
    let cancel = false;
    let opened: ProposalDocument | null = null;
    setDoc(null);
    setFailed(false);
    void openProposal(file.href, () => cancel)
      .then((result) => {
        if (cancel || !result) return;
        opened = result;
        setDoc(result);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
      releaseProposal(opened);
    };
  }, [file?.href, kind]);

  // no saving or printing while it's open
  useEffect(() => {
    if (!file) return;
    const block = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && ["s", "p"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const measure = () => {
      if (body.current) setWidth(Math.max(280, body.current.clientWidth - 32));
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [file]);

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        overlayClassName="studio-task-veil"
        className="studio-file-viewer"
        hideClose
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="studio-viewer-head">
          <DialogTitle className="studio-viewer-title">{file?.name}</DialogTitle>
          <DialogDescription className="sr-only">
            the file, for viewing in the studio only.
          </DialogDescription>
          <span className="studio-viewer-note">FOR INTERNAL USE ONLY</span>
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <div ref={body} className="studio-viewer-body">
          {!file?.href ? (
            <p className="studio-prod-muted">this file didn't open. try again in a moment.</p>
          ) : kind === "image" ? (
            <div className="studio-viewer-page">
              <img
                src={file.href}
                alt={file.name}
                draggable={false}
                onContextMenu={(event) => event.preventDefault()}
              />
            </div>
          ) : failed ? (
            <p className="studio-prod-muted">this file didn't open. try again in a moment.</p>
          ) : !doc ? (
            <BloomWait label="opening the file" compact />
          ) : (
            Array.from({ length: doc.numPages }, (_, index) => (
              <div key={index} className="studio-viewer-page">
                <Page doc={doc} number={index + 1} width={width} />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
