const WROTE = /\nOn [^\n]{6,180} wrote:\s*\n/i;
const OUTLOOK = /\n-{2,}\s*original message\s*-{2,}\s*\n/i;
const HEADER = /\nFrom: [^\n]+\nSent: /i;

export function clientReplyText(body: string) {
  const text = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const marks = [text.search(WROTE), text.search(OUTLOOK), text.search(HEADER)].filter((index) => index >= 0);
  const lines = text.split("\n");
  const quoted = lines.findIndex((line, index) => index > 0 && line.startsWith(">"));
  if (quoted >= 0) marks.push(lines.slice(0, quoted).join("\n").length);
  const cut = marks.length ? Math.min(...marks) : text.length;
  return text
    .slice(0, cut)
    .replace(/\n--\s*$/, "")
    .trim();
}
