import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const INK = rgb(0.102, 0.094, 0.09);
const MUTED = rgb(0.541, 0.498, 0.475);
const ROSE = rgb(0.871, 0.651, 0.678);
const CREAM = rgb(0.953, 0.922, 0.894);
const LINE = rgb(0.878, 0.827, 0.796);
const PINK = rgb(1, 0.302, 0.58);
const BLUSH = rgb(1, 0.859, 0.859);
const BLUSH_LINE = rgb(0.97, 0.75, 0.79);
const SOFT = rgb(1, 0.973, 0.976);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;

type Fonts = { body: PDFFont; bold: PDFFont; display: PDFFont; italic: PDFFont };

export type DocumentMeta = {
  kind: "Proposal" | "Agreement" | "Invoice";
  number: string;
  clientName: string;
  contactName: string | null;
  projectTitle: string;
  serviceLine: string;
  eventDate: string | null;
  venue: string | null;
};

export type LineItem = {
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

function money(cents: number): string {
  const formatted = `$${Math.abs(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawHeader(page: PDFPage, fonts: Fonts, meta: DocumentMeta): number {
  page.drawRectangle({ x: 0, y: PAGE_H - 150, width: PAGE_W, height: 150, color: CREAM });
  page.drawText("Say Sukii", {
    x: MARGIN,
    y: PAGE_H - 76,
    size: 30,
    font: fonts.italic,
    color: INK,
  });
  page.drawText("FLOWERS FOR THE PEOPLE  ·  MIAMI", {
    x: MARGIN,
    y: PAGE_H - 96,
    size: 7,
    font: fonts.body,
    color: MUTED,
  });

  const label = meta.kind.toUpperCase();
  const labelWidth = fonts.bold.widthOfTextAtSize(label, 9);
  page.drawText(label, {
    x: PAGE_W - MARGIN - labelWidth,
    y: PAGE_H - 62,
    size: 9,
    font: fonts.bold,
    color: MUTED,
  });
  const numWidth = fonts.display.widthOfTextAtSize(meta.number, 18);
  page.drawText(meta.number, {
    x: PAGE_W - MARGIN - numWidth,
    y: PAGE_H - 84,
    size: 18,
    font: fonts.display,
    color: INK,
  });

  page.drawRectangle({ x: 0, y: PAGE_H - 152, width: PAGE_W, height: 2, color: ROSE });
  return PAGE_H - 186;
}

function drawMetaBlock(page: PDFPage, fonts: Fonts, meta: DocumentMeta, top: number): number {
  const left = MARGIN;
  const right = PAGE_W / 2 + 20;
  const rows: Array<[string, string]> = [
    ["PREPARED FOR", meta.clientName],
    ["ATTENTION", meta.contactName ?? "—"],
  ];
  const rows2: Array<[string, string]> = [
    ["ENGAGEMENT", meta.projectTitle],
    ["SERVICE LINE", meta.serviceLine],
    ["DATE", shortDate(meta.eventDate) ?? "To be confirmed"],
    ["VENUE", meta.venue ?? "To be confirmed"],
  ];

  let y = top;
  rows.forEach(([k, v], i) => {
    const yy = top - i * 34;
    page.drawText(k, { x: left, y: yy, size: 7, font: fonts.bold, color: MUTED });
    page.drawText(v.slice(0, 44), { x: left, y: yy - 14, size: 11, font: fonts.body, color: INK });
  });
  rows2.forEach(([k, v], i) => {
    const yy = top - i * 34;
    page.drawText(k, { x: right, y: yy, size: 7, font: fonts.bold, color: MUTED });
    page.drawText(v.slice(0, 44), { x: right, y: yy - 14, size: 11, font: fonts.body, color: INK });
    y = Math.min(y, yy - 14);
  });
  return y - 34;
}

/** "2027-03-12" reads 03/12/27, like every date the studio writes */
function shortDate(value: string | null): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  return day ? `${day[2]}/${day[3]}/${day[1]!.slice(2)}` : value;
}

function drawFooter(page: PDFPage, fonts: Fonts): void {
  page.drawText("Say Sukii  ·  Miami, Florida  ·  info@saysukii.com", {
    x: MARGIN,
    y: 40,
    size: 7.5,
    font: fonts.body,
    color: MUTED,
  });
}

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    display: await doc.embedFont(StandardFonts.TimesRoman),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
}

export async function renderProposalPdf(args: {
  meta: DocumentMeta;
  items: LineItem[];
  subtotalCents: number;
  totalCents: number;
  depositCents: number;
  essenceCount: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Say Sukii Proposal ${args.meta.number}`);
  const fonts = await loadFonts(doc);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = drawHeader(page, fonts, args.meta);
  y = drawMetaBlock(page, fonts, args.meta, y);

  page.drawText("The Design", { x: MARGIN, y, size: 20, font: fonts.display, color: INK });
  y -= 22;
  const intro =
    "A layered, seasonal design built for this room and this moment. Botanicals are sourced at market the week of the engagement, so palette and texture stay alive rather than catalogued. Below is the scope as designed, with pricing held for thirty days.";
  for (const line of wrap(intro, fonts.body, 10.5, PAGE_W - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y, size: 10.5, font: fonts.body, color: MUTED });
    y -= 15;
  }
  y -= 18;

  // table head
  page.drawText("SCOPE", { x: MARGIN, y, size: 7, font: fonts.bold, color: MUTED });
  page.drawText("QTY", { x: 372, y, size: 7, font: fonts.bold, color: MUTED });
  page.drawText("RATE", { x: 424, y, size: 7, font: fonts.bold, color: MUTED });
  page.drawText("TOTAL", { x: 505, y, size: 7, font: fonts.bold, color: MUTED });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  });
  y -= 18;

  for (const item of args.items) {
    if (y < 130) {
      drawFooter(page, fonts);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN - 20;
    }
    const nameLines = wrap(item.name, fonts.body, 10.5, 290);
    nameLines.forEach((line, i) => {
      page.drawText(line, { x: MARGIN, y: y - i * 13, size: 10.5, font: fonts.body, color: INK });
    });
    page.drawText(String(item.qty), { x: 372, y, size: 10.5, font: fonts.body, color: MUTED });
    page.drawText(money(item.unitPriceCents), {
      x: 424,
      y,
      size: 10.5,
      font: fonts.body,
      color: MUTED,
    });
    const totalText = money(item.lineTotalCents);
    page.drawText(totalText, {
      x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(totalText, 10.5),
      y,
      size: 10.5,
      font: fonts.bold,
      color: INK,
    });
    y -= Math.max(nameLines.length * 13, 13) + 11;
  }

  y -= 6;
  page.drawLine({
    start: { x: 330, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  });
  y -= 20;

  const totalsRows: Array<[string, string, boolean]> = [
    ["Subtotal", money(args.subtotalCents), false],
    ["Investment total", money(args.totalCents), true],
  ];
  if (args.depositCents > 0 && args.depositCents < args.totalCents) {
    totalsRows.push(["Retainer to reserve (50%)", money(args.depositCents), false]);
    totalsRows.push(["Balance before event", money(args.totalCents - args.depositCents), false]);
  }
  for (const [label, value, emphasize] of totalsRows) {
    const size = emphasize ? 13 : 10.5;
    const font = emphasize ? fonts.bold : fonts.body;
    page.drawText(label, { x: 330, y, size, font: fonts.body, color: emphasize ? INK : MUTED });
    page.drawText(value, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color: INK,
    });
    y -= emphasize ? 24 : 17;
  }

  if (args.essenceCount > 0) {
    y -= 10;
    page.drawText(
      `Essence board: ${args.essenceCount} reference image${args.essenceCount === 1 ? "" : "s"} accompany this proposal.`,
      { x: MARGIN, y, size: 9.5, font: fonts.italic, color: MUTED },
    );
  }

  drawFooter(page, fonts);
  return doc.save();
}

export type AgreementSignature = {
  name: string;
  /** a png data url of the drawn signature */
  image: string;
  signedAt: string;
};

export async function renderAgreementPdf(args: {
  meta: DocumentMeta;
  typeLabel: string;
  version: number;
  content: string;
  /** the client's signature, then the studio's, on the copy the client keeps */
  signatures?: { client?: AgreementSignature; studio?: AgreementSignature | null };
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Say Sukii Agreement ${args.meta.number}`);
  const fonts = await loadFonts(doc);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = drawHeader(page, fonts, args.meta);

  page.drawText(args.typeLabel, { x: MARGIN, y, size: 20, font: fonts.display, color: INK });
  y -= 16;
  page.drawText(`Version ${args.version}`, {
    x: MARGIN,
    y,
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });
  y -= 26;

  for (const line of wrap(args.content, fonts.body, 10, PAGE_W - MARGIN * 2)) {
    if (y < 90) {
      drawFooter(page, fonts);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    const isHeading = /^\d+\.\s[A-Z]/.test(line) || line === "Accepted by:";
    page.drawText(line, {
      x: MARGIN,
      y,
      size: isHeading ? 9.5 : 10,
      font: isHeading ? fonts.bold : fonts.body,
      color: isHeading ? INK : MUTED,
    });
    y -= line === "" ? 8 : 15;
  }

  const signers = [
    args.signatures?.client ? { label: "Client signature", ...args.signatures.client } : null,
    args.signatures?.studio ? { label: "Say Sukii signature", ...args.signatures.studio } : null,
  ].filter((signer): signer is AgreementSignature & { label: string } => Boolean(signer));
  if (signers.length) {
    if (y < 90 + signers.length * 130) {
      drawFooter(page, fonts);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    y -= 12;
    page.drawText("Authorization / confirmation", {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.bold,
      color: INK,
    });
    y -= 26;
    for (const signer of signers) {
      page.drawText(signer.label, { x: MARGIN, y, size: 9.5, font: fonts.bold, color: INK });
      y -= 16;
      page.drawText(signer.name, { x: MARGIN, y, size: 10, font: fonts.body, color: INK });
      y -= 8;
      const base64 = signer.image.split(",")[1] ?? "";
      try {
        const png = await doc.embedPng(Uint8Array.from(Buffer.from(base64, "base64")));
        const scale = Math.min(200 / png.width, 56 / png.height);
        page.drawImage(png, {
          x: MARGIN,
          y: y - png.height * scale,
          width: png.width * scale,
          height: png.height * scale,
        });
        y -= png.height * scale + 8;
      } catch {
        y -= 8;
      }
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: MARGIN + 220, y },
        thickness: 0.6,
        color: MUTED,
      });
      y -= 14;
      page.drawText(`Signed ${signedOn(signer.signedAt)}`, {
        x: MARGIN,
        y,
        size: 8.5,
        font: fonts.body,
        color: MUTED,
      });
      y -= 30;
    }
  }

  drawFooter(page, fonts);
  return doc.save();
}

function signedOn(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

export async function renderInvoicePdf(args: {
  meta: DocumentMeta;
  items: LineItem[];
  amountCents: number;
  depositCents: number;
  balanceCents: number;
  dueDate: string | null;
  paymentLink: string | null;
  sharedOn?: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Say Sukii Invoice ${args.meta.number}`);
  const fonts = await loadFonts(doc);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  let y = drawHeader(page, fonts, args.meta);
  y -= 36;
  if (args.sharedOn) {
    const shared = `Shared ${args.sharedOn}`;
    page.drawText(shared, {
      x: PAGE_W - MARGIN - fonts.body.widthOfTextAtSize(shared, 10),
      y,
      size: 10,
      font: fonts.body,
      color: MUTED,
    });
    y -= 28;
  }
  y = drawMetaBlock(page, fonts, args.meta, y);

  page.drawText("DUE", { x: MARGIN, y, size: 7, font: fonts.bold, color: MUTED });
  page.drawText(args.dueDate ?? "On receipt", {
    x: MARGIN,
    y: y - 14,
    size: 11,
    font: fonts.body,
    color: INK,
  });
  y -= 44;

  const qtyX = 390;
  const priceX = 470;
  const amountX = PAGE_W - MARGIN;
  const heads: Array<[string, number]> = [
    ["ITEM", MARGIN],
    ["QUANTITY", qtyX],
    ["PRICE", priceX],
    ["AMOUNT", amountX],
  ];
  for (const [label, right] of heads) {
    const width = fonts.bold.widthOfTextAtSize(label, 7);
    page.drawText(label, {
      x: label === "ITEM" ? MARGIN : right - width,
      y,
      size: 7,
      font: fonts.bold,
      color: MUTED,
    });
  }
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  });
  y -= 18;

  for (const item of args.items) {
    if (y < 200) break;
    // a long name wraps under itself instead of running into the quantity
    const nameLines = wrap(item.name, fonts.body, 10.5, qtyX - MARGIN - 50).slice(0, 3);
    nameLines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN,
        y: y - index * 14,
        size: 10.5,
        font: fonts.body,
        color: INK,
      });
    });
    const cells: Array<[string, number]> = [
      [String(item.qty), qtyX],
      [money(item.unitPriceCents), priceX],
      [money(item.lineTotalCents), amountX],
    ];
    for (const [text, right] of cells) {
      page.drawText(text, {
        x: right - fonts.body.widthOfTextAtSize(text, 10.5),
        y,
        size: 10.5,
        font: fonts.body,
        color: INK,
      });
    }
    y -= 17 + (nameLines.length - 1) * 14;
  }

  y -= 8;
  page.drawLine({
    start: { x: 330, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  });
  y -= 22;

  const rows: Array<[string, string, boolean]> = [["Invoice total", money(args.amountCents), true]];
  if (args.depositCents > 0 && args.depositCents < args.amountCents) {
    rows.push(["Deposit due now (50%)", money(args.depositCents), false]);
    rows.push(["Balance due before event", money(args.balanceCents), false]);
  } else {
    rows.push(["Amount due now", money(args.amountCents), false]);
  }
  for (const [label, value, emphasize] of rows) {
    const size = emphasize ? 14 : 10.5;
    const font = emphasize ? fonts.bold : fonts.body;
    page.drawText(label, { x: 330, y, size, font: fonts.body, color: emphasize ? INK : MUTED });
    page.drawText(value, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color: INK,
    });
    y -= emphasize ? 26 : 17;
  }

  y -= 16;
  page.drawText("Thank you for choosing Say Sukii! We appreciate your business.", {
    x: MARGIN,
    y,
    size: 10,
    font: fonts.italic,
    color: INK,
  });
  y -= 28;
  if (args.paymentLink) {
    page.drawText("Pay online", { x: MARGIN, y, size: 7, font: fonts.bold, color: MUTED });
    page.drawText(args.paymentLink.slice(0, 80), {
      x: MARGIN,
      y: y - 14,
      size: 10,
      font: fonts.body,
      color: INK,
    });
  } else {
    page.drawText("A secure payment link will be issued with this invoice.", {
      x: MARGIN,
      y,
      size: 9.5,
      font: fonts.italic,
      color: MUTED,
    });
  }

  drawFooter(page, fonts);
  return doc.save();
}

export type ReceiptPayment = { amountCents: number; paidOn: string };

/**
 * The client's receipt, as a short thank-you letter: the logo, "thank you, {name}.", what was
 * received and what's left, then the items and payments in a blush card.
 */
export async function renderReceiptPdf(args: {
  number: string;
  clientName: string;
  /** what it's for, e.g. "private dinner" */
  occasion: string;
  /** MM/DD/YY */
  eventDate: string | null;
  venue: string | null;
  items: LineItem[];
  totalCents: number;
  /** every payment so far, oldest first; the last is the one this receipt is for */
  payments: ReceiptPayment[];
  /** true for the payment that booked the project */
  booking: boolean;
  /** what's left after this payment, and when it's due (MM/DD/YY) */
  balance: { amountCents: number; due: string | null } | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Say Sukii Receipt ${args.number}`);
  const assets = await receiptAssets();
  doc.registerFontkit(fontkit);
  const light = assets.light
    ? await doc.embedFont(assets.light)
    : await doc.embedFont(StandardFonts.Helvetica);
  const regular = assets.regular
    ? await doc.embedFont(assets.regular)
    : await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const M = 72;
  const right = (text: string, x: number, y: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color });

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: SOFT });
  const payment = args.payments.at(-1) ?? { amountCents: 0, paidOn: "" };
  if (assets.logo) {
    const logo = await doc.embedPng(assets.logo);
    const height = 132 * (logo.height / logo.width);
    page.drawImage(logo, { x: M, y: PAGE_H - 62 - height, width: 132, height });
  } else {
    page.drawText("Say Sukii", { x: M, y: PAGE_H - 86, size: 26, font: italic, color: INK });
  }
  right(`receipt ${args.number}  ·  ${payment.paidOn}`, PAGE_W - M, PAGE_H - 80, 9.5, light, MUTED);

  const first = (args.clientName.trim().split(/\s+/)[0] ?? args.clientName).toLowerCase();
  page.drawText(`thank you, ${first}.`, {
    x: M,
    y: PAGE_H - 180,
    size: 34,
    font: light,
    color: PINK,
  });

  const what = args.booking ? (args.balance ? "deposit" : "payment") : "final payment";
  const where = [
    args.eventDate ? ` on ${args.eventDate}` : "",
    args.venue ? ` at ${args.venue}` : "",
  ].join("");
  const words = [
    `we received your ${what} of ${money(payment.amountCents)} on ${payment.paidOn} for your ${args.occasion}${where}.`,
    "",
    args.balance
      ? `the remaining ${money(args.balance.amountCents)} is due ${args.balance.due ?? "before your event"}. we'll send a reminder before then, with a link straight to your invoice.`
      : "you're paid in full. keep this with your signed service agreement.",
  ].join("\n");
  let y = PAGE_H - 226;
  for (const line of wrap(words, light, 12, PAGE_W - M * 2 - 40)) {
    if (line) page.drawText(line, { x: M, y, size: 12, font: light, color: INK });
    y -= line ? 19 : 10;
  }

  // the blush card: items, the total, each payment, and what's left
  const pad = M + 24;
  const end = PAGE_W - M - 24;
  const itemLines = args.items.slice(0, 12).map((item) => ({
    lines: wrap(item.name.toLowerCase(), light, 10.5, end - pad - 110).slice(0, 2),
    amount: money(item.lineTotalCents),
  }));
  const rowsHeight =
    itemLines.reduce((sum, item) => sum + 20 + (item.lines.length - 1) * 14, 0) +
    40 +
    (args.payments.length + (args.balance ? 1 : 0)) * 20;
  y -= 30;
  const top = y;
  const cardHeight = rowsHeight + 44;
  page.drawRectangle({
    x: M,
    y: top - cardHeight,
    width: PAGE_W - M * 2,
    height: cardHeight,
    color: BLUSH,
  });
  y = top - 32;
  for (const item of itemLines) {
    item.lines.forEach((line, index) => {
      page.drawText(line, { x: pad, y: y - index * 14, size: 10.5, font: light, color: INK });
    });
    right(item.amount, end, y, 10.5, light);
    y -= 20 + (item.lines.length - 1) * 14;
  }
  page.drawLine({
    start: { x: pad, y: y + 8 },
    end: { x: end, y: y + 8 },
    thickness: 0.6,
    color: BLUSH_LINE,
  });
  y -= 14;
  page.drawText("total", { x: pad, y, size: 10.5, font: regular, color: INK });
  right(money(args.totalCents), end, y, 10.5, regular);
  y -= 26;
  const pinkRows: Array<[string, string]> = [
    ...args.payments.map((paid): [string, string] => [
      `paid ${paid.paidOn}`,
      money(paid.amountCents),
    ]),
    ...(args.balance
      ? ([
          [
            args.balance.due ? `balance due ${args.balance.due}` : "balance due",
            money(args.balance.amountCents),
          ],
        ] as Array<[string, string]>)
      : []),
  ];
  for (const [label, value] of pinkRows) {
    page.drawText(label, { x: pad, y, size: 10.5, font: regular, color: PINK });
    right(value, end, y, 10.5, regular, PINK);
    y -= 20;
  }

  page.drawText("with love, say sukii", {
    x: M,
    y: top - cardHeight - 50,
    size: 13,
    font: italic,
    color: INK,
  });
  page.drawText("say sukii  ·  miami, florida  ·  info@saysukii.com", {
    x: M,
    y: 56,
    size: 8,
    font: light,
    color: MUTED,
  });
  return doc.save();
}

type ReceiptAssets = {
  logo: Uint8Array | null;
  light: Uint8Array | null;
  regular: Uint8Array | null;
};
let receiptAssetsCache: Promise<ReceiptAssets> | null = null;

/**
 * The wordmark and Nohemi, from public/ when it's on disk (local), otherwise from the live site
 * (vercel's functions don't carry public/). Whatever can't load falls back to the standard fonts.
 */
function receiptAssets() {
  receiptAssetsCache ??= (async () => {
    const load = async (path: string) => {
      try {
        return new Uint8Array(await readFile(join(process.cwd(), "public", path)));
      } catch {
        try {
          const response = await fetch(`https://inside.saysukii.com/${path}`);
          return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
        } catch {
          return null;
        }
      }
    };
    const [logo, light, regular] = await Promise.all([
      load("email/say-sukii-wordmark.png"),
      load("fonts/Nohemi-Light.otf"),
      load("fonts/Nohemi-Regular.otf"),
    ]);
    return { logo, light, regular };
  })();
  return receiptAssetsCache;
}
