import { X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoneyExact } from "@/lib/money";
import { MANUAL_METHODS, type ManualMethod } from "@/lib/payment-methods";
import { dollarsToCents, formatDollarInput } from "@/lib/proposal-link";
import { cn } from "@/lib/utils";

export type MarkedPayment = {
  amountCents: number;
  method: ManualMethod;
  paidOn: string;
  note: string;
  sendReceipt: boolean;
};

function today() {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/**
 * Marks an invoice paid when it came outside the card pop-up: zelle, a bank transfer, cash, a
 * check. The amount starts at what's due, and the receipt goes out unless the studio says not to.
 */
export function MarkPaidDialog({
  open,
  title,
  dueCents,
  busy = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  /** "the deposit", "the balance", "SS754" */
  title: string;
  dueCents: number;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payment: MarkedPayment) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualMethod>("zelle");
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState("");
  const [sendReceipt, setSendReceipt] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAmount(formatDollarInput(String(dueCents / 100)));
    setMethod("zelle");
    setPaidOn(today());
    setNote("");
    setSendReceipt(true);
  }, [open, dueCents]);

  const cents = dollarsToCents(amount) ?? 0;
  const problem =
    cents <= 0
      ? "add the amount they paid."
      : cents > dueCents
        ? `that's more than what's owed (${formatMoneyExact(dueCents)}).`
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="studio-task-veil"
        className="studio-task-modal is-ask is-soft"
        hideClose
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="studio-task-head">
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogTitle className="studio-mark-paid-title">mark {title} paid</DialogTitle>
        <DialogDescription className="sr-only">
          for a payment that came by zelle, bank transfer, cash, or check.
        </DialogDescription>
        <div className="studio-task-form">
          <label className="studio-ask-field">
            <span className="studio-ask-label">amount</span>
            <span className="studio-money">
              <span aria-hidden="true">$</span>
              <input
                className="studio-textarea"
                value={amount}
                inputMode="decimal"
                onChange={(event) => setAmount(formatDollarInput(event.target.value))}
              />
            </span>
          </label>
          <div className="studio-ask-field">
            <span className="studio-ask-label">paid with</span>
            <div className="studio-pay-methods" role="radiogroup" aria-label="paid with">
              {MANUAL_METHODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={method === option.id}
                  className={cn(method === option.id && "is-on")}
                  onClick={() => setMethod(option.id)}
                >
                  {option.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <label className="studio-ask-field">
            <span className="studio-ask-label">paid on</span>
            <input
              className="studio-textarea"
              type="date"
              value={paidOn}
              max={today()}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </label>
          <label className="studio-ask-field">
            <span className="studio-ask-label">note</span>
            <input
              className="studio-textarea"
              value={note}
              placeholder="a confirmation number, who sent it…"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="studio-fee-check">
            <input
              type="checkbox"
              checked={sendReceipt}
              onChange={(event) => setSendReceipt(event.target.checked)}
            />
            <span>email them the receipt</span>
          </label>
          {problem && amount ? <p className="studio-composer-note">{problem}</p> : null}
          <div className="studio-ask-foot">
            <button
              type="button"
              className="studio-today-go"
              disabled={Boolean(problem) || busy || !paidOn}
              onClick={() =>
                onConfirm({ amountCents: cents, method, paidOn, note: note.trim(), sendReceipt })
              }
            >
              {busy ? "marking…" : "mark paid"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
