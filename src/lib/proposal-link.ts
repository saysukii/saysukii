const PROPOSAL_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]*\/proposal\/([A-Za-z0-9_-]+)(?:#[^)\s]*)?)\)/g;

export function clientHash(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return slug || "client";
}

export function proposalLink(origin: string, token: string, clientName?: string | null) {
  const base = `${origin.replace(/\/$/, "")}/proposal/${token}`;
  const hash = clientName?.trim() ? clientHash(clientName) : "";
  return hash ? `${base}#${hash}` : base;
}

export function proposalToken(value: string) {
  const raw = value.split("/proposal/").pop() ?? value;
  return raw.split(/[?#]/)[0] ?? "";
}

export function proposalCards(body: string) {
  const cards: { label: string; href: string; token: string }[] = [];
  const text = body
    .replace(PROPOSAL_LINK, (_match, label: string, href: string, token: string) => {
      cards.push({ label, href, token });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, cards };
}

export function ensureProposalLink(body: string, href: string) {
  if (body.includes(href)) return body;
  const line = `[your proposal](${href})`;
  return body.trim() ? `${body.trim()}\n\n${line}` : line;
}

export function letterWithProposalUrl(body: string) {
  return body.replace(PROPOSAL_LINK, (_match, label: string, href: string) => `${label}\n${href}`);
}

export function dollarsToCents(value: string) {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function formatDollarInput(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return "";
  const match = cleaned.match(/^(\d*)(\.\d{0,2})?/);
  if (!match) return "";
  const whole = (match[1] ?? "").replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  const shown = whole || (fraction ? "0" : "");
  return `${shown.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
}

export function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("could not read that file"));
    reader.readAsDataURL(file);
  });
}
