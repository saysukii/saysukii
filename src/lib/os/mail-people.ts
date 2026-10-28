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

export function mailRecord(toValues: Array<string | null | undefined>, ccValues: Array<string | null | undefined>) {
  const to = uniqueMails(toValues);
  const taken = new Set(to.map((email) => email.toLowerCase()));
  const cc = uniqueMails(ccValues).filter((email) => !taken.has(email.toLowerCase()));
  const line = cc.length ? `${to.join(", ")} · cc: ${cc.join(", ")}` : to.join(", ");
  return { to, cc, line };
}
