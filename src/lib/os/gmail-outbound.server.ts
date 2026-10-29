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

export type MailAttachment = {
  name: string;
  type: string;
  data: Uint8Array;
};

/** Gmail refuses anything over 25mb of attachments for most recipients. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type Rfc822Input = {
  from: string;
  fromName?: string | null;
  to: string;
  toName?: string | null;
  tos?: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
  date?: Date;
  attachments?: MailAttachment[];
};

export function replySubject(existing: string | null | undefined) {
  const trimmed = existing?.trim();
  if (!trimmed) return "from say sukii";
  if (/^re\s*:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function resolveReplyContext(
  messages: Array<
    Pick<
      InquiryMessageRow,
      "gmail_thread_id" | "gmail_message_id" | "subject" | "sent_at" | "channel"
    >
  >,
): ReplyContext {
  const ordered = [...messages].sort((left, right) => left.sent_at.localeCompare(right.sent_at));
  const threaded = [...ordered].reverse().find((row) => row.gmail_thread_id);
  const lastMail = [...ordered]
    .reverse()
    .find((row) => row.channel === "email" || row.channel === "form");
  const replyTo = [...ordered].reverse().find((row) => row.gmail_message_id);
  return {
    threadId: threaded?.gmail_thread_id ?? null,
    replyToMessageId: replyTo?.gmail_message_id ?? null,
    subject: lastMail?.subject ?? null,
  };
}

export function formatMailbox(name: string | null | undefined, email: string) {
  const trimmed = name?.trim();
  const clean = email.replace(/[\r\n]/g, "").trim();
  if (!trimmed) return clean;
  const safe = trimmed.replace(/"/g, '\\"');
  return `"${safe}" <${clean}>`;
}

export function mailboxList(emails: string[], namedEmail?: string | null, named?: string | null) {
  const namedKey = namedEmail?.trim().toLowerCase() ?? "";
  return emails
    .map((email) => {
      const clean = email.replace(/[\r\n]/g, "").trim();
      if (namedKey && clean.toLowerCase() === namedKey) return formatMailbox(named, clean);
      return clean;
    })
    .filter(Boolean)
    .join(", ");
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
      if (/\/proposal\//i.test(href) || /^pay\b/i.test(label)) {
        return `<a href="${href}" style="display:inline-block;margin:8px 0;padding:12px 22px;background:${LINK_PINK};color:#fff8f9;text-decoration:none;border-radius:999px;font-weight:600;">${label}</a>`;
      }
      return `<a href="${href}" style="color:${LINK_PINK};text-decoration:underline;">${label}</a>`;
    })
    .replaceAll("\n", "<br>");
}

function base64Body(value: string) {
  return (
    Buffer.from(value.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

function attachmentFilename(name: string) {
  const clean = name.replace(/[\r\n"\\]/g, "").trim() || "attachment";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

function attachmentPart(file: MailAttachment) {
  const type = file.type.replace(/[\r\n]/g, "").trim() || "application/octet-stream";
  const data =
    Buffer.from(file.data)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  return [
    `Content-Type: ${type}; name="${file.name.replace(/[\r\n"\\]/g, "").replace(/[^\x20-\x7e]/g, "_")}"`,
    `Content-Disposition: attachment; ${attachmentFilename(file.name)}`,
    "Content-Transfer-Encoding: base64",
    "",
    data,
  ].join("\r\n");
}

export function buildRfc822(input: Rfc822Input) {
  const date = (input.date ?? new Date()).toUTCString().replace(/UTC$/i, "GMT");
  const boundary = "saysukii-letter";
  const mixed = "saysukii-mail";
  const files = input.attachments ?? [];
  const recipients = input.tos?.length ? input.tos : [input.to];
  const copies = (input.cc ?? [])
    .map((email) => email.replace(/[\r\n]/g, "").trim())
    .filter(Boolean);
  const headers = [
    `From: ${formatMailbox(input.fromName, input.from)}`,
    `To: ${mailboxList(recipients, input.to, input.toName)}`,
    ...(copies.length ? [`Cc: ${copies.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${date}`,
    "MIME-Version: 1.0",
    files.length
      ? `Content-Type: multipart/mixed; boundary="${mixed}"`
      : `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${bracketMessageId(input.inReplyTo)}`);
  const references = input.references || input.inReplyTo;
  if (references) headers.push(`References: ${bracketMessageId(references)}`);
  const plain = base64Body(markdownToPlain(input.body));
  const html = base64Body(
    `<!DOCTYPE html><html><body style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#24221F;">${markdownToHtml(input.body)}</body></html>`,
  );
  const letter = [
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
  ];
  if (!files.length) return [headers.join("\r\n"), "", ...letter, ""].join("\r\n");
  return [
    headers.join("\r\n"),
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    ...letter,
    ...files.flatMap((file) => [`--${mixed}`, attachmentPart(file)]),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

export function encodeGmailRaw(rfc822: string) {
  return Buffer.from(rfc822, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function headerFromList(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
) {
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
  const rfc822 = buildRfc822(input);
  // a letter with files goes through gmail's upload endpoint, which takes up to 35mb instead of a few
  const response = input.attachments?.length
    ? await fetchImpl(
        "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "content-type": 'multipart/related; boundary="saysukii-upload"',
          },
          body: [
            "--saysukii-upload",
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify(input.threadId ? { threadId: input.threadId } : {}),
            "--saysukii-upload",
            "Content-Type: message/rfc822",
            "",
            rfc822,
            "--saysukii-upload--",
            "",
          ].join("\r\n"),
        },
      )
    : await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          raw: encodeGmailRaw(rfc822),
          ...(input.threadId ? { threadId: input.threadId } : {}),
        }),
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
