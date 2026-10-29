import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { isReviewCandidate } from "@/lib/os/inquiry-detection";
import { refreshInquirySummarySafe } from "@/lib/os/inquiry-summary.server";
import { signatureText } from "@/lib/os/mail-signature";
import { syncInquiryAutoTaskFor } from "@/lib/os/tasks.functions";
import { proposalCards } from "@/lib/proposal-link";

type StudioClient = SupabaseClient<Database>;

export type LetterFile = { path: string; name: string };

/** Everything a letter needs to go out, now or later. */
export type LetterRequest = {
  inquiryId: string;
  body: string;
  subject: string;
  fresh: boolean;
  threadId: string | null;
  to: string[];
  cc: string[];
  attachments: LetterFile[];
  sender: string;
  createdBy: string | null;
};

async function letterRecipients(client: StudioClient, request: LetterRequest) {
  const inquiry = await client
    .from("inquiries")
    .select("id, status, client_id, detection_status")
    .eq("id", request.inquiryId)
    .eq("archived", false)
    .single();
  if (inquiry.error) throw new Error(inquiry.error.message);
  const person = await client
    .from("clients")
    .select("email, name")
    .eq("id", inquiry.data.client_id)
    .single();
  if (person.error) throw new Error(person.error.message);

  const { mailRecord } = await import("@/lib/os/mail-people");
  const clientEmail = person.data.email?.trim() ?? "";
  const people = mailRecord([clientEmail, ...request.to], request.cc);
  if (!people.to.length) throw new Error("This client needs an email address before you can send.");
  return {
    inquiry: inquiry.data,
    clientEmail,
    clientName: person.data.name,
    people,
    toLine:
      people.cc.length || people.to.length > 1 ? people.line : clientEmail || (people.to[0] ?? ""),
  };
}

/** Holds a letter to send at a set time. The cron picks it up once the time comes. */
export async function scheduleLetter(client: StudioClient, request: LetterRequest, sendAt: Date) {
  if (request.fresh && !request.subject.trim())
    throw new Error("Add a subject for the new conversation.");
  const { toLine } = await letterRecipients(client, request);
  const { error } = await client.from("inquiry_messages").insert({
    inquiry_id: request.inquiryId,
    direction: "outbound",
    channel: "email",
    subject: request.subject.trim() || null,
    body: request.body,
    from_address: null,
    to_address: toLine,
    gmail_message_id: null,
    gmail_thread_id: null,
    author: request.sender,
    sent_at: sendAt.toISOString(),
    status: "queued",
    created_by: request.createdBy,
    send_payload: request as unknown as Json,
  });
  if (error) throw new Error(error.message);
}

/** Sends a letter through gmail. With `queuedId`, it completes that scheduled row instead of adding a new one. */
export async function deliverLetter(
  client: StudioClient,
  request: LetterRequest,
  queuedId?: string,
) {
  const { inquiry, clientEmail, clientName, people, toLine } = await letterRecipients(
    client,
    request,
  );
  const to = people.to[0] ?? "";
  const named = Boolean(clientEmail) && to.toLowerCase() === clientEmail.toLowerCase();

  const { getGmailPublicStatus, validGmailAccessToken } = await import("@/lib/os/gmail.server");
  const gmail = await getGmailPublicStatus();
  if (gmail.status !== "connected") throw new Error("Connect Gmail in settings to send.");

  const prior = await client
    .from("inquiry_messages")
    .select("gmail_thread_id, gmail_message_id, subject, sent_at, channel")
    .eq("inquiry_id", request.inquiryId)
    .order("sent_at", { ascending: true });
  if (prior.error) throw new Error(prior.error.message);

  const { fetchGmailReplyHeaders, replySubject, resolveReplyContext, sendInquiryEmail } =
    await import("@/lib/os/gmail-outbound.server");
  if (request.fresh && !request.subject.trim())
    throw new Error("Add a subject for the new conversation.");
  const rows = prior.data ?? [];
  const scoped = request.fresh
    ? []
    : request.threadId
      ? rows.filter((row) => row.gmail_thread_id === request.threadId)
      : rows;
  const reply = resolveReplyContext(scoped);
  const accessToken = await validGmailAccessToken();
  let inReplyTo: string | null = null;
  let references: string | null = null;
  if (!request.fresh && reply.replyToMessageId) {
    try {
      const headers = await fetchGmailReplyHeaders(reply.replyToMessageId, accessToken);
      inReplyTo = headers.messageId;
      references = headers.references || headers.messageId;
    } catch {
      inReplyTo = null;
    }
  }

  const from = gmail.account_email || process.env["GMAIL_INBOX"] || "info@saysukii.com";
  const subject = request.fresh
    ? request.subject.trim()
    : request.subject.trim() || replySubject(reply.subject);
  const attachments = await letterAttachments(client, request.inquiryId, request.attachments);
  // the thread keeps its "Attached:" line for the file chips; the letter itself carries the files
  const letterBody = attachments.length
    ? request.body.replace(/\n*Attached:\s*[^\n]+\s*$/, "").trim()
    : request.body.trim();
  const sent = await sendInquiryEmail({
    from,
    fromName: "Say Sukii",
    to,
    toName: named ? clientName : null,
    tos: people.to,
    cc: people.cc,
    subject,
    body: `${letterBody}\n\n${signatureText(request.sender)}`,
    attachments,
    threadId: request.fresh ? null : reply.threadId,
    inReplyTo,
    references,
    accessToken,
  });

  const row = {
    subject,
    from_address: from,
    to_address: toLine,
    gmail_message_id: sent.gmail_message_id,
    gmail_thread_id: sent.gmail_thread_id,
    sent_at: new Date().toISOString(),
    status: "sent" as const,
  };
  const { error } = queuedId
    ? await client
        .from("inquiry_messages")
        .update({ ...row, send_payload: null })
        .eq("id", queuedId)
    : await client.from("inquiry_messages").insert({
        ...row,
        inquiry_id: request.inquiryId,
        direction: "outbound",
        channel: "email",
        body: request.body,
        author: request.sender,
        created_by: request.createdBy,
      });
  if (error) throw new Error(error.message);

  const { markProposalsSentInLetter } = await import("@/lib/os/proposal-send.server");
  await markProposalsSentInLetter(request.inquiryId, request.body);
  if (
    inquiry.status === "new" &&
    !isReviewCandidate(inquiry) &&
    proposalCards(request.body).cards.length === 0
  ) {
    await client
      .from("inquiries")
      .update({ status: "contacted", contacted_at: new Date().toISOString() })
      .eq("id", request.inquiryId);
  }
  await syncInquiryAutoTaskFor(client, request.inquiryId);
  await refreshInquirySummarySafe(client, request.inquiryId);
}

/** Sends every scheduled letter whose time has come. Each one is claimed first so two runs never send it twice. */
export async function sendDueLetters(client: StudioClient, now = new Date()) {
  const due = await client
    .from("inquiry_messages")
    .select("id, send_payload")
    .eq("status", "queued")
    .lte("sent_at", now.toISOString())
    .order("sent_at", { ascending: true })
    .limit(20);
  if (due.error) throw new Error(due.error.message);

  const result = { sent: 0, failed: 0 };
  for (const letter of due.data ?? []) {
    // "draft" marks a letter mid-send; only one run can move it out of queued
    const claim = await client
      .from("inquiry_messages")
      .update({ status: "draft" })
      .eq("id", letter.id)
      .eq("status", "queued")
      .select("id");
    if (claim.error || !claim.data?.length) continue;
    try {
      await deliverLetter(client, letter.send_payload as unknown as LetterRequest, letter.id);
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        "[letters] a scheduled letter did not send:",
        error instanceof Error ? error.message : error,
      );
      await client.from("inquiry_messages").update({ status: "failed" }).eq("id", letter.id);
    }
  }
  return result;
}

async function letterAttachments(client: StudioClient, inquiryId: string, picked: LetterFile[]) {
  if (!picked.length) return [];
  const { MAX_ATTACHMENT_BYTES } = await import("@/lib/os/gmail-outbound.server");
  const files = [];
  let total = 0;
  for (const file of picked) {
    if (!file.path.startsWith(`inquiries/${inquiryId}/`))
      throw new Error("that file belongs to another lead.");
    const { data, error } = await client.storage.from("project-files").download(file.path);
    if (error || !data) throw new Error(`could not attach ${file.name}. try adding it again.`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        "the attachments are over 25mb together, which gmail won't send. share a link to the larger files instead.",
      );
    }
    files.push({ name: file.name, type: data.type || "application/octet-stream", data: bytes });
  }
  return files;
}
