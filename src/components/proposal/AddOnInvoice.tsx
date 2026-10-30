import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Wordmark } from "@/components/portal/bits";
import { SquarePay } from "@/components/proposal/SquarePay";
import { NotOnTheBooks } from "@/components/studio/NotOnTheBooks";
import { INVOICE_THANKS } from "@/lib/floral-agreement";
import { formatMoneyExact } from "@/lib/money";
import { getInvoicePage } from "@/lib/os/invoice-page.functions";

/** "03/12/27" */
function shortDay(value: string | null) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return day ? `${day[2]}/${day[3]}/${day[1]!.slice(2)}` : "";
}

/**
 * An add-on invoice on its own page, laid out like the invoice on a proposal's page, and paid in
 * the same pop-up: card or apple pay.
 */
export function AddOnInvoice({ token }: { token: string }) {
  const fetchInvoice = useServerFn(getInvoicePage);
  const queryClient = useQueryClient();
  const queryKey = ["public-invoice", token];
  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => fetchInvoice({ data: { token } }),
  });

  if (isPending) return <main className="client-packet" />;
  if (isError || !data) return <NotOnTheBooks />;

  const paid = data.paidCents >= data.totalCents;
  const depositIn = data.paidCents > 0 && !paid;
  const dueLabel = paid
    ? "Balance due"
    : depositIn
      ? "Balance due"
      : data.dueCents >= data.totalCents
        ? "Due in full"
        : "Deposit due";
  const sharedOn = shortDay(data.sentAt);
  const eventShort = shortDay(data.eventDate);
  const service = data.items.length === 1 ? data.items[0]!.name : "Floral add-ons";

  return (
    <main className="client-packet">
      <div className="client-packet-wrap client-invoice-wrap">
        <article className="client-invoice">
          <header className="client-invoice-head">
            <div>
              <p className="client-invoice-kicker">{paid ? "paid" : dueLabel.toLowerCase()}</p>
              <strong>
                {formatMoneyExact(
                  paid ? data.totalCents + data.feeCents : data.dueCents + data.dueFeeCents,
                )}
              </strong>
              <em>
                {data.number}
                {sharedOn ? ` · shared ${sharedOn}` : ""}
              </em>
            </div>
            <Wordmark tone="ink" className="client-invoice-mark" />
          </header>

          <div className="client-invoice-who">
            <div>
              <p>bill to</p>
              <b>{data.clientName}</b>
              {data.clientEmail ? <span>{data.clientEmail}</span> : null}
            </div>
            <div>
              <p>from</p>
              <b>Say Sukii</b>
              <span>info@saysukii.com</span>
            </div>
          </div>
          {data.booking ? <p className="client-packet-booking">{data.booking}</p> : null}

          <div className="client-invoice-items">
            <div className="client-invoice-row is-head" aria-hidden="true">
              <span>item</span>
              <span>qty</span>
              <span>price</span>
              <span>amount</span>
            </div>
            {data.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="client-invoice-row">
                <div className="client-invoice-item">
                  <b>{item.name}</b>
                  {item.note ? <small>{item.note}</small> : null}
                  {/* on a phone, the quantity and price sit under the item */}
                  <small className="client-invoice-each">
                    {item.quantity} × {formatMoneyExact(item.unitCents)}
                  </small>
                </div>
                <span className="client-invoice-qty">{item.quantity}</span>
                <span className="client-invoice-price">{formatMoneyExact(item.unitCents)}</span>
                <span className="client-invoice-amount">
                  {formatMoneyExact(item.unitCents * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="client-invoice-sums">
            {data.courtesyCents > 0 ? (
              <div>
                <span>courtesy discount</span>
                <span>−{formatMoneyExact(data.courtesyCents)}</span>
              </div>
            ) : null}
            {data.feeCents > 0 ? (
              <>
                <div>
                  <span>subtotal</span>
                  <span>{formatMoneyExact(data.totalCents)}</span>
                </div>
                <div>
                  <span>convenience fee (4%)</span>
                  <span>{formatMoneyExact(data.feeCents)}</span>
                </div>
              </>
            ) : null}
            <div>
              <span>total</span>
              <span>{formatMoneyExact(data.totalCents + data.feeCents)}</span>
            </div>
            {depositIn ? (
              <div>
                <span>paid</span>
                <span>−{formatMoneyExact(data.paidCents + data.feePaidCents)}</span>
              </div>
            ) : null}
            <div className="is-due">
              <span>{dueLabel.toLowerCase()}</span>
              <span>
                {formatMoneyExact(paid ? 0 : data.dueCents + data.dueFeeCents)}
                {paid ? <span className="client-packet-paid">Paid</span> : null}
              </span>
            </div>
          </div>

          <footer className="client-invoice-foot">
            <p>{INVOICE_THANKS}</p>
            {paid ? (
              <p className="client-invoice-done">
                Paid in full. A copy of your receipt is in your email.
              </p>
            ) : (
              <div className="client-invoice-pay">
                <SquarePay
                  invoice
                  token={token}
                  amountCents={data.dueCents + data.dueFeeCents}
                  clientName={data.clientName}
                  clientEmail={data.clientEmail}
                  summary={{
                    service: depositIn ? `${service} · balance` : service,
                    eventDate: eventShort,
                    feeCents: data.dueFeeCents,
                  }}
                  onPaid={() => void queryClient.invalidateQueries({ queryKey })}
                />
              </div>
            )}
          </footer>
        </article>
      </div>
    </main>
  );
}
