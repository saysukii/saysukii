import { createFileRoute, notFound } from "@tanstack/react-router";
import { Lock, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/portal/bits";
import { PayMoment } from "@/components/proposal/PayMoment";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PayPhase } from "@/lib/pay-moments";
import { cn } from "@/lib/utils";

// a local-only page for choosing how the pay pop-up reads; nothing here charges a card
export const Route = createFileRoute("/pay-studies")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Pay studies — Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: PayStudies,
});

type Letter = "note" | "dear" | "tags" | "ledger";

const LETTERS: Array<{ id: Letter; name: string; idea: string }> = [
  {
    id: "note",
    name: "the note",
    idea: "their name in pink, the amount, then two quiet lines: what it's for, and when the rest is due. the receipt email is its own field.",
  },
  {
    id: "dear",
    name: "dear tai",
    idea: "written like a short letter to them. the receipt line says where it's going, with a small 'change' to edit it.",
  },
  {
    id: "tags",
    name: "the tags",
    idea: "the invoice, the service, and the date as soft pills above the amount, with the balance underneath. the receipt is a pill too.",
  },
  {
    id: "ledger",
    name: "the ledger",
    idea: "the amount due now up top, then a short list of what it's for, the event, and the balance. the receipt field sits at the end.",
  },
];

const SAMPLE = {
  client: "Tai",
  email: "tai@taistu.com",
  invoice: "SS103",
  service: "floral subscription",
  eventDate: "10/30/26",
  total: "$500.00",
  dueNow: "$250.00",
  balance: "$250.00",
  balanceDue: "09/30/26",
};

function PayStudies() {
  const [letter, setLetter] = useState<Letter>("note");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<PayPhase | null>(null);
  const [method, setMethod] = useState<"apple" | "card">("card");
  const [email, setEmail] = useState(SAMPLE.email);
  const [editingEmail, setEditingEmail] = useState(false);

  useEffect(() => {
    if (phase !== "paying") return;
    const timer = window.setTimeout(() => setPhase("paid"), 2200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const picked = LETTERS.find((item) => item.id === letter);
  const pay = () => setPhase("paying");

  return (
    <main className="client-packet pay-studies">
      <div className="client-packet-wrap">
        <div className="pay-studies-tabs" role="tablist" aria-label="pay pop-ups">
          {LETTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === letter}
              onClick={() => {
                setLetter(item.id);
                setPhase(null);
                setEditingEmail(false);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <p className="pay-studies-idea">{picked?.idea}</p>

        <section className="client-packet-sheet pay-studies-invoice">
          <Wordmark tone="ink" className="client-packet-mark is-sheet" />
          <p className="client-packet-kicker">invoice {SAMPLE.invoice}</p>
          <div className="pay-studies-row">
            <span>Floral Subscription · {SAMPLE.eventDate}</span>
            <span>{SAMPLE.total}</span>
          </div>
          <div className="pay-studies-row is-total">
            <span>Deposit due now</span>
            <span>{SAMPLE.dueNow}</span>
          </div>
        </section>

        <div className="client-packet-buttons">
          <button
            type="button"
            className="client-packet-accept"
            onClick={() => {
              setPhase(null);
              setOpen(true);
            }}
          >
            Pay {SAMPLE.dueNow}
          </button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (phase === "paying") return;
          setOpen(next);
          if (!next) setPhase(null);
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
          <DialogTitle className="sr-only">pay invoice {SAMPLE.invoice}</DialogTitle>
          <DialogDescription className="sr-only">
            pay {SAMPLE.dueNow} by card or apple pay.
          </DialogDescription>

          {phase ? (
            <div className="client-pay-moment">
              <PayMoment style="circle" phase={phase} amount={SAMPLE.dueNow} />
              {phase === "paid" ? (
                <>
                  <p className="client-pay-receipt">
                    your receipt and signed agreement are on their way to {email}.
                  </p>
                  <button
                    type="button"
                    className="client-packet-accept client-pay-done"
                    onClick={() => {
                      setOpen(false);
                      setPhase(null);
                    }}
                  >
                    done
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="client-pay-form">
              <LetterTop letter={letter} />
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
              {method === "apple" ? (
                <button
                  type="button"
                  className="client-packet-applepay"
                  aria-label="Pay with Apple Pay"
                  onClick={pay}
                />
              ) : (
                <div className="client-pay-mock-card" aria-hidden="true">
                  <span>Card number</span>
                  <span>MM/YY</span>
                  <span>CVV</span>
                  <span>ZIP</span>
                </div>
              )}
              <Receipt
                letter={letter}
                email={email}
                editing={editingEmail}
                onEmail={setEmail}
                onEdit={() => setEditingEmail(true)}
              />
              {method === "card" ? (
                <button type="button" className="client-packet-accept" onClick={pay}>
                  Pay {SAMPLE.dueNow}
                </button>
              ) : null}
              <p className="client-packet-pay-note">
                <Lock aria-hidden="true" className="client-pay-lock" /> processed securely by square
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** the words above the payment, four ways */
function LetterTop({ letter }: { letter: Letter }) {
  if (letter === "note") {
    return (
      <header className="client-pay-top is-note">
        <p className="client-pay-hello">for {SAMPLE.client}</p>
        <p className="client-pay-amount">{SAMPLE.dueNow}</p>
        <p className="client-pay-for">
          the deposit for your {SAMPLE.service} · {SAMPLE.eventDate}
        </p>
        <p className="client-pay-later">
          the remaining {SAMPLE.balance} is due {SAMPLE.balanceDue}.
        </p>
      </header>
    );
  }
  if (letter === "dear") {
    return (
      <header className="client-pay-top is-dear">
        <p className="client-pay-greeting">dear {SAMPLE.client.toLowerCase()},</p>
        <p className="client-pay-words">
          this is the deposit for your {SAMPLE.service} on {SAMPLE.eventDate}. the remaining{" "}
          {SAMPLE.balance} is due {SAMPLE.balanceDue}.
        </p>
        <div className="client-pay-due">
          <span>due now</span>
          <b>{SAMPLE.dueNow}</b>
        </div>
      </header>
    );
  }
  if (letter === "tags") {
    return (
      <header className="client-pay-top is-tags">
        <div className="client-pay-pills">
          <span>invoice {SAMPLE.invoice}</span>
          <span>{SAMPLE.service}</span>
          <span>{SAMPLE.eventDate}</span>
        </div>
        <p className="client-pay-amount">{SAMPLE.dueNow}</p>
        <p className="client-pay-for">
          deposit · balance {SAMPLE.balance} due {SAMPLE.balanceDue}
        </p>
      </header>
    );
  }
  return (
    <header className="client-pay-top is-ledger">
      <div className="client-pay-due is-big">
        <span>due now</span>
        <b>{SAMPLE.dueNow}</b>
      </div>
      <dl>
        <div>
          <dt>for</dt>
          <dd>{SAMPLE.service}</dd>
        </div>
        <div>
          <dt>event</dt>
          <dd>{SAMPLE.eventDate}</dd>
        </div>
        <div>
          <dt>balance</dt>
          <dd>
            {SAMPLE.balance} · due {SAMPLE.balanceDue}
          </dd>
        </div>
      </dl>
    </header>
  );
}

/** where the receipt goes, in the voice of each letter */
function Receipt({
  letter,
  email,
  editing,
  onEmail,
  onEdit,
}: {
  letter: Letter;
  email: string;
  editing: boolean;
  onEmail: (value: string) => void;
  onEdit: () => void;
}) {
  if (letter === "dear" && !editing) {
    return (
      <p className="client-pay-receipt-line">
        your receipt goes to <b>{email}</b>
        <button type="button" onClick={onEdit}>
          change
        </button>
      </p>
    );
  }
  if (letter === "tags" && !editing) {
    return (
      <div className="client-pay-pills is-receipt">
        <span>receipt to {email}</span>
        <button type="button" onClick={onEdit}>
          edit
        </button>
      </div>
    );
  }
  return (
    <label className={cn("client-pay-email", letter === "ledger" && "is-ledger")}>
      <span>{letter === "ledger" ? "receipt" : "send my receipt to"}</span>
      <input value={email} onChange={(event) => onEmail(event.target.value)} />
    </label>
  );
}
