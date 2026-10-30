import fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { agreementSignedLine, type FloralBlock } from "@/lib/floral-agreement";

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
  /** quieter lines under the item, on the receipt */
  details?: string[];
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

export type AgreementSigner = {
  first: string;
  last: string;
  /** a png data url of the drawn signature */
  image: string;
  signedAt: string;
};

// the agreement's colors on the client's page: ink, and ink faded into white
const PAGE_INK = rgb(0.141, 0.133, 0.122);
const inkFaded = (percent: number) =>
  rgb(
    (255 - (percent / 100) * 219) / 255,
    (255 - (percent / 100) * 221) / 255,
    (255 - (percent / 100) * 224) / 255,
  );

/**
 * The signed floral service agreement, laid out like it is on the client's page: the logo, the
 * terms in the same blocks, then the client's signature and Say Sukii's.
 */
export async function renderAgreementPdf(args: {
  number: string;
  blocks: FloralBlock[];
  consent: string;
  client: AgreementSigner;
  /** say sukii countersigns the copy the client keeps */
  studio?: AgreementSigner | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Say Sukii Floral Service Agreement ${args.number}`);
  doc.registerFontkit(fontkit);
  const assets = await receiptAssets();
  const light = assets.light
    ? await doc.embedFont(assets.light)
    : await doc.embedFont(StandardFonts.Helvetica);
  const medium = assets.regular
    ? await doc.embedFont(assets.regular)
    : await doc.embedFont(StandardFonts.HelveticaBold);

  // the page's 724px column, scaled onto the letter page
  const M = 56;
  const contentW = PAGE_W - M * 2;
  const px = (value: number) => value * (contentW / 724);
  const bottom = M;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;
  let gapAfter = 0;

  const room = (height: number) => {
    if (y - height >= bottom) return;
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
    gapAfter = 0;
  };
  const text = (
    value: string,
    x: number,
    baseline: number,
    size: number,
    font: PDFFont,
    options: { color?: ReturnType<typeof rgb>; spacing?: number; italic?: boolean } = {},
  ) => {
    page.pushOperators(pushGraphicsState(), setCharacterSpacing(options.spacing ?? 0));
    page.drawText(value, {
      x,
      y: baseline,
      size,
      font,
      color: options.color ?? PAGE_INK,
      ...(options.italic ? { ySkew: degrees(12) } : {}),
    });
    page.pushOperators(popGraphicsState());
  };
  const widthOf = (value: string, size: number, font: PDFFont, spacing = 0) =>
    font.widthOfTextAtSize(value, size) + spacing * Math.max(0, value.length - 1);

  /** one block of text: css margins collapse, lines are 1.6 tall, a long block breaks across pages */
  const block = (
    value: string,
    style: {
      size: number;
      font: PDFFont;
      top: number;
      bottom: number;
      upper?: boolean;
      spacing?: number;
      color?: ReturnType<typeof rgb>;
      center?: boolean;
      italic?: boolean;
    },
  ) => {
    const size = px(style.size);
    const spacing = style.spacing ? size * style.spacing : 0;
    const shown = style.upper ? value.toUpperCase() : value;
    const lineHeight = size * 1.6;
    const lines = wrap(shown, style.font, size, contentW - spacing * 40);
    y -= Math.max(gapAfter, px(style.top));
    lines.forEach((line, index) => {
      // a heading stays with the line after it
      room(index === 0 && style.upper ? lineHeight * 3 : lineHeight);
      const lineWidth = widthOf(line, size, style.font, spacing);
      text(line, style.center ? (PAGE_W - lineWidth) / 2 : M, y - size * 1.12, size, style.font, {
        ...(style.color ? { color: style.color } : {}),
        spacing,
        ...(style.italic ? { italic: true } : {}),
      });
      y -= lineHeight;
    });
    gapAfter = px(style.bottom);
  };

  if (assets.logo) {
    const logo = await doc.embedPng(assets.logo);
    const width = px(120);
    const height = width * (logo.height / logo.width);
    y -= px(4);
    page.drawImage(logo, { x: (PAGE_W - width) / 2, y: y - height, width, height });
    y -= height;
    gapAfter = px(22);
  }

  for (const item of args.blocks) {
    if (item.kind === "title")
      block(item.text, { size: 18, font: medium, top: 0, bottom: 16, upper: true, spacing: 0.04 });
    else if (item.kind === "heading")
      block(item.text, { size: 13, font: medium, top: 22, bottom: 12, upper: true, spacing: 0.06 });
    else if (item.kind === "subhead")
      block(item.text, { size: 13, font: medium, top: 16, bottom: 12 });
    else if (item.kind === "line") block(item.text, { size: 13, font: light, top: 0, bottom: 4 });
    else if (item.kind === "note")
      block(item.text, {
        size: 13,
        font: medium,
        top: 22,
        bottom: 22,
        upper: true,
        spacing: 0.04,
        color: PINK,
        center: true,
      });
    else block(item.text, { size: 13, font: light, top: 0, bottom: 12 });
  }

  // authorization: a rule, the heading, then each signer; the heading stays with the client's part
  const signerHeight = (consent: boolean) =>
    px(22 + 20 + (consent ? 80 : 0) + 14 + 32 + 18 + 26 + 116 + 28);
  room(px(30 + 18 + 22 + 21 + 12) + signerHeight(true));
  y -= Math.max(gapAfter, px(30));
  page.drawLine({
    start: { x: M, y },
    end: { x: PAGE_W - M, y },
    thickness: 0.75,
    color: inkFaded(12),
  });
  y -= px(18);
  gapAfter = 0;
  block("Authorization / confirmation", {
    size: 13,
    font: medium,
    top: 22,
    bottom: 12,
    upper: true,
    spacing: 0.06,
  });

  const signer = async (heading: string, person: AgreementSigner, consent: string | null) => {
    // a signer's heading, names, box and date stay on one page
    room(signerHeight(Boolean(consent)));
    block(heading, { size: 12, font: medium, top: 22, bottom: 8, upper: true, spacing: 0.06 });
    if (consent) block(consent, { size: 13, font: light, top: 0, bottom: 12 });

    // first and last name, each on its own underline
    y -= Math.max(gapAfter, px(14));
    const column = (contentW - px(20)) / 2;
    const names: Array<[string, string]> = [
      [person.first, "First name"],
      [person.last, "Last name"],
    ];
    names.forEach(([value, label], index) => {
      const x = M + index * (column + px(20));
      const size = px(13);
      text(value || label, x, y - px(32) / 2 - size * 0.35, size, light, {
        color: value ? PAGE_INK : inkFaded(45),
      });
      page.drawLine({
        start: { x, y: y - px(32) },
        end: { x: x + column, y: y - px(32) },
        thickness: 0.75,
        color: inkFaded(28),
      });
    });
    y -= px(32);
    gapAfter = px(18);

    block("Signature", { size: 12, font: medium, top: 0, bottom: 6 });

    // the signature, in its soft rounded box
    y -= gapAfter;
    const boxHeight = px(116);
    page.drawSvgPath(roundedRect(contentW, boxHeight, px(10)), {
      x: M,
      y,
      color: rgb(0.973, 0.973, 0.973),
      borderColor: inkFaded(14),
      borderWidth: 0.75,
    });
    try {
      const png = await doc.embedPng(
        Uint8Array.from(Buffer.from(person.image.split(",")[1] ?? "", "base64")),
      );
      const scale = Math.min((contentW - px(32)) / png.width, px(96) / png.height);
      page.drawImage(png, {
        x: M + px(16),
        y: y - px(10) - (px(96) + png.height * scale) / 2,
        width: png.width * scale,
        height: png.height * scale,
      });
    } catch {
      // a signature that won't decode leaves the box empty rather than losing the agreement
    }
    y -= boxHeight;
    gapAfter = 0;
    block(`Signed ${agreementSignedLine(person.signedAt)}`, {
      size: 12,
      font: light,
      top: 8,
      bottom: 0,
      color: inkFaded(55),
      italic: true,
    });
  };

  await signer("Client signature", args.client, args.consent);
  if (args.studio) await signer("Say Sukii signature", args.studio, null);
  return doc.save();
}

/** an svg path for a rectangle with round corners, drawn down and right from its top left */
function roundedRect(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M ${r} 0`,
    `H ${width - r}`,
    `Q ${width} 0 ${width} ${r}`,
    `V ${height - r}`,
    `Q ${width} ${height} ${width - r} ${height}`,
    `H ${r}`,
    `Q 0 ${height} 0 ${height - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");
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
  /** "Booking for … per approved proposal.", the line under the title */
  booking?: string | null;
  /** the 4% convenience fee on the whole; the deposit and balance already carry their share */
  feeCents?: number;
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

  const fee = args.feeCents ?? 0;
  // with the 4% convenience fee: the amount, the fee, then the total the card is charged
  const rows: Array<[string, string, boolean]> = fee
    ? [
        ["Subtotal", money(args.amountCents), false],
        ["Convenience fee (4%)", money(fee), false],
        ["Invoice total", money(args.amountCents + fee), true],
      ]
    : [["Invoice total", money(args.amountCents), true]];
  if (args.depositCents > 0 && args.depositCents < args.amountCents + fee) {
    rows.push(["Deposit due now (50%)", money(args.depositCents), false]);
    rows.push(["Balance due before event", money(args.balanceCents), false]);
  } else {
    rows.push(["Amount due now", money(args.amountCents + fee), false]);
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
  page.drawText(args.booking || "Thank you for choosing Say Sukii! We appreciate your business.", {
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

export type ReceiptPayment = {
  amountCents: number;
  /** MM/DD/YY */
  paidOn: string;
  /** "Visa 1111", when square says how it was paid */
  method?: string | null;
};

/**
 * The client's receipt, laid out like square's paid invoice in the studio's colors: the logo and
 * studio details, a pink title, customer / receipt / payment columns, the items, the total, and
 * every payment in a blush card.
 */
export async function renderReceiptPdf(args: {
  number: string;
  /** e.g. "Floral Celebration 03/12/27" */
  title: string;
  client: { name: string; email?: string | null; phone?: string | null };
  /** MM/DD/YY */
  eventDate: string | null;
  venue: string | null;
  items: LineItem[];
  totalCents: number;
  /** every payment so far, oldest first; the last is the one this receipt is for */
  payments: ReceiptPayment[];
  /** what's left after this payment, and when it's due (MM/DD/YY) */
  balance: { amountCents: number; due: string | null } | null;
  /** MM/DD/YY, the day the receipt was issued */
  createdOn: string;
  /** "Booking for … per approved proposal.", the line under the title */
  booking?: string | null;
  /** the 4% convenience fee on the whole, when its payments carried it */
  feeCents?: number;
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
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const M = 50;
  const end = PAGE_W - M;
  const draw = (
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    options: { color?: ReturnType<typeof rgb>; align?: "right"; italic?: boolean } = {},
  ) =>
    page.drawText(text, {
      x: options.align === "right" ? x - font.widthOfTextAtSize(text, size) : x,
      y,
      size,
      font,
      color: options.color ?? INK,
      ...(options.italic ? { ySkew: degrees(10) } : {}),
    });
  const rule = (y: number, from = M, to = end) =>
    page.drawLine({
      start: { x: from, y },
      end: { x: to, y },
      thickness: 0.6,
      color: BLUSH_LINE,
    });

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: SOFT });
  const payment = args.payments.at(-1) ?? { amountCents: 0, paidOn: "" };

  // the logo, the studio, and the receipt's number and date
  let y = PAGE_H - 46;
  if (assets.logo) {
    const logo = await doc.embedPng(assets.logo);
    const height = 172 * (logo.height / logo.width);
    page.drawImage(logo, { x: M, y: y - height, width: 172, height });
  } else {
    draw("Say Sukii", M, y - 40, 30, regular);
  }
  draw("SAY SUKII, LLC", M + 196, y - 10, 8.5, regular);
  draw("info@saysukii.com  |  (305) 725-5029", M + 196, y - 24, 8.5, light);
  draw(`Receipt #${args.number}`, end, y - 10, 8.5, regular, { align: "right" });
  draw("Issued on", end, y - 34, 8.5, regular, { align: "right" });
  draw(args.createdOn, end, y - 47, 8.5, light, { align: "right" });
  y -= 92;
  page.drawRectangle({ x: M, y, width: end - M, height: 4, color: BLUSH_LINE });

  // the title, in the receipt's pink
  y -= 46;
  draw(args.title, M, y, 22, light, { color: PINK });
  y -= 22;
  draw(
    args.booking || "Thank you for choosing Say Sukii! We appreciate your business.",
    M,
    y,
    9,
    light,
  );

  // customer, receipt, payment
  y -= 28;
  const gap = 12;
  const columnW = (end - M - gap * 2) / 3;
  const columns: Array<[string, string[]]> = [
    [
      "Customer",
      [args.client.name, args.client.email ?? "", args.client.phone ?? ""].filter(Boolean),
    ],
    [
      "Receipt details",
      [
        money(args.totalCents + (args.feeCents ?? 0)),
        ...(args.eventDate ? [`Event date ${args.eventDate}`] : []),
        ...(args.venue ? [args.venue] : []),
      ],
    ],
    [
      "Payment",
      [
        // each on one line: "Paid 10/30/26 • $2,305.00"
        `Paid ${payment.paidOn} • ${money(payment.amountCents)}`,
        args.balance
          ? `Balance${args.balance.due ? ` ${args.balance.due}` : ""} • ${money(args.balance.amountCents)}`
          : "Paid in full",
      ],
    ],
  ];
  let lowest = y;
  columns.forEach(([heading, lines], index) => {
    const x = M + index * (columnW + gap);
    rule(y, x, x + columnW);
    draw(heading, x, y - 22, 8.5, regular);
    let lineY = y - 36;
    for (const line of lines.flatMap((value) => wrap(value, light, 8.5, columnW))) {
      draw(line, x, lineY, 8.5, light);
      lineY -= 12.5;
    }
    lowest = Math.min(lowest, lineY);
  });
  y = lowest - 8;
  rule(y);

  // the items
  const qtyX = 400;
  const priceX = 470;
  y -= 22;
  draw("Items", M, y, 8.5, regular);
  draw("Quantity", qtyX, y, 8.5, regular, { align: "right" });
  draw("Price", priceX, y, 8.5, regular, { align: "right" });
  draw("Amount", end, y, 8.5, regular, { align: "right" });
  y -= 12;
  rule(y);
  y -= 22;
  for (const item of args.items.slice(0, 10)) {
    // "Floral Celebration — Booking for…" reads as the item and, under it, its details
    const [name = item.name, ...rest] = item.name.split(" — ");
    const details = [...(rest.length ? [rest.join(" — ")] : []), ...(item.details ?? [])];
    draw(name, M, y, 9, light);
    draw(String(item.qty), qtyX, y, 9, light, { align: "right" });
    draw(money(item.unitPriceCents), priceX, y, 9, light, { align: "right" });
    draw(money(item.lineTotalCents), end, y, 9, light, { align: "right" });
    y -= 14;
    for (const line of details.flatMap((value) => wrap(value, light, 8.5, qtyX - M - 60))) {
      draw(line, M, y, 8.5, light, { color: MUTED, italic: true });
      y -= 12;
    }
    y -= 10;
  }
  rule(y + 4);

  // the subtotal, then the total
  y -= 16;
  const subtotal = args.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  draw("Subtotal", M, y, 9, light);
  draw(money(subtotal), end, y, 9, light, { align: "right" });
  const fee = args.feeCents ?? 0;
  if (fee > 0) {
    // the 4% convenience fee on the whole, which each payment carries its share of
    y -= 18;
    draw("Convenience fee (4%)", M, y, 9, light);
    draw(money(fee), end, y, 9, light, { align: "right" });
  }
  y -= 18;
  rule(y);
  y -= 26;
  draw(args.balance ? "Total" : "Total Paid", M, y, 16, regular);
  draw(money(args.totalCents + fee), end, y, 16, regular, { align: "right" });
  y -= 18;

  // every payment, and what's left, in a blush card
  const rows = args.payments.length + (args.balance ? 1 : 0);
  const cardHeight = 34 + rows * 18 + 10;
  page.drawRectangle({ x: M, y: y - cardHeight, width: end - M, height: cardHeight, color: BLUSH });
  let rowY = y - 22;
  draw("Payments", M + 16, rowY, 8.5, regular);
  rowY -= 18;
  for (const paid of args.payments) {
    draw(`${paid.paidOn}${paid.method ? ` (${paid.method})` : ""}`, M + 16, rowY, 9, light, {
      color: PINK,
    });
    draw(money(paid.amountCents), end - 16, rowY, 9, regular, { color: PINK, align: "right" });
    rowY -= 18;
  }
  if (args.balance) {
    const label = args.balance.due ? `Balance due ${args.balance.due}` : "Balance due";
    draw(label, M + 16, rowY, 9, light, { color: PINK });
    draw(money(args.balance.amountCents), end - 16, rowY, 9, regular, {
      color: PINK,
      align: "right",
    });
  }

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
    // node's file reader loads here, on the server, so the page's own bundle never pulls it in
    const { readFile } = await import("node:fs/promises");
    const load = async (path: string) => {
      try {
        return new Uint8Array(await readFile(`${process.cwd()}/public/${path}`));
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
