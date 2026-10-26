import type { InquiryMessageRow } from "../../integrations/supabase/types";

export type GmailSendResult = {
  gmail_message_id: string;
  gmail_thread_id: string;
};

export type ReplyContext = {
  threadId: string | null;
  replyToMessageId: string | null;
  subject: string | null;
};

export type Rfc822Input = {
  from: string;
  fromName?: string | null;
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
  date?: Date;
};

export function replySubject(existing: string | null | undefined) {
  const trimmed = existing?.trim();
  if (!trimmed) return "from say sukii";
  if (/^re\s*:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function resolveReplyContext(
  messages: Array<Pick<InquiryMessageRow, "gmail_thread_id" | "gmail_message_id" | "subject" | "sent_at" | "channel">>,
): ReplyContext {
  const ordered = [...messages].sort((left, right) => left.sent_at.localeCompare(right.sent_at));
  const threaded = [...ordered].reverse().find((row) => row.gmail_thread_id);
  const lastMail = [...ordered].reverse().find((row) => row.channel === "email" || row.channel === "form");
  const replyTo = [...ordered].reverse().find((row) => row.gmail_message_id);
  return {
    threadId: threaded?.gmail_thread_id ?? null,
    replyToMessageId: replyTo?.gmail_message_id ?? null,
    subject: lastMail?.subject ?? null,
  };
}

export function formatMailbox(name: string | null | undefined, email: string) {
  const trimmed = name?.trim();
  if (!trimmed) return email;
    const safe = trimmed.replace(/"/g, '\\"');
  return `"${safe}" <${email}>`;
}

export function encodeHeader(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function bracketMessageId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

export function markdownToPlain(value: string) {
  return value.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
}

const LINK_PINK = "#ff4d94";

export function markdownToHtml(value: string) {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, href: string) => {
      if (/\/proposal\//i.test(href)) {
        return `<a href="${href}" style="display:inline-block;margin:8px 0;padding:12px 22px;background:${LINK_PINK};color:#fff8f9;text-decoration:none;border-radius:999px;font-weight:600;">${label}</a>`;
      }
      return `<a href="${href}" style="color:${LINK_PINK};text-decoration:underline;">${label}</a>`;
    })
    .replaceAll("\n", "<br>");
}

function base64Body(value: string) {
  return Buffer.from(value.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
}

export function buildRfc822(input: Rfc822Input) {
  const date = (input.date ?? new Date()).toUTCString().replace(/UTC$/i, "GMT");
  const boundary = "saysukii-letter";
  const headers = [
    `From: ${formatMailbox(input.fromName, input.from)}`,
    `To: ${formatMailbox(input.toName, input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${date}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${bracketMessageId(input.inReplyTo)}`);
  const references = input.references || input.inReplyTo;
  if (references) headers.push(`References: ${bracketMessageId(references)}`);
  const plain = base64Body(markdownToPlain(input.body));
  const html = base64Body(
    `<!DOCTYPE html><html><body style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#24221F;">${markdownToHtml(input.body)}</body></html>`,
  );
  return [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    plain,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export function encodeGmailRaw(rfc822: string) {
  return Buffer.from(rfc822, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function headerFromList(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const match = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  const value = match?.value?.trim();
  return value || null;
}

export async function fetchGmailReplyHeaders(
  gmailMessageId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "Message-ID",
  });
  params.append("metadataHeaders", "References");
  params.append("metadataHeaders", "Subject");
  const response = await fetchImpl(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const payload = (await response.json()) as {
    payload?: { headers?: Array<{ name?: string; value?: string }> };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "Gmail message lookup failed");
  const headers = payload.payload?.headers;
  return {
    messageId: headerFromList(headers, "Message-ID") ?? headerFromList(headers, "Message-Id"),
    references: headerFromList(headers, "References"),
    subject: headerFromList(headers, "Subject"),
  };
}

export async function sendInquiryEmail(
  input: Rfc822Input & {
    threadId?: string | null;
    accessToken: string;
    fetchImpl?: typeof fetch;
  },
): Promise<GmailSendResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const raw = encodeGmailRaw(buildRfc822(input));
  const body: { raw: string; threadId?: string } = { raw };
  if (input.threadId) body.threadId = input.threadId;
  const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    id?: string;
    threadId?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Gmail send failed (${response.status})`);
  }
  return {
    gmail_message_id: payload.id,
    gmail_thread_id: payload.threadId || input.threadId || payload.id,
  };
}

export function sendResultContainsSecrets(result: GmailSendResult, accessToken: string) {
  const encoded = JSON.stringify(result);
  return encoded.includes(accessToken) || /Bearer/i.test(encoded);
}
