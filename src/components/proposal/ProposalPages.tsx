import { useEffect, useRef, useState } from "react";

import { BloomWait } from "@/components/portal/StudioLoader";
import { openProposal, paintProposalPage, releaseProposal, type ProposalDocument } from "@/lib/proposal-pages";

export function ProposalPages({
  src,
  page,
  onPages,
}: {
  src: string;
  page: number;
  onPages?: (count: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const docRef = useRef<ProposalDocument | null>(null);
  const onPagesRef = useRef(onPages);
  onPagesRef.current = onPages;
  const [state, setState] = useState<"opening" | "ready" | "failed">("opening");

  useEffect(() => {
    let cancel = false;
    setState("opening");
    host.current?.replaceChildren();
    void openProposal(src, () => cancel)
      .then((opened) => {
        if (cancel || !opened) return;
        docRef.current = opened;
        onPagesRef.current?.(opened.numPages);
        setState("ready");
      })
      .catch(() => {
        if (!cancel) setState("failed");
      });
    return () => {
      cancel = true;
      const previous = docRef.current;
      docRef.current = null;
      releaseProposal(previous);
    };
  }, [src]);

  useEffect(() => {
    const doc = docRef.current;
    const node = host.current;
    if (state !== "ready" || !doc || !node) return;
    let cancel = false;
    const index = Math.min(Math.max(page, 0), Math.max(doc.numPages - 1, 0)) + 1;
    void paintProposalPage(doc, index, node, () => cancel).catch(() => {
      if (!cancel) setState("failed");
    });
    return () => {
      cancel = true;
    };
  }, [page, state, src]);

  if (state === "failed") {
    return <iframe title="Proposal" src={`${src}#toolbar=0&navpanes=0&page=${page + 1}`} className="client-packet-frame" />;
  }

  return (
    <div className="client-packet-pages">
      {state === "opening" ? <BloomWait label="opening the proposal" compact /> : null}
      <div ref={host} />
    </div>
  );
}
