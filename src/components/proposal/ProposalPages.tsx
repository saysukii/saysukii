import { useEffect, useRef, useState } from "react";

export function ProposalPages({ src }: { src: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"opening" | "ready" | "failed">("opening");

  useEffect(() => {
    const node = host.current;
    if (!node || !src) return;
    let cancel = false;
    node.replaceChildren();
    setState("opening");
    void import("@/lib/proposal-pages")
      .then(({ paintProposal }) => paintProposal(src, node, () => cancel))
      .then(() => {
        if (!cancel) setState("ready");
      })
      .catch(() => {
        if (!cancel) setState("failed");
      });
    return () => {
      cancel = true;
    };
  }, [src]);

  if (state === "failed") {
    return <iframe title="Proposal" src={`${src}#toolbar=0&navpanes=0`} className="client-packet-frame" />;
  }

  return (
    <div className="client-packet-pages">
      {state === "opening" ? <p className="client-packet-copy">opening the proposal</p> : null}
      <div ref={host} />
    </div>
  );
}
