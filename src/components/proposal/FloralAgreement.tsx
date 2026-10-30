import type { ReactNode } from "react";

import { Wordmark } from "@/components/portal/bits";
import {
  AGREEMENT_CONSENT,
  agreementSignedLine,
  floralAgreementBlocks,
  type FloralAgreementFields,
} from "@/lib/floral-agreement";

export type SignerNames = {
  first: string;
  last: string;
  /** while the client can sign, they type their own name */
  onFirst?: (value: string) => void;
  onLast?: (value: string) => void;
};

/** Say Sukii's countersignature, from the owner's signature in settings */
export type StudioCountersign = {
  first: string;
  last: string;
  signature: ReactNode;
  signedAt: string;
};

export function FloralAgreement({
  fields,
  signature,
  signedAt,
  signer,
  studio,
}: {
  fields: FloralAgreementFields;
  /** the client's signature: a pad to draw on, the drawn ink, or a note to accept first */
  signature?: ReactNode;
  signedAt?: string | null | undefined;
  signer?: SignerNames;
  studio?: StudioCountersign | null;
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
      <AgreementSignatures
        signer={signer}
        signature={signature}
        signedAt={signedAt}
        studio={studio}
      />
    </article>
  );
}

/** Authorization: the client signs first, then Say Sukii countersigns. */
function AgreementSignatures({
  signer,
  signature,
  signedAt,
  studio,
}: {
  signer?: SignerNames | undefined;
  signature?: ReactNode;
  signedAt?: string | null | undefined;
  studio?: StudioCountersign | null | undefined;
}) {
  return (
    <section className="client-packet-auth" aria-label="authorization and confirmation">
      <h3>Authorization / confirmation</h3>

      <h4>Client signature</h4>
      <p>{AGREEMENT_CONSENT}</p>
      <div className="client-packet-auth-names">
        <NameLine
          label="First name"
          value={signer?.first ?? ""}
          onChange={signer?.onFirst}
          autoComplete="given-name"
        />
        <NameLine
          label="Last name"
          value={signer?.last ?? ""}
          onChange={signer?.onLast}
          autoComplete="family-name"
        />
      </div>
      <p className="client-packet-auth-label">Signature</p>
      <div className="client-packet-auth-box">{signature ?? <em>Sign here</em>}</div>
      <p className="client-packet-auth-when">
        {signedAt
          ? `Signed ${agreementSignedLine(signedAt)}`
          : "The date and time are recorded once the agreement is signed."}
      </p>

      <h4>Say Sukii signature</h4>
      {studio ? (
        <>
          <div className="client-packet-auth-names">
            <NameLine label="First name" value={studio.first} autoComplete="off" />
            <NameLine label="Last name" value={studio.last} autoComplete="off" />
          </div>
          <p className="client-packet-auth-label">Signature</p>
          <div className="client-packet-auth-box">{studio.signature}</div>
          <p className="client-packet-auth-when">Signed {agreementSignedLine(studio.signedAt)}</p>
        </>
      ) : (
        <>
          <div className="client-packet-auth-names">
            <span>
              {" "}
              <small>First name</small>
            </span>
            <span>
              {" "}
              <small>Last name</small>
            </span>
          </div>
          <p className="client-packet-auth-label">Signature</p>
          <div className="client-packet-auth-box">
            <em>Say Sukii signs here</em>
          </div>
          <p className="client-packet-auth-when">The date is recorded once Say Sukii signs.</p>
        </>
      )}
    </section>
  );
}

/** A name line: a field while the client signs, the name once signed, blank otherwise. */
function NameLine({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange?: ((value: string) => void) | undefined;
  autoComplete: string;
}) {
  if (onChange) {
    return (
      <label>
        <input
          value={value}
          placeholder={label}
          autoComplete={autoComplete}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }
  // the name sits in its line; until there is one, the line reads its label
  return (
    <span className={value ? undefined : "is-empty"} aria-label={label}>
      {value || label}
    </span>
  );
}
