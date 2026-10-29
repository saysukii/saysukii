import type { ReactNode } from "react";

import { Wordmark } from "@/components/portal/bits";
import { floralAgreementBlocks, type FloralAgreementFields } from "@/lib/floral-agreement";

export function FloralAgreement({
  fields,
  signature,
}: {
  fields: FloralAgreementFields;
  signature?: ReactNode;
}) {
  return (
    <article className="client-packet-agreement">
      <Wordmark tone="ink" className="client-packet-mark is-center" />
      {floralAgreementBlocks(fields).map((block, index) => {
        if (block.kind === "title") return <h2 key={index}>{block.text}</h2>;
        if (block.kind === "heading") return <h3 key={index}>{block.text}</h3>;
        if (block.kind === "subhead")
          return (
            <p key={index} className="is-subhead">
              {block.text}
            </p>
          );
        if (block.kind === "note")
          return (
            <p key={index} className="is-note">
              {block.text}
            </p>
          );
        if (block.kind === "line")
          return (
            <p key={index} className="is-line">
              {block.text}
            </p>
          );
        return <p key={index}>{block.text}</p>;
      })}
      {signature ? <div className="client-packet-agreement-sign">{signature}</div> : null}
    </article>
  );
}
