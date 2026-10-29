import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FloralAgreement } from "@/components/proposal/FloralAgreement";
import { ProposalPages } from "@/components/proposal/ProposalPages";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wordmark } from "@/components/portal/bits";
import { readPreviewProposal } from "@/lib/preview-proposals";
import {
  INVOICE_THANKS,
  floralPackageName,
  invoiceBookingLine,
  invoiceDateLabel,
  invoiceSharedDate,
  type StatementOfWork,
} from "@/lib/floral-agreement";
import { dollarsToCents, formatDollarInput } from "@/lib/proposal-link";
import { formatMoneyExact } from "@/lib/money";
import {
  customItem,
  itemFromCatalog,
  type CatalogItem,
  type InvoiceItem,
} from "@/lib/invoice-items";
import { cn } from "@/lib/utils";

export type ItemCatalog = { items: CatalogItem[]; problem: string | null; loading: boolean };

export type SentInvoice = {
  id: string;
  number: string;
  total_cents: number;
  due_now_cents: number;
  pay_in_full: boolean;
  status: string;
  public_url: string | null;
  sent_at: string;
  paid_cents: number;
};

export function ItemPicker({
  catalog,
  onPick,
  children,
}: {
  catalog: ItemCatalog;
  onPick: (item: InvoiceItem) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const shown = catalog.items
    .filter(
      (entry) => !term || `${entry.name} ${entry.variation ?? ""}`.toLowerCase().includes(term),
    )
    .slice(0, 50);

  function pick(item: InvoiceItem) {
    onPick(item);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="studio-item-pick">
        <input
          autoFocus
          value={search}
          placeholder="find an item"
          aria-label="find an item"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const first = shown[0];
            pick(first ? itemFromCatalog(first) : customItem(search));
          }}
        />
        <div className="studio-item-pick-list" role="listbox" aria-label="square items">
          {catalog.loading ? <p>gathering your square items…</p> : null}
          {shown.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(itemFromCatalog(entry))}
            >
              <span>
                <b>{entry.name}</b>
                {entry.variation ? <small>{entry.variation}</small> : null}
              </span>
              <em>
                {entry.priceCents == null ? "set a price" : formatMoneyExact(entry.priceCents)}
              </em>
            </button>
          ))}
          {!catalog.loading && !catalog.problem && !shown.length ? (
            <p>{term ? "nothing in square matches." : "no items in square yet."}</p>
          ) : null}
          {catalog.problem ? <p>{catalog.problem}</p> : null}
        </div>
        <button
          type="button"
          className="studio-item-pick-custom"
          onClick={() => pick(customItem(search))}
        >
          {term ? `+ add “${search.trim()}” as a custom item` : "+ custom item"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function PriceInput({
  cents,
  label,
  onCents,
}: {
  cents: number;
  label: string;
  onCents: (cents: number) => void;
}) {
  const shown = cents ? formatDollarInput(String(cents / 100)) : "";
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="studio-invoice-price">
      <span aria-hidden="true">$</span>
      <input
        value={draft ?? shown}
        placeholder="0"
        inputMode="decimal"
        aria-label={label}
        onFocus={() => setDraft(shown)}
        onChange={(event) => {
          const next = formatDollarInput(event.target.value);
          setDraft(next);
          onCents(dollarsToCents(next) ?? 0);
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}

export function InvoicePreview({
  clientName,
  number,
  service,
  bookingLine,
  listCents,
  courtesyCents,
  totalCents,
  depositCents,
  issuedOn,
  clientEmail = "",
  onSend,
  sending = false,
  people,
  items = [],
  catalog,
  onItems,
}: {
  clientName: string;
  clientEmail?: string;
  number: string;
  service: string;
  bookingLine: string;
  listCents: number;
  courtesyCents: number;
  totalCents: number;
  depositCents: number;
  issuedOn: string;
  onSend?: () => void;
  sending?: boolean;
  people?: ReactNode;
  items?: InvoiceItem[];
  catalog?: ItemCatalog;
  onItems?: (next: InvoiceItem[]) => void;
}) {
  const dueLabel = depositCents >= totalCents && totalCents > 0 ? "due in full" : "deposit due";
  const total = formatMoneyExact(totalCents);
  const due = formatMoneyExact(depositCents);
  const shared = invoiceSharedDate(issuedOn);
  // with no items picked yet, the amount typed above stands in as one line
  const base: InvoiceItem | null =
    listCents > 0
      ? {
          key: "base",
          name: service,
          note: bookingLine || null,
          unitCents: listCents,
          quantity: 1,
          squareId: null,
        }
      : null;
  const rows = items.length ? items : base ? [base] : [];
  const editable = Boolean(onItems && catalog);
  const change = (key: string, patch: Partial<InvoiceItem>) =>
    onItems?.(
      rows.map((row) =>
        row.key === key
          ? { ...row, ...patch, key: row.key === "base" ? crypto.randomUUID() : row.key }
          : row,
      ),
    );
  const lines = (
    <table className={cn("studio-invoice-table", editable && "is-editable")}>
      <thead>
        <tr>
          <th>item</th>
          <th>quantity</th>
          <th>price</th>
          <th>amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>
              {editable && catalog && row.key !== "base" && !row.squareId ? (
                <>
                  <span className="studio-invoice-custom">
                    <input
                      value={row.name}
                      placeholder="name this item"
                      aria-label="item name"
                      autoFocus={!row.name}
                      onChange={(event) => change(row.key, { name: event.target.value })}
                    />
                    <ItemPicker
                      catalog={catalog}
                      onPick={(picked) => change(row.key, { ...picked, quantity: row.quantity })}
                    >
                      <button
                        type="button"
                        className="studio-invoice-swap"
                        title="choose from square"
                        aria-label="choose from square"
                      >
                        <ChevronDown aria-hidden="true" strokeWidth={1.5} />
                      </button>
                    </ItemPicker>
                  </span>
                  <input
                    className="studio-invoice-detail"
                    value={row.note ?? ""}
                    placeholder="add a detail"
                    aria-label={`detail for ${row.name || "this item"}`}
                    onChange={(event) => change(row.key, { note: event.target.value || null })}
                  />
                </>
              ) : editable && catalog ? (
                <ItemPicker
                  catalog={catalog}
                  onPick={(picked) => change(row.key, { ...picked, quantity: row.quantity })}
                >
                  <button type="button" className="studio-invoice-item" title="choose an item">
                    {row.name}
                    {row.note ? <small>{row.note}</small> : null}
                  </button>
                </ItemPicker>
              ) : (
                <>
                  {row.name}
                  {row.note ? <small>{row.note}</small> : null}
                </>
              )}
            </td>
            <td>
              {editable ? (
                <input
                  className="studio-invoice-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={row.quantity}
                  aria-label={`quantity of ${row.name}`}
                  onChange={(event) =>
                    change(row.key, {
                      quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                    })
                  }
                />
              ) : (
                row.quantity
              )}
            </td>
            <td>
              {editable ? (
                <PriceInput
                  cents={row.unitCents}
                  label={`price of ${row.name}`}
                  onCents={(unitCents) => change(row.key, { unitCents })}
                />
              ) : (
                formatMoneyExact(row.unitCents)
              )}
            </td>
            <td>
              {formatMoneyExact(row.unitCents * row.quantity)}
              {editable && items.length ? (
                <button
                  type="button"
                  className="studio-invoice-drop"
                  aria-label={`remove ${row.name}`}
                  onClick={() => onItems?.(items.filter((item) => item.key !== row.key))}
                >
                  <X aria-hidden="true" strokeWidth={1.5} />
                </button>
              ) : null}
            </td>
          </tr>
        ))}
        {editable && catalog ? (
          <tr className="is-add">
            <td colSpan={4}>
              <ItemPicker
                catalog={catalog}
                onPick={(picked) =>
                  onItems?.([
                    ...rows.map((row) =>
                      row.key === "base" ? { ...row, key: crypto.randomUUID() } : row,
                    ),
                    picked,
                  ])
                }
              >
                <button type="button" className="studio-invoice-add">
                  + add an item
                </button>
              </ItemPicker>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
  const summary = (
    <footer>
      {courtesyCents > 0 ? (
        <div>
          <span>Courtesy Discount</span>
          <span>−{formatMoneyExact(courtesyCents)}</span>
        </div>
      ) : null}
      <div>
        <span>proposal total</span>
        <span>{total}</span>
      </div>
      <div>
        <span>{dueLabel}</span>
        <strong>{due}</strong>
      </div>
    </footer>
  );
  return (
    <div className="studio-invoice-preview">
      <article className="studio-invoice is-figure">
        <div className="studio-invoice-top">
          <header>
            <div>
              <p>{dueLabel}</p>
              <strong>{due}</strong>
              <em>
                {number}
                {shared ? ` · shared ${shared}` : ""}
              </em>
            </div>
            <Wordmark tone="ink" className="client-packet-mark is-sheet" />
          </header>
          <div className="studio-invoice-who">
            <div>
              <p>bill to</p>
              <b>{clientName}</b>
              {clientEmail ? <span>{clientEmail}</span> : null}
            </div>
            <div>
              <p>from</p>
              <b>Say Sukii</b>
              <span>info@saysukii.com</span>
            </div>
          </div>
        </div>
        {lines}
        {summary}
        <p className="studio-invoice-note">{INVOICE_THANKS}</p>
      </article>
      {onSend ? (
        <div className="studio-invoice-send">
          {people}
          <button type="button" className="studio-today-go" disabled={sending} onClick={onSend}>
            {sending ? "sending" : "send invoice"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PacketPreview({
  kind,
  clientName,
  clientEmail = "",
  onSend,
  sending = false,
  people,
  work,
  totalCents,
  courtesyCents,
  depositCents,
  fileUrl,
  invoiceNumber,
  stored,
}: {
  kind: "proposal" | "agreement" | "invoice";
  clientName: string;
  clientEmail?: string;
  onSend?: () => void;
  sending?: boolean;
  people?: ReactNode;
  work: StatementOfWork;
  totalCents: number;
  courtesyCents: number;
  depositCents: number;
  fileUrl: string;
  invoiceNumber: string;
  stored: ReturnType<typeof readPreviewProposal>;
}) {
  const pages = stored?.pageUrls ?? [];
  const frame = fileUrl || stored?.pdfDataUrl || "";
  const [page, setPage] = useState(0);
  const [pdfCount, setPdfCount] = useState(0);
  const count = pages.length || pdfCount || (frame ? 1 : 0);
  const safePage = Math.min(page, Math.max(count - 1, 0));
  function jump(index: number) {
    setPage(index);
  }
  function step(direction: -1 | 1) {
    setPage(Math.min(Math.max(safePage + direction, 0), Math.max(count - 1, 0)));
  }
  return (
    <div className="client-packet is-preview">
      {kind === "proposal" ? (
        count ? (
          <>
            <div className="client-packet-nav">
              <button
                type="button"
                className="client-packet-arrow"
                aria-label="Previous page"
                disabled={safePage <= 0}
                onClick={() => step(-1)}
              >
                <ChevronLeft size={18} strokeWidth={1.4} />
              </button>
              <div className="client-packet-count">
                proposal
                <span>
                  {" "}
                  · {safePage + 1} / {count}
                </span>
              </div>
              <button
                type="button"
                className="client-packet-arrow"
                aria-label="Next page"
                disabled={safePage >= count - 1}
                onClick={() => step(1)}
              >
                <ChevronRight size={18} strokeWidth={1.4} />
              </button>
            </div>
            {pages.length ? (
              <div className="client-packet-pages">
                <img
                  src={pages[safePage]}
                  alt={`Proposal page ${safePage + 1}`}
                  draggable={false}
                />
              </div>
            ) : (
              <ProposalPages src={frame} page={safePage} onPages={setPdfCount} />
            )}
            {count > 1 ? (
              <div className="client-packet-dots">
                {Array.from({ length: count }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={index === safePage ? "client-packet-dot is-on" : "client-packet-dot"}
                    aria-label={`Go to page ${index + 1}`}
                    onClick={() => jump(index)}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="client-packet-sheet">
            <h2>Proposal</h2>
            <p>Nothing is attached yet.</p>
          </div>
        )
      ) : null}
      {kind === "agreement" ? (
        <div className="client-packet-sheet">
          <FloralAgreement
            fields={{
              ...work,
              clientName: clientName || "Client",
              total: formatMoneyExact(totalCents),
              deposit: formatMoneyExact(depositCents),
              balance: formatMoneyExact(Math.max(0, totalCents - depositCents)),
            }}
          />
        </div>
      ) : null}
      {kind === "invoice" ? (
        <InvoicePreview
          clientName={clientName || "Client"}
          clientEmail={clientEmail}
          {...(onSend ? { onSend, sending, ...(people ? { people } : {}) } : {})}
          number={invoiceNumber || stored?.number || "preview"}
          service={floralPackageName(work.occasion || work.flowers)}
          bookingLine={invoiceBookingLine(
            work.occasion || work.flowers,
            invoiceDateLabel(work.eventWhen),
          )}
          listCents={totalCents + courtesyCents}
          courtesyCents={courtesyCents}
          totalCents={totalCents}
          depositCents={depositCents}
          issuedOn={stored?.sentAt || new Date().toISOString()}
        />
      ) : null}
    </div>
  );
}
