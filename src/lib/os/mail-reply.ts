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
  return (
    text
      .slice(0, cut)
      // plain-text mail puts each link's address after its words, like "reacted via Gmail <https://…>"
      .replace(/[ \t]*<https?:\/\/[^>\s]+>/g, "")
      .replace(/\n--\s*$/, "")
      .trim()
  );
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

// a link already written the studio's way: [label](https://…)
const WRITTEN_LINK = /\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)/g;
// plain-text mail writes a link as "label [https://…]" or "label <https://…>"
const BRACKETED =
  /\s?[[<]((?:https?:\/\/|mailto:)[^\]>\s]+|[^\]>\s@[<]+@[^\]>\s]+\.[a-z]{2,})[\]>](?!\()/gi;
const BARE = /\b(?:https?:\/\/|www\.)[^\s<>[\]]+|[^\s@<>()[\]:;,]+@[^\s@<>()[\]]+\.[a-z]{2,}/gi;
// a signature's picture comes through as its address, which isn't worth showing
const PICTURE = /googleusercontent\.com\/mail-sig|\.(?:png|jpe?g|gif|webp)(?:\?\S*)?$/i;

function hrefFor(target: string) {
  if (/^(?:https?:\/\/|mailto:)/i.test(target)) return target;
  if (/^www\./i.test(target)) return `https://${target}`;
  return `mailto:${target}`;
}

function plain(target: string) {
  return target
    .replace(/^(?:https?:\/\/|mailto:)/i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/** one line of plain text, with "label [link]" turned into a link on the label */
function linkBracketed(line: string) {
  let out = "";
  let last = 0;
  for (const match of line.matchAll(BRACKETED)) {
    const at = match.index ?? 0;
    const target = match[1]!;
    let before = line.slice(last, at);
    last = at + match[0].length;
    if (PICTURE.test(target)) {
      out += before;
      continue;
    }
    const lastWord = before.match(/(\S+)$/)?.[1] ?? "";
    let label = "";
    if (lastWord && plain(target).startsWith(plain(lastWord))) {
      label = lastWord;
    } else {
      // the words since the line began, or since a "web:" before them
      const lead = before.match(/(?:^|:\s)([^:]*)$/)?.[1]?.trim() ?? "";
      label = lead && lead.length <= 80 ? lead : lastWord;
    }
    if (!label) {
      out += `${before}[${plain(target)}](${hrefFor(target)})`;
      continue;
    }
    before = before.slice(0, before.lastIndexOf(label));
    out += `${before}[${label.replace(/[[\]]/g, "")}](${hrefFor(target)})`;
  }
  return out + line.slice(last);
}

/** the rest of a line, with any bare address or email turned into a link */
function linkBare(text: string) {
  return text.replace(BARE, (found) => {
    const trail = found.match(/[.,!?)]+$/)?.[0] ?? "";
    const target = trail ? found.slice(0, -trail.length) : found;
    if (PICTURE.test(target)) return trail;
    return `[${target}](${hrefFor(target)})${trail}`;
  });
}

function eachUnlinked(text: string, change: (part: string) => string) {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(WRITTEN_LINK)) {
    out += change(text.slice(last, match.index ?? 0)) + match[0];
    last = (match.index ?? 0) + match[0].length;
  }
  return out + change(text.slice(last));
}

/**
 * A letter's links, the way the studio reads them: plain-text mail's "www.atwasi.com
 * [http://www.atwasi.com]" becomes the words linked, a bare address or email becomes a link, and a
 * signature picture's address is dropped.
 */
export function linkPlainMail(body: string) {
  const bracketed = eachUnlinked(body, (part) => part.split("\n").map(linkBracketed).join("\n"));
  return eachUnlinked(bracketed, linkBare);
}
