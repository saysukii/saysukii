import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const INK = rgb(0.102, 0.094, 0.09);
const MUTED = rgb(0.541, 0.498, 0.475);
const ROSE = rgb(0.871, 0.651, 0.678);
const CREAM = rgb(0.953, 0.922, 0.894);
const LINE = rgb(0.878, 0.827, 0.796);

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
  return cents < 0 ? `−${formatted}` : formatted;
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
    ["DATE", meta.eventDate ?? "To be confirmed"],
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

export async function renderAgreementPdf(args: {
  meta: DocumentMeta;
  typeLabel: string;
  version: number;
  content: string;
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

  drawFooter(page, fonts);
  return doc.save();
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
    page.drawText(item.name.slice(0, 42), { x: MARGIN, y, size: 10.5, font: fonts.body, color: INK });
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
    y -= 17;
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
