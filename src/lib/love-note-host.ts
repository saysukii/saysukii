/** The card's own address. It shows only the card, and takes notes; the studio isn't reachable there. */
export const LOVE_NOTE_HOST = "lovenote.saysukii.com";

export function isLoveNoteHost(headers: Headers) {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(":")[0];
  return host?.toLowerCase() === LOVE_NOTE_HOST;
}

/** What a request to the card's address gets. */
export function loveNoteHostAction(method: string, pathname: string) {
  if (pathname === "/api/love-notes" || pathname.startsWith("/api/love-notes/")) return "pass";
  return method === "GET" || method === "HEAD" ? "card" : "refuse";
}
