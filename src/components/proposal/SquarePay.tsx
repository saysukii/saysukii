import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { formatMoneyExact } from "@/lib/money";
import { getSquarePayConfig, payProposalDeposit } from "@/lib/os/proposals.functions";

// the small slice of square's web payments sdk this page uses
type SquareTokenResult = {
  status: string;
  token?: string;
  errors?: Array<{ message?: string }>;
};
type SquareCard = {
  attach: (selector: string | HTMLElement) => Promise<void>;
  tokenize: (verification?: unknown) => Promise<SquareTokenResult>;
  destroy: () => Promise<boolean>;
};
type SquareApplePay = { tokenize: () => Promise<SquareTokenResult> };
type SquarePayments = {
  card: (options?: { style?: Record<string, Record<string, string>> }) => Promise<SquareCard>;
  paymentRequest: (request: unknown) => unknown;
  applePay: (request: unknown) => Promise<SquareApplePay>;
};
type SquareGlobal = { payments: (applicationId: string, locationId: string) => SquarePayments };

declare global {
  interface Window {
    Square?: SquareGlobal;
  }
}

const SDK = {
  sandbox: "https://sandbox.web.squarecdn.com/v1/square.js",
  production: "https://web.squarecdn.com/v1/square.js",
};

// square's card fields sit in their own secure frame; these are the styles it lets us set
const CARD_STYLE = {
  ".input-container": { borderColor: "rgba(36, 34, 31, 0.14)", borderRadius: "14px" },
  ".input-container.is-focus": { borderColor: "#ff4d94" },
  ".input-container.is-error": { borderColor: "#c45d72" },
  input: { backgroundColor: "#fffafb", color: "#24221f", fontSize: "15px" },
  "input::placeholder": { color: "rgba(36, 34, 31, 0.4)" },
  ".message-text": { color: "rgba(36, 34, 31, 0.55)" },
  ".message-icon": { color: "rgba(36, 34, 31, 0.55)" },
  ".message-text.is-error": { color: "#c45d72" },
  ".message-icon.is-error": { color: "#c45d72" },
};

function loadSquare(src: string) {
  return new Promise<SquareGlobal>((resolve, reject) => {
    if (window.Square) return resolve(window.Square);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () =>
      window.Square ? resolve(window.Square) : reject(new Error("square did not load")),
    );
    script.addEventListener("error", () => reject(new Error("square did not load")));
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/**
 * The deposit, paid right on the invoice: apple pay where the device has it, and square's secure
 * card fields in the studio's own look. Square processes the payment; the card never touches the app.
 */
export function SquarePay({
  token,
  amountCents,
  clientName,
  clientEmail,
  fallbackHref,
  onPaid,
}: {
  token: string;
  amountCents: number;
  clientName: string;
  clientEmail: string;
  /** square's own checkout page, if one was made, for when the fields here can't load */
  fallbackHref?: string | null;
  onPaid: () => void;
}) {
  const fetchConfig = useServerFn(getSquarePayConfig);
  const pay = useServerFn(payProposalDeposit);
  const cardHost = useRef<HTMLDivElement>(null);
  const card = useRef<SquareCard | null>(null);
  const applePay = useRef<SquareApplePay | null>(null);
  const [ready, setReady] = useState(false);
  const [hasApplePay, setHasApplePay] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const amount = (amountCents / 100).toFixed(2);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const config = await fetchConfig();
        if (!config) throw new Error("square is not set up");
        const square = await loadSquare(config.sandbox ? SDK.sandbox : SDK.production);
        const payments = square.payments(config.applicationId, config.locationId);
        const fields = await payments.card({ style: CARD_STYLE }).catch(() => payments.card());
        if (gone || !cardHost.current) return;
        await fields.attach(cardHost.current);
        card.current = fields;
        setReady(true);
        try {
          const request = payments.paymentRequest({
            countryCode: "US",
            currencyCode: "USD",
            total: { amount, label: "Say Sukii" },
          });
          applePay.current = await payments.applePay(request);
          if (!gone) setHasApplePay(true);
        } catch {
          // apple pay only shows in safari on a device with it set up
        }
      } catch {
        if (!gone) setUnavailable(true);
      }
    })();
    return () => {
      gone = true;
      void card.current?.destroy().catch(() => false);
      card.current = null;
    };
  }, [amount, fetchConfig]);

  async function charge(source: "card" | "apple") {
    setProblem("");
    setBusy(true);
    try {
      const [first = "", ...rest] = clientName.trim().split(/\s+/);
      const result =
        source === "apple"
          ? await applePay.current?.tokenize()
          : await card.current?.tokenize({
              amount,
              currencyCode: "USD",
              intent: "CHARGE",
              customerInitiated: true,
              sellerKeyedIn: false,
              billingContact: {
                givenName: first,
                familyName: rest.join(" "),
                ...(clientEmail ? { email: clientEmail } : {}),
              },
            });
      if (!result || result.status !== "OK" || !result.token) {
        // a closed apple pay sheet or an unfinished card form isn't an error worth shouting about
        const message = result?.errors?.[0]?.message;
        if (message) setProblem(message);
        return;
      }
      const paid = await pay({ data: { token, source_id: result.token } });
      if (paid.paid) onPaid();
      else setProblem("The payment is still processing. This page will update once it clears.");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The payment didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  if (unavailable && fallbackHref) {
    return (
      <a href={fallbackHref} target="_blank" rel="noreferrer" className="client-packet-accept">
        Pay {formatMoneyExact(amountCents)}
      </a>
    );
  }

  if (unavailable) {
    return (
      <p className="client-packet-client">
        Payment isn't available here just yet. The studio will send payment instructions.
      </p>
    );
  }

  return (
    <div className="client-packet-pay" aria-busy={!ready || busy}>
      {hasApplePay ? (
        <>
          <button
            type="button"
            className="client-packet-applepay"
            aria-label={`Pay ${formatMoneyExact(amountCents)} with Apple Pay`}
            disabled={busy}
            onClick={() => void charge("apple")}
          />
          <p className="client-packet-pay-or">or pay by card</p>
        </>
      ) : null}
      <div ref={cardHost} className="client-packet-card" />
      {!ready ? <p className="client-packet-pay-note">Opening secure checkout…</p> : null}
      {problem ? (
        <p role="alert" className="client-packet-stamp">
          {problem}
        </p>
      ) : null}
      <button
        type="button"
        className="client-packet-accept"
        disabled={!ready || busy}
        onClick={() => void charge("card")}
      >
        {busy ? "Paying…" : `Pay ${formatMoneyExact(amountCents)}`}
      </button>
      <p className="client-packet-pay-note">Payments are processed securely by Square.</p>
    </div>
  );
}
