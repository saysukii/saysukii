import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Wordmark } from "@/components/portal/bits";
import { SquarePay } from "@/components/proposal/SquarePay";
import { NotOnTheBooks } from "@/components/studio/NotOnTheBooks";
import { INVOICE_THANKS, invoiceSharedDate } from "@/lib/floral-agreement";
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
  const sharedOn = invoiceSharedDate(data.sentAt);
  const eventShort = shortDay(data.eventDate);
  const service = data.items.length === 1 ? data.items[0]!.name : "Floral add-ons";

  return (
    <main className="client-packet">
      <div className="client-packet-wrap">
        <header className="client-packet-mast">
          <Wordmark tone="ink" className="client-packet-mark" />
        </header>

        <div className="client-packet-steps" aria-label="invoice">
          <button type="button" className="is-on">
            invoice
          </button>
        </div>

        <div className="client-packet-sheet">
          <div className="client-packet-invoice-top">
            <h2>Invoice</h2>
            <Wordmark tone="ink" className="client-packet-mark is-sheet" />
            <p>
              info@saysukii.com
              <br />
              saysukii.com
            </p>
            <p className="client-packet-kicker is-number">{data.number}</p>
            <p>
              Bill to
              <br />
              {data.clientName}
              {data.clientEmail ? (
                <>
                  <br />
                  {data.clientEmail}
                </>
              ) : null}
              {paid ? (
                <>
                  <br />
                  Paid
                </>
              ) : null}
            </p>
            {sharedOn ? <p>Shared {sharedOn}</p> : null}
          </div>
          {data.booking ? <p className="client-packet-booking">{data.booking}</p> : null}
          <table className="client-packet-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={`${item.name}-${index}`}>
                  <td>
                    {item.name}
                    {item.note ? <small>{item.note}</small> : null}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{formatMoneyExact(item.unitCents)}</td>
                  <td>{formatMoneyExact(item.unitCents * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.courtesyCents > 0 ? (
            <div className="client-packet-row">
              <span>Courtesy Discount</span>
              <span>−{formatMoneyExact(data.courtesyCents)}</span>
            </div>
          ) : null}
          <div className="client-packet-row">
            <span>Total</span>
            <span>{formatMoneyExact(data.totalCents)}</span>
          </div>
          <div className="client-packet-row client-packet-total">
            <span>{dueLabel}</span>
            <span>
              {formatMoneyExact(paid ? 0 : data.dueCents)}
              {paid ? <span className="client-packet-paid">Paid</span> : null}
            </span>
          </div>
          <p style={{ marginTop: 18 }}>{INVOICE_THANKS}</p>
        </div>

        <div className="client-packet-buttons">
          {paid ? (
            <div className="client-packet-balance">
              <p className="client-packet-stamp" style={{ marginTop: 0 }}>
                Paid in full. Thank you.
              </p>
              <p className="client-packet-client">A copy of your receipt is in your email.</p>
            </div>
          ) : (
            <div className="client-packet-balance">
              {depositIn ? (
                <p className="client-packet-stamp" style={{ marginTop: 0 }}>
                  Deposit received. {formatMoneyExact(data.dueCents)} remaining.
                </p>
              ) : null}
              <SquarePay
                invoice
                token={token}
                amountCents={data.dueCents}
                clientName={data.clientName}
                clientEmail={data.clientEmail}
                summary={{
                  service: depositIn ? `${service} · balance` : service,
                  eventDate: eventShort,
                }}
                onPaid={() => void queryClient.invalidateQueries({ queryKey })}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
