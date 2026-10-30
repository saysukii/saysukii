import { useServerFn } from "@tanstack/react-start";
import { Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PayMoment } from "@/components/proposal/PayMoment";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoneyExact } from "@/lib/money";
import { payInquiryInvoice } from "@/lib/os/invoice-page.functions";
import { getSquarePayConfig, payProposalDeposit } from "@/lib/os/proposals.functions";
import type { PayPhase } from "@/lib/pay-moments";

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

export type PaySummary = {
  service: string;
  eventDate: string;
  /** the 4% convenience fee inside the amount due now */
  feeCents?: number;
  /** after this payment, what's left and when it's due (a deposit) */
  balance?: { amountCents: number; due: string } | null;
};

/**
 * The pay button, and the pop-up it opens: the ledger of what's due, apple pay or square's secure
 * card fields, where the receipt goes, then the circle while it pays. The card never touches the app.
 */
export function SquarePay({
  token,
  amountCents,
  clientName,
  clientEmail,
  fallbackHref,
  summary,
  onPaid,
  demo = false,
  startOpen = false,
  invoice = false,
}: {
  token: string;
  amountCents: number;
  clientName: string;
  clientEmail: string;
  /** square's own checkout page, if one was made, for when the fields here can't load */
  fallbackHref?: string | null;
  summary: PaySummary;
  onPaid: () => void;
  /** the local preview: the same pop-up with stand-in card fields, and nothing is charged */
  demo?: boolean;
  /** opens the pop-up straight away, for a mock of it */
  startOpen?: boolean;
  /** pays an add-on invoice (its page's token) rather than a proposal */
  invoice?: boolean;
}) {
  const fetchConfig = useServerFn(getSquarePayConfig);
  const payProposal = useServerFn(payProposalDeposit);
  const payInvoice = useServerFn(payInquiryInvoice);
  const pay = invoice ? payInvoice : payProposal;
  const cardHost = useRef<HTMLDivElement>(null);
  const card = useRef<SquareCard | null>(null);
  const applePay = useRef<SquareApplePay | null>(null);
  const [open, setOpen] = useState(startOpen);
  const [ready, setReady] = useState(false);
  const [hasApplePay, setHasApplePay] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [method, setMethod] = useState<"apple" | "card">("card");
  const [receipt, setReceipt] = useState(clientEmail);
  const [phase, setPhase] = useState<PayPhase | null>(null);
  const [problem, setProblem] = useState("");
  const amount = (amountCents / 100).toFixed(2);
  const money = formatMoneyExact(amountCents);

  // square's fields are made when the pop-up opens, and taken down when it closes
  useEffect(() => {
    if (!open) return;
    if (demo) {
      setReady(true);
      setHasApplePay(true);
      return;
    }
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
          if (!gone) {
            setHasApplePay(true);
            setMethod("apple");
          }
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
      applePay.current = null;
      setReady(false);
      setHasApplePay(false);
    };
  }, [amount, demo, fetchConfig, open]);

  async function charge() {
    setProblem("");
    if (demo) {
      setPhase("paying");
      window.setTimeout(() => setPhase("paid"), 1800);
      return;
    }
    const [first = "", ...rest] = clientName.trim().split(/\s+/);
    const result =
      method === "apple"
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
              ...(receipt ? { email: receipt } : {}),
            },
          });
    if (!result || result.status !== "OK" || !result.token) {
      // a closed apple pay sheet or an unfinished card isn't an error worth shouting about
      const message = result?.errors?.[0]?.message;
      if (message) setProblem(message);
      return;
    }
    setPhase("paying");
    try {
      const paid = await pay({
        data: {
          token,
          source_id: result.token,
          ...(receipt.trim() ? { receipt_email: receipt.trim() } : {}),
        },
      });
      if (paid.paid) {
        setPhase("paid");
      } else {
        setPhase(null);
        setProblem("The payment is still processing. This page will update once it clears.");
      }
    } catch (error) {
      setPhase(null);
      setProblem(error instanceof Error ? error.message : "The payment didn't go through.");
    }
  }

  function close() {
    const finished = phase === "paid";
    setOpen(false);
    setPhase(null);
    setProblem("");
    if (finished) onPaid();
  }

  if (unavailable && fallbackHref) {
    return (
      <a href={fallbackHref} target="_blank" rel="noreferrer" className="client-packet-accept">
        Pay {money}
      </a>
    );
  }

  return (
    <>
      <button type="button" className="client-packet-accept" onClick={() => setOpen(true)}>
        Pay {money}
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (phase === "paying") return;
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask is-soft client-pay-modal"
          hideClose
        >
          <div className="studio-task-head">
            {phase === "paying" ? null : (
              <DialogClose className="studio-task-close" aria-label="Close">
                <X aria-hidden="true" />
              </DialogClose>
            )}
          </div>
          <DialogTitle className="sr-only">pay {money}</DialogTitle>
          <DialogDescription className="sr-only">pay by apple pay or card.</DialogDescription>

          {phase ? (
            <div className="client-pay-moment">
              <PayMoment style="circle" phase={phase} amount={money} />
              {phase === "paid" ? (
                <>
                  <p className="client-pay-receipt">
                    your receipt is on its way to {receipt || "your email"}.
                  </p>
                  <button
                    type="button"
                    className="client-packet-accept client-pay-done"
                    onClick={close}
                  >
                    done
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {/* the form stays mounted under the moment, so square's fields survive a retry */}
          <div className="client-pay-form" hidden={Boolean(phase)}>
            <header className="client-pay-top is-ledger">
              <div className="client-pay-due is-big">
                <span>due now</span>
                <b>{money}</b>
              </div>
              <dl>
                <div>
                  <dt>for</dt>
                  <dd>{summary.service}</dd>
                </div>
                {summary.eventDate ? (
                  <div>
                    <dt>event</dt>
                    <dd>{summary.eventDate}</dd>
                  </div>
                ) : null}
                {summary.feeCents ? (
                  <div>
                    <dt>fee</dt>
                    <dd>includes {formatMoneyExact(summary.feeCents)} convenience fee (4%)</dd>
                  </div>
                ) : null}
                {summary.balance ? (
                  <div>
                    <dt>balance</dt>
                    <dd>
                      {formatMoneyExact(summary.balance.amountCents)} · due {summary.balance.due}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </header>

            {hasApplePay ? (
              <div className="client-pay-choice" role="radiogroup" aria-label="pay with">
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === "apple"}
                  onClick={() => setMethod("apple")}
                >
                  apple pay
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === "card"}
                  onClick={() => setMethod("card")}
                >
                  card
                </button>
              </div>
            ) : null}

            {method === "apple" && hasApplePay ? (
              <button
                type="button"
                className="client-packet-applepay"
                aria-label={`Pay ${money} with Apple Pay`}
                onClick={() => void charge()}
              />
            ) : null}
            {demo ? (
              method === "card" ? (
                <div className="client-pay-mock-card" aria-hidden="true">
                  <span>Card number</span>
                  <span>MM/YY</span>
                  <span>CVV</span>
                  <span>ZIP</span>
                </div>
              ) : null
            ) : (
              <div
                ref={cardHost}
                className="client-packet-card"
                hidden={method === "apple" && hasApplePay}
              />
            )}
            {!ready && !unavailable ? (
              <p className="client-packet-pay-note">Opening secure checkout…</p>
            ) : null}
            {unavailable ? (
              <p className="client-packet-client">
                Payment isn't available here just yet. The studio will send payment instructions.
              </p>
            ) : null}

            <label className="client-pay-email is-ledger">
              <span>receipt</span>
              <input
                type="email"
                value={receipt}
                autoComplete="email"
                onChange={(event) => setReceipt(event.target.value)}
              />
            </label>

            {problem ? (
              <p role="alert" className="client-packet-stamp">
                {problem}
              </p>
            ) : null}

            {method === "card" || !hasApplePay ? (
              <button
                type="button"
                className="client-packet-accept"
                disabled={!ready}
                onClick={() => void charge()}
              >
                Pay {money}
              </button>
            ) : null}
            <p className="client-packet-pay-note">
              <Lock aria-hidden="true" className="client-pay-lock" /> processed securely by square
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
