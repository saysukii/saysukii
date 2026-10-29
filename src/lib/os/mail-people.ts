const MAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function uniqueMails(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const email = value?.trim().replace(/[\r\n]/g, "") ?? "";
    const key = email.toLowerCase();
    if (!MAIL_ADDRESS.test(email) || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function mailRecord(
  toValues: Array<string | null | undefined>,
  ccValues: Array<string | null | undefined>,
) {
  const to = uniqueMails(toValues);
  const taken = new Set(to.map((email) => email.toLowerCase()));
  const cc = uniqueMails(ccValues).filter((email) => !taken.has(email.toLowerCase()));
  const line = cc.length ? `${to.join(", ")} · cc: ${cc.join(", ")}` : to.join(", ");
  return { to, cc, line };
}

/** Reads back the "to · cc:" line stored with each letter. */
export function readMailLine(line: string | null | undefined) {
  const [toPart = "", ccPart = ""] = (line ?? "").split(/\s*·\s*cc:\s*/i);
  const split = (part: string) => part.split(/[,;]+/).map((value) => value.trim());
  return { to: uniqueMails(split(toPart)), cc: uniqueMails(split(ccPart)) };
}

type ThreadMail = {
  direction: "inbound" | "outbound" | "note";
  from_address: string | null;
  to_address: string | null;
  status?: string;
};

/**
 * Reply all, the way gmail does it: whoever wrote the latest letter and everyone on its to line go on to,
 * its cc stays on cc. The studio's own sending address and the client (always on to) are left out.
 */
export function replyAllPeople(messages: ThreadMail[], clientEmail: string | null | undefined) {
  const studio = new Set(["info@saysukii.com"]);
  for (const message of messages) {
    if (message.direction === "outbound" && message.status !== "received" && message.from_address) {
      studio.add(message.from_address.trim().toLowerCase());
    }
  }
  const latest = [...messages].reverse().find((message) => message.direction !== "note");
  if (!latest) return { to: [], cc: [] };
  const line = readMailLine(latest.to_address);
  const skip = (email: string) =>
    studio.has(email.toLowerCase()) || email.toLowerCase() === clientEmail?.trim().toLowerCase();
  const to = uniqueMails([latest.from_address, ...line.to]).filter((email) => !skip(email));
  const taken = new Set(to.map((email) => email.toLowerCase()));
  const cc = line.cc.filter((email) => !skip(email) && !taken.has(email.toLowerCase()));
  return { to, cc };
}
