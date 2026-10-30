import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FloralAgreement } from "@/components/proposal/FloralAgreement";
import { ProposalPages } from "@/components/proposal/ProposalPages";
import { isSignatureDataUrl, SignaturePad } from "@/components/proposal/SignaturePad";
import { SquarePay } from "@/components/proposal/SquarePay";
import { Wordmark } from "@/components/portal/bits";
import { BloomWait } from "@/components/portal/StudioLoader";
import {
  statementFromNotes,
  courtesyFromNotes,
  floralPackageName,
  invoiceBookingLine,
  invoiceDateLabel,
  invoiceSharedDate,
  statementOfWork,
  INVOICE_THANKS,
} from "@/lib/floral-agreement";
import { invoiceTitle } from "@/lib/invoice-title";
import { formatMoneyExact } from "@/lib/money";
import {
  acceptPreviewProposal,
  openPreviewProposal,
  payPreviewProposal,
  requestPreviewChanges,
  signPreviewProposal,
  type PreviewProposal,
} from "@/lib/preview-proposals";
import {
  acceptPublicProposal,
  getPublicProposal,
  requestProposalChanges,
  sendChangeRequestNotice,
  signPublicAgreement,
} from "@/lib/os/proposals.functions";
import { pushNotice, changeRequestedLine } from "@/lib/studio-notices";

function proposalSlides(pageUrls: string[] | undefined, frameUrl: string | null) {
  const slides: Array<{
    kind: "proposal" | "agreement" | "invoice";
    src?: string;
    frame?: string;
  }> = [];
  if (pageUrls?.length) {
    for (const src of pageUrls) slides.push({ kind: "proposal", src });
  } else if (frameUrl) {
    slides.push({ kind: "proposal", frame: frameUrl });
  } else {
    slides.push({ kind: "proposal" });
  }
  return slides;
}

function formatEventWhen(value: string | null) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function optionDeposit(total: number, percent: number) {
  return Math.round(total * (percent / 100));
}

function pdfFrameUrl(value: string) {
  if (!value.startsWith("data:")) return value;
  const comma = value.indexOf(",");
  const header = value.slice(0, comma);
  const body = value.slice(comma + 1);
  const mime = header.match(/data:([^;]+)/)?.[1] ?? "application/pdf";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** The client's side of a proposal: read it, approve it or ask for changes, sign, and pay. */
export function ProposalPacket({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const fetchProposal = useServerFn(getPublicProposal);
  const acceptProposal = useServerFn(acceptPublicProposal);
  const signAgreement = useServerFn(signPublicAgreement);
  const requestChanges = useServerFn(requestProposalChanges);
  const mailChange = useServerFn(sendChangeRequestNotice);
  const [preview, setPreview] = useState<PreviewProposal | null>(null);
  const [checked, setChecked] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signerFirst, setSignerFirst] = useState("");
  const [signerLast, setSignerLast] = useState("");
  const [keptSignature, setKeptSignature] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pdfCount, setPdfCount] = useState(0);
  const [view, setView] = useState<"proposal" | "agreement" | "invoice">("proposal");
  const opened = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    const openedProposal = openPreviewProposal(token);
    setPreview(openedProposal);
    setChecked(true);
    setPage(0);
    setPdfCount(0);
    if (opened.current) return;
    if (!openedProposal) return;
    opened.current = true;
    if (openedProposal?.signedName) {
      setView("invoice");
    } else if (openedProposal?.status === "accepted") {
      setView("agreement");
    }
  }, [token]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["public-proposal", token],
    queryFn: () => fetchProposal({ data: { token } }),
    enabled: checked && !preview,
    retry: false,
  });

  const pdfSource = preview?.pdfDataUrl || data?.pdfUrl || null;
  useEffect(() => {
    if (!pdfSource) {
      setFrameUrl(null);
      return;
    }
    const url = pdfFrameUrl(pdfSource);
    setFrameUrl(url);
    return () => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [pdfSource]);

  const accept = useMutation({
    mutationFn: async () => {
      if (preview) return acceptPreviewProposal(token);
      return acceptProposal({ data: { token } });
    },
    onSuccess: (result) => {
      if (preview) setPreview(result as PreviewProposal);
      else void queryClient.invalidateQueries({ queryKey: ["public-proposal", token] });
      setView("agreement");
      window.scrollTo(0, 0);
    },
  });

  const changes = useMutation({
    mutationFn: async () => {
      const note = changeNote.trim();
      if (!note) throw new Error("Write what you'd like changed.");
      const current = preview;
      if (current) {
        const saved = requestPreviewChanges(token, note);
        pushNotice({
          title: changeRequestedLine(current.contactName),
          body: note,
        });
        await mailChange({
          data: {
            clientName: current.clientName,
            clientEmail: null,
            eventDate: current.eventDate,
            place: current.venueText,
            investment: formatMoneyExact(current.totalCents),
            note,
          },
        });
        return saved;
      }
      await requestChanges({ data: { token, note } });
      pushNotice({ title: changeRequestedLine(data?.client.name), body: note });
      return { sent: true as const };
    },
    onSuccess: (result) => {
      if (preview && result && "token" in result) setPreview(result);
      setChangeNote("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sign = useMutation({
    mutationFn: async () => {
      if (!isSignatureDataUrl(signature)) throw new Error("Sign with your finger or cursor.");
      const first = signerFirst.trim();
      const last = signerLast.trim();
      if (!first || !last) throw new Error("Add your first and last name.");
      if (preview) return signPreviewProposal(token, signature, { first, last });
      return signAgreement({ data: { token, signature, first_name: first, last_name: last } });
    },
    onSuccess: (result) => {
      if (preview && "token" in result) setPreview(result);
      else {
        if ("paymentLink" in result) setPaymentLink(result.paymentLink);
        if (signature) setKeptSignature(signature);
        void queryClient.invalidateQueries({ queryKey: ["public-proposal", token] });
      }
      // stay with the signature, then glide down to continue
      window.requestAnimationFrame(() => {
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: still ? "auto" : "smooth",
        });
      });
    },
  });

  const pay = useMutation({
    mutationFn: async () => payPreviewProposal(token),
    onSuccess: (result) => setPreview(result),
  });

  useEffect(() => {
    if (opened.current || !checked || preview) return;
    if (isPending) return;
    if (isError || !data) {
      opened.current = true;
      return;
    }
    opened.current = true;
    const alreadySigned = Boolean(data.agreement?.signedName);
    if (alreadySigned) {
      setView("invoice");
    } else if (data.proposal.status === "accepted") {
      setView("agreement");
    }
  }, [checked, preview, data, isPending, isError]);

  const { isPending: signing, mutate: signNow } = sign;
  const named = Boolean(signerFirst.trim() && signerLast.trim());
  useEffect(() => {
    if (
      isSignatureDataUrl(preview?.signedName) ||
      !isSignatureDataUrl(signature) ||
      !named ||
      signing
    )
      return;
    const timer = window.setTimeout(() => signNow(), 700);
    return () => window.clearTimeout(timer);
  }, [signature, preview?.signedName, signing, signNow, named]);

  if (!checked || (!preview && isPending)) {
    return (
      <main className="client-packet">
        <div className="client-packet-wrap">
          <Wordmark tone="ink" className="client-packet-mark" />
        </div>
      </main>
    );
  }

  if (!preview && (isError || !data)) {
    return (
      <main className="client-packet">
        <div className="client-packet-wrap">
          <Wordmark tone="ink" className="client-packet-mark" />
          <h1>This proposal is unavailable.</h1>
          <p className="client-packet-client">
            {error instanceof Error && error.message !== "Proposal not found"
              ? error.message
              : "The link may be incomplete. Ask the studio for a fresh one."}
          </p>
        </div>
      </main>
    );
  }

  const status = preview?.status ?? data?.proposal.status ?? "sent";
  const clientName = preview?.clientName ?? data?.client.name ?? "";
  const clientEmail = preview?.clientEmail ?? data?.client.email ?? "";
  const clientPhone = preview?.clientPhone ?? data?.client.phone ?? "";
  const savedSigner = preview?.signer ?? data?.agreement?.signer ?? null;
  const payPercent =
    preview?.depositPercent ??
    ((data?.proposal.total_cents ?? 0) > 0 &&
    (data?.proposal.deposit_amount_cents ?? 0) >= (data?.proposal.total_cents ?? 0)
      ? 100
      : 50);
  const number = preview?.number ?? data?.proposal.number ?? "";
  const signedName = preview?.signedName ?? data?.agreement?.signedName ?? keptSignature;
  // the deposit first, then the balance; paid means nothing is left
  const paidCents = data?.paidCents ?? 0;
  const balanceLeft = data ? Math.max(0, data.proposal.total_cents - paidCents) : 0;
  const paid = preview?.paid ?? (paidCents > 0 && balanceLeft === 0);
  const depositIn = !preview && paidCents > 0 && balanceLeft > 0;
  const link = paymentLink ?? data?.invoice?.paymentLink ?? null;
  const noted = Boolean(preview?.changeNote) || changes.isSuccess;
  const canRespond = status === "sent" || status === "viewed";
  const accepted = status === "accepted" || accept.isSuccess;
  const signed = Boolean(signedName);
  const drawn = isSignatureDataUrl(signedName);
  const eventWhen = formatEventWhen(preview?.eventDate ?? data?.proposal.event_date ?? null);
  const venue = preview?.venueText ?? data?.proposal.venue_text ?? "";
  const occasion = preview?.eventLabel ?? "";
  const savedWork = preview?.work ?? statementFromNotes(data?.proposal.notes);
  const work = statementOfWork({
    ...savedWork,
    flowers: savedWork?.flowers || occasion || "Floral design",
    eventWhen: savedWork?.eventWhen || eventWhen,
    occasion: savedWork?.occasion || occasion,
    venue: savedWork?.venue || venue || "",
  });
  const totalCents = preview?.totalCents ?? data?.proposal.total_cents ?? 0;
  const courtesyCents = preview?.courtesyCents ?? courtesyFromNotes(data?.proposal.notes);
  const depositCents =
    preview?.depositCents ??
    data?.proposal.deposit_amount_cents ??
    optionDeposit(totalCents, payPercent);
  const listCents = totalCents + courtesyCents;
  const packageName = floralPackageName(work.occasion || occasion);
  const eventShort = shortDate(preview?.eventDate ?? data?.proposal.event_date ?? "");
  const bookingLine = invoiceBookingLine(
    work.occasion || occasion,
    invoiceDateLabel(preview?.eventDate ?? data?.proposal.event_date ?? work.eventWhen),
  );
  const sharedOn = invoiceSharedDate(preview?.sentAt ?? data?.proposal.sent_at);
  const imageCount = preview?.pageUrls?.length ?? 0;
  const proposalCount = imageCount > 0 ? imageCount : Math.max(pdfCount, frameUrl ? 1 : 1);
  const safePage = Math.min(page, Math.max(proposalCount - 1, 0));
  const slides = proposalSlides(preview?.pageUrls, frameUrl);
  const current = imageCount > 0 ? (slides[safePage] ?? slides[0]) : null;
  const invoiceNumber = data?.invoice?.number ? invoiceTitle(data.invoice.number) : number;
  const step = view;

  function openInvoice() {
    setView("invoice");
    window.scrollTo(0, 0);
  }

  function renderSlide(slide: (typeof slides)[number], index: number) {
    if (slide.kind === "proposal" && slide.src) {
      return (
        <div className="client-packet-pages">
          <img src={slide.src} alt={`Proposal page ${index + 1}`} draggable={false} />
        </div>
      );
    }
    if (slide.kind === "proposal" && slide.frame) {
      return <ProposalPages src={slide.frame} page={index} />;
    }
    if (slide.kind === "proposal") {
      return (
        <div className="client-packet-sheet">
          <h2>Proposal</h2>
          <p>The proposal is not on this link yet.</p>
        </div>
      );
    }
    if (slide.kind === "agreement") {
      return (
        <div className="client-packet-sheet">
          <FloralAgreement
            fields={{
              ...work,
              clientName,
              clientPhone: clientPhone || null,
              clientEmail: clientEmail || null,
              total: formatMoneyExact(totalCents),
              deposit: formatMoneyExact(depositCents),
              balance: formatMoneyExact(Math.max(0, totalCents - depositCents)),
            }}
            signedAt={preview?.signedAt ?? data?.agreement?.signedAt ?? null}
            signer={
              drawn
                ? { first: savedSigner?.first ?? "", last: savedSigner?.last ?? "" }
                : accepted
                  ? {
                      first: signerFirst,
                      last: signerLast,
                      onFirst: setSignerFirst,
                      onLast: setSignerLast,
                    }
                  : { first: "", last: "" }
            }
            signature={
              drawn ? (
                <img src={signedName ?? ""} alt="Signature" className="client-packet-ink" />
              ) : accepted ? (
                <>
                  <SignaturePad
                    value={signature}
                    onChange={setSignature}
                    disabled={sign.isPending}
                  />
                  {isSignatureDataUrl(signature) && !named ? (
                    <p className="client-packet-stamp">
                      Add your first and last name above to finish signing.
                    </p>
                  ) : null}
                  {sign.isError ? (
                    <p role="alert" className="client-packet-stamp">
                      {sign.error.message}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="client-packet-stamp">Accept the proposal to sign.</p>
              )
            }
          />
        </div>
      );
    }
    return (
      <div className="client-packet-sheet">
        <div className="client-packet-invoice-top">
          <h2>Invoice</h2>
          <Wordmark tone="ink" className="client-packet-mark is-sheet" />
          <p>
            info@saysukii.com
            <br />
            saysukii.com
          </p>
          <p className="client-packet-kicker is-number">{invoiceNumber}</p>
          <p>
            Bill to
            <br />
            {clientName}
            {clientEmail ? (
              <>
                <br />
                {clientEmail}
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
            <tr>
              <td>
                {packageName}
                <small>{bookingLine}</small>
              </td>
              <td>1</td>
              <td>{formatMoneyExact(listCents)}</td>
              <td>{formatMoneyExact(listCents)}</td>
            </tr>
          </tbody>
        </table>
        {courtesyCents > 0 ? (
          <div className="client-packet-row">
            <span>Courtesy Discount</span>
            <span>−{formatMoneyExact(courtesyCents)}</span>
          </div>
        ) : null}
        <div className="client-packet-row">
          <span>Proposal total</span>
          <span>{formatMoneyExact(totalCents)}</span>
        </div>
        <div className="client-packet-row client-packet-total">
          <span>
            {paid ? "Balance due" : depositCents >= totalCents ? "Due in full" : "Deposit due"}
          </span>
          <span>
            {formatMoneyExact(paid ? 0 : depositCents)}
            {paid ? <span className="client-packet-paid">Paid</span> : null}
          </span>
        </div>
        <p style={{ marginTop: 18 }}>{INVOICE_THANKS}</p>
      </div>
    );
  }

  return (
    <main className="client-packet">
      <div className="client-packet-wrap">
        <header className="client-packet-mast">
          <Wordmark tone="ink" className="client-packet-mark" />
        </header>

        <div className="client-packet-steps" aria-label="packet">
          <button
            type="button"
            className={step === "proposal" ? "is-on" : undefined}
            onClick={() => setView("proposal")}
          >
            proposal
          </button>
          <button
            type="button"
            className={step === "agreement" ? "is-on" : undefined}
            onClick={() => setView("agreement")}
          >
            agreement
          </button>
          <button
            type="button"
            className={step === "invoice" ? "is-on" : undefined}
            onClick={() => setView("invoice")}
          >
            invoice
          </button>
        </div>

        {step === "proposal" ? (
          <div className="client-packet-nav">
            <button
              type="button"
              className="client-packet-arrow"
              aria-label="Previous page"
              disabled={safePage <= 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft size={18} strokeWidth={1.4} />
            </button>
            <div className="client-packet-count">
              proposal
              <span>
                {" "}
                · {safePage + 1} / {proposalCount}
              </span>
            </div>
            <button
              type="button"
              className="client-packet-arrow"
              aria-label="Next page"
              disabled={safePage >= proposalCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight size={18} strokeWidth={1.4} />
            </button>
          </div>
        ) : null}

        <div className="client-packet-card">
          {step === "proposal" && imageCount > 0 && current ? renderSlide(current, safePage) : null}
          {step === "proposal" && imageCount === 0 && frameUrl ? (
            <ProposalPages src={frameUrl} page={safePage} onPages={setPdfCount} />
          ) : null}
          {step === "proposal" && imageCount === 0 && !frameUrl
            ? renderSlide({ kind: "proposal" }, 0)
            : null}
          {step === "agreement" ? renderSlide({ kind: "agreement" }, 0) : null}
          {step === "invoice" ? renderSlide({ kind: "invoice" }, 0) : null}
        </div>

        {step === "proposal" && proposalCount > 1 ? (
          <div className="client-packet-dots">
            {Array.from({ length: proposalCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={index === safePage ? "client-packet-dot is-on" : "client-packet-dot"}
                aria-label={`Go to page ${index + 1}`}
                onClick={() => setPage(index)}
              />
            ))}
          </div>
        ) : null}

        {canRespond && step === "proposal" ? (
          <section className="client-packet-actions">
            <label>
              <span>Note</span>
              <textarea
                value={changeNote}
                maxLength={2000}
                onChange={(event) => setChangeNote(event.target.value)}
                placeholder="anything you’d like to add, or changes you’d like to request."
              />
            </label>
            <div className="client-packet-buttons">
              <button
                type="button"
                className="client-packet-accept"
                disabled={accept.isPending || changes.isPending}
                onClick={() => accept.mutate()}
              >
                {accept.isPending ? "Accepting…" : "Accept proposal"}
              </button>
              <button
                type="button"
                className="client-packet-quiet"
                disabled={changes.isPending || !changeNote.trim()}
                onClick={() => changes.mutate()}
              >
                {changes.isPending ? "Sending…" : "Request changes"}
              </button>
            </div>
            {accept.isError ? (
              <p role="alert" className="client-packet-stamp">
                {accept.error.message}
              </p>
            ) : null}
            {changes.isError ? (
              <p role="alert" className="client-packet-stamp">
                {changes.error.message}
              </p>
            ) : null}
            {noted ? (
              <p className="client-packet-stamp">
                Changes requested. You can still accept this proposal.
              </p>
            ) : null}
          </section>
        ) : null}

        {step === "proposal" && accepted ? <p className="client-packet-stamp">Accepted.</p> : null}

        {step === "agreement" && signed ? (
          <div className="client-packet-buttons">
            <button type="button" className="client-packet-accept" onClick={openInvoice}>
              Continue
            </button>
          </div>
        ) : null}

        {step === "invoice" ? (
          <div className="client-packet-buttons">
            {!signed ? (
              <p className="client-packet-stamp" style={{ marginTop: 0 }}>
                Sign the agreement to pay.
              </p>
            ) : paid ? (
              <p className="client-packet-stamp" style={{ marginTop: 0 }}>
                Paid in full. Thank you.
              </p>
            ) : depositIn ? (
              <div className="client-packet-balance">
                <p className="client-packet-stamp" style={{ marginTop: 0 }}>
                  Deposit received. {formatMoneyExact(balanceLeft)} remaining
                  {data?.balanceDue ? `, due ${shortDate(data.balanceDue)}` : ""}.
                </p>
                <SquarePay
                  token={token}
                  amountCents={balanceLeft}
                  clientName={clientName}
                  clientEmail={clientEmail}
                  summary={{ service: `${packageName} · balance`, eventDate: eventShort }}
                  onPaid={() =>
                    void queryClient.invalidateQueries({ queryKey: ["public-proposal", token] })
                  }
                />
              </div>
            ) : preview ? (
              <button
                type="button"
                className="client-packet-accept"
                disabled={pay.isPending}
                onClick={() => pay.mutate()}
              >
                {pay.isPending ? "Paying…" : `Pay ${formatMoneyExact(depositCents)}`}
              </button>
            ) : (
              <SquarePay
                token={token}
                amountCents={depositCents}
                clientName={clientName}
                clientEmail={clientEmail}
                fallbackHref={link}
                summary={{
                  service: packageName,
                  eventDate: eventShort,
                  balance:
                    depositCents < totalCents && data?.balanceDue
                      ? { amountCents: totalCents - depositCents, due: shortDate(data.balanceDue) }
                      : null,
                }}
                onPaid={() =>
                  void queryClient.invalidateQueries({ queryKey: ["public-proposal", token] })
                }
              />
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

/** MM/DD/YY, the way the studio writes every date */
function shortDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return day ? `${day[2]}/${day[3]}/${day[1]!.slice(2)}` : value;
}
