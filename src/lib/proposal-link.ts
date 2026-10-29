/** Proposals always live on the studio's own address, by the client's name. */
export const PROPOSAL_ORIGIN = "https://inside.saysukii.com";

// first-level pages a client's name can't take
const TAKEN_PATHS = new Set([
  "api",
  "auth",
  "book",
  "calendar",
  "clients",
  "dashboard",
  "directories",
  "email-preview",
  "inquire",
  "library",
  "loading",
  "onboarding",
  "pipeline",
  "proposal",
  "schedule",
  "settings",
  "shelf",
]);

const OUR_HOSTS = /^(inside\.saysukii\.com|localhost|127\.0\.0\.1)$/;

const PROPOSAL_LINK =
  /\[([^\]\n]+)\]\((https?:\/\/([^)\s/:]+)(?::\d+)?\/(?:proposal\/([A-Za-z0-9_-]+)|([a-z0-9]+(?:-[a-z0-9]+)*))\/?(?:#[^)\s]*)?)\)/g;

/** maya chen → maya-chen */
export function proposalSlug(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "client";
}

/** The name, or the name with -2, -3 when it's already taken. */
export function freeProposalSlug(name: string, taken: (slug: string) => boolean) {
  const base = proposalSlug(name);
  for (let n = 1; ; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!TAKEN_PATHS.has(slug) && !taken(slug)) return slug;
  }
}

export function isProposalSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !TAKEN_PATHS.has(value);
}

export function proposalLink(origin: string, slug: string) {
  return `${origin.replace(/\/$/, "")}/${slug}`;
}

/** Where a proposal link points: the studio's address, or this machine while developing. */
export function proposalOrigin() {
  if (import.meta.env.DEV && typeof window !== "undefined") return window.location.origin;
  return PROPOSAL_ORIGIN;
}

/** The token or name a proposal link carries, or null when the link isn't a proposal. */
function cardKey(host: string, token: string | undefined, slug: string | undefined) {
  if (token) return token;
  if (slug && OUR_HOSTS.test(host) && isProposalSlug(slug)) return slug;
  return null;
}

export function proposalCards(body: string) {
  const cards: { label: string; href: string; key: string }[] = [];
  const text = body
    .replace(
      PROPOSAL_LINK,
      (match, label: string, href: string, host: string, token?: string, slug?: string) => {
        const key = cardKey(host, token, slug);
        if (!key) return match;
        cards.push({ label, href, key });
        return "";
      },
    )
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
  return body.replace(
    PROPOSAL_LINK,
    (match, label: string, href: string, host: string, token?: string, slug?: string) =>
      cardKey(host, token, slug) ? `${label}\n${href}` : match,
  );
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
