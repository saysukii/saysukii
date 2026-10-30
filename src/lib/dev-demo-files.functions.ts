import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// local only: the fenty demo's signed agreement and receipt, drawn by the same code as the real ones
const signer = z.object({
  first: z.string().max(80),
  last: z.string().max(80),
  image: z.string().startsWith("data:image/png;base64,").max(2_000_000),
  signedAt: z.string().max(40),
});

export const renderDemoFile = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        kind: z.enum(["agreement", "receipt"]),
        number: z.string().max(40),
        clientName: z.string().max(200),
        clientEmail: z.string().max(200),
        clientPhone: z.string().max(60),
        eventLabel: z.string().max(120),
        eventDate: z.string().max(20).nullable(),
        venue: z.string().max(300).nullable(),
        totalCents: z.number().int().min(0),
        depositCents: z.number().int().min(0),
        courtesyCents: z.number().int().min(0),
        paidAt: z.string().max(40).nullable(),
        client: signer,
        studio: signer.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!import.meta.env.DEV) throw new Error("not found");
    const {
      AGREEMENT_CONSENT,
      floralAgreementBlocks,
      floralPackageName,
      formatEventWhen,
      invoiceBookingLine,
      invoiceDateLabel,
      statementOfWork,
    } = await import("@/lib/floral-agreement");
    const { formatMoneyExact } = await import("@/lib/money");
    const { renderAgreementPdf, renderReceiptPdf } = await import("@/lib/pdf.server");
    const short = (value: string | null) => {
      const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
      return day ? `${day[2]}/${day[3]}/${day[1]!.slice(2)}` : "";
    };
    let bytes: Uint8Array;
    if (data.kind === "agreement") {
      bytes = await renderAgreementPdf({
        number: data.number,
        blocks: floralAgreementBlocks({
          ...statementOfWork({
            flowers: data.eventLabel,
            eventWhen: formatEventWhen(data.eventDate),
            occasion: data.eventLabel,
            venue: data.venue ?? "",
          }),
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          clientEmail: data.clientEmail,
          total: formatMoneyExact(data.totalCents),
          deposit: formatMoneyExact(data.depositCents),
          balance: formatMoneyExact(Math.max(0, data.totalCents - data.depositCents)),
        }),
        consent: AGREEMENT_CONSENT,
        client: data.client,
        studio: data.studio,
      });
    } else {
      const paidOn = short(data.paidAt ?? new Date().toISOString());
      const left = data.totalCents - data.depositCents;
      const listCents = data.totalCents + data.courtesyCents;
      const packageName = floralPackageName(data.eventLabel);
      const booking = invoiceBookingLine(data.eventLabel, invoiceDateLabel(data.eventDate ?? ""));
      bytes = await renderReceiptPdf({
        booking,
        number: data.number,
        title: [packageName, short(data.eventDate)].filter(Boolean).join(" "),
        client: { name: data.clientName, email: data.clientEmail, phone: data.clientPhone },
        eventDate: short(data.eventDate) || null,
        venue: data.venue,
        items: [
          {
            name: packageName,
            qty: 1,
            unitPriceCents: listCents,
            lineTotalCents: listCents,
          },
          ...(data.courtesyCents > 0
            ? [
                {
                  name: "Courtesy discount",
                  qty: 1,
                  unitPriceCents: -data.courtesyCents,
                  lineTotalCents: -data.courtesyCents,
                },
              ]
            : []),
        ],
        totalCents: data.totalCents,
        payments: [{ amountCents: data.depositCents, paidOn, method: "Visa 1111" }],
        balance: left > 0 ? { amountCents: left, due: null } : null,
        createdOn: paidOn,
      });
    }
    return Buffer.from(bytes).toString("base64");
  });
