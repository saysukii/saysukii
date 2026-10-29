const WROTE = /\nOn [^\n]{6,180} wrote:\s*\n/i;
const OUTLOOK = /\n-{2,}\s*original message\s*-{2,}\s*\n/i;
const HEADER = /\nFrom: [^\n]+\nSent: /i;

export function clientReplyText(body: string) {
  const text = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const marks = [text.search(WROTE), text.search(OUTLOOK), text.search(HEADER)].filter(
    (index) => index >= 0,
  );
  const lines = text.split("\n");
  const quoted = lines.findIndex((line, index) => index > 0 && line.startsWith(">"));
  if (quoted >= 0) marks.push(lines.slice(0, quoted).join("\n").length);
  const cut = marks.length ? Math.min(...marks) : text.length;
  return text
    .slice(0, cut)
    .replace(/\n--\s*$/, "")
    .trim();
}

export type MailPiece = { kind: "text" | "em" | "strong"; text: string };

const EMPHASIS = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

export function mailPieces(value: string): MailPiece[] {
  const pieces: MailPiece[] = [];
  const pattern = new RegExp(EMPHASIS.source, "g");
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push({ kind: "text", text: value.slice(last, index) });
    if (match[1]) pieces.push({ kind: "strong", text: match[1] });
    else if (match[2]) pieces.push({ kind: "em", text: match[2] });
    last = index + match[0].length;
  }
  if (last < value.length) pieces.push({ kind: "text", text: value.slice(last) });
  return pieces.length ? pieces : [{ kind: "text", text: value }];
}
