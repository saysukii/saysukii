import { type ReactNode } from "react";

import { PersonName } from "@/components/studio/PersonName";
import { clientReplyText, mailPieces } from "@/lib/os/mail-reply";
import type { InquiryMessageRow } from "@/integrations/supabase/types";
import { proposalOrigin } from "@/lib/proposal-link";
import { formatDateNumeric } from "@/lib/money";
import { initials } from "@/lib/os/inquiry-desk";

export const PROPOSAL_THREAD = "your floral proposal";

export function previewLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

export function formatSendAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const MAIL_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function normalizeHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  return /^https?:\/\//i.test(href) ? href : `https://${href}`;
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function draftToHtml(value: string) {
  return escapeHtml(value)
    .replace(
      new RegExp(MAIL_LINK.source, "g"),
      (_match, label: string, href: string) => `<a href="${href}">${label}</a>`,
    )
    .replace(/\n/g, "<br>");
}

export function htmlToDraft(root: HTMLElement) {
  let out = "";
  const walk = (node: Node, leadingBreak: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node instanceof HTMLAnchorElement) {
      const label = node.textContent ?? "";
      const href = node.getAttribute("href") ?? "";
      out += href ? `[${label}](${href})` : label;
      return;
    }
    const block = node.tagName === "DIV" || node.tagName === "P";
    if (block && leadingBreak && out && !out.endsWith("\n")) out += "\n";
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    node.childNodes.forEach((child, index) => walk(child, block && index === 0 ? false : true));
  };
  root.childNodes.forEach((child, index) => walk(child, index > 0));
  return out.replace(/\n$/, "");
}

export function splitMail(body: string) {
  const match = body.match(/\n*Attached:\s*([^\n]+)\s*$/);
  if (!match || match.index == null) return { text: body, files: [] as string[] };
  const files = (match[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return { text: body.slice(0, match.index).trimEnd(), files };
}

export const PORTAL_FILES: Record<string, string> = {
  "ceremony-layout.pdf": "/attachments/ceremony-layout.pdf",
  "reference-photos.zip": "/attachments/reference-photos.zip",
};

export function personBits(text: string, personName?: string | null) {
  const first = personName?.trim().split(/\s+/)[0];
  if (!first) return text;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bits = text.split(new RegExp(`(\\b${escaped}\\b)`, "ig"));
  if (bits.length === 1) return text;
  return bits.map((bit, index) =>
    bit.toLowerCase() === first.toLowerCase() ? <PersonName key={index} name={bit} /> : bit,
  );
}

export function mailParagraphs(body: string) {
  const text = body.replace(/\r\n/g, "\n");
  const spaced = text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);
  if (spaced.length > 1) return spaced;
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : text.trim() ? [text.trim()] : [];
}

export function mailInline(body: string, personName: string | null | undefined, seed: number) {
  const parts: ReactNode[] = [];
  const pattern = new RegExp(MAIL_LINK.source, "g");
  let last = 0;
  let key = seed * 100;
  const pushText = (text: string) => {
    const lines = text.split("\n");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) parts.push(<br key={key++} />);
      for (const piece of mailPieces(line)) {
        const inner = personBits(piece.text, personName);
        if (piece.kind === "strong") parts.push(<strong key={key}>{inner}</strong>);
        else if (piece.kind === "em") parts.push(<em key={key}>{inner}</em>);
        else if (piece.text) parts.push(<span key={key}>{inner}</span>);
        key += 1;
      }
    });
  };
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) pushText(body.slice(last, index));
    parts.push(
      <a key={key} href={match[2]} target="_blank" rel="noreferrer">
        {match[1]}
      </a>,
    );
    key += 1;
    last = index + match[0].length;
  }
  if (last < body.length) pushText(body.slice(last));
  return parts;
}

export function withoutSignoff(text: string) {
  return text.replace(/\n*say sukii\s*$/i, "").trimEnd();
}

export function latestMailThread(
  messages: Array<{ subject: string | null; sent_at: string | null; created_at: string | null }>,
) {
  let key = "";
  let at = "";
  for (const item of messages) {
    const stamp = item.sent_at || item.created_at || "";
    if (stamp >= at) {
      at = stamp;
      key = threadBase(item.subject).toLowerCase();
    }
  }
  return key || null;
}

export function threadBase(subject: string | null | undefined) {
  const base = (subject || "").replace(/^(re:\s*)+/gi, "").trim();
  if (!base || /^new inquiry$/i.test(base)) return "conversation";
  return base;
}

export function hiddenSubject(subject: string | null | undefined) {
  const bare = (subject || "").replace(/^(re:\s*)+/gi, "").trim();
  return !bare || /^new inquiry$/i.test(bare);
}

export function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || "there";
}

export function problemText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

export function copyText(value: string) {
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.width = "2em";
  area.style.height = "2em";
  area.style.padding = "0";
  area.style.border = "0";
  area.style.outline = "none";
  area.style.boxShadow = "none";
  area.style.background = "transparent";
  area.style.fontSize = "16px";
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

export async function writeClipboard(value: string) {
  const modern = navigator.clipboard.writeText(value).then(
    () => true,
    () => false,
  );
  if (copyText(value)) return true;
  return modern;
}

export function heldLine(facts: {
  eventDate?: string | null;
  dateTbd?: boolean | null;
  place?: string | null;
}) {
  const when = facts.dateTbd ? null : formatDateNumeric(facts.eventDate);
  const place = facts.place?.split(",")[0]?.trim();
  const held = [when, place].filter(Boolean).join(" at ");
  return held ? `i'll hold ${held}` : "i'll hold the date";
}

export function studioReply(
  clientName: string | null | undefined,
  facts: { eventDate?: string | null; dateTbd?: boolean | null; place?: string | null },
  messages: InquiryMessageRow[],
) {
  const latest = messages.find((item) => item.direction === "inbound");
  const heard = latest?.body?.replace(/\s+/g, " ").trim();
  const note = heard
    ? `i have your note — ${heard.length > 220 ? `${heard.slice(0, 217)}…` : heard}`
    : "thank you for writing.";
  return `${firstName(clientName)} —\n\n${note}\n\n${heldLine(facts)} and send a first look this week.`;
}

export function mailStamp(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `today at ${time}`;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  return `${day} at ${time}`;
}

export function noteTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase(),
    time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase(),
  };
}

export function mailDayChanged(
  current: string | null | undefined,
  previous: string | null | undefined,
) {
  if (!current) return false;
  if (!previous) return true;
  const next = new Date(current);
  const prev = new Date(previous);
  if (Number.isNaN(next.getTime()) || Number.isNaN(prev.getTime())) return false;
  return next.toDateString() !== prev.toDateString();
}

export function mailDay(value: string | null | undefined) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) return "today";
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toLowerCase();
}

export function mailTime(value: string | null | undefined) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

export function mailParty(message: InquiryMessageRow, clientName: string | null | undefined) {
  const note = message.direction === "note" || message.channel === "note";
  const outbound = message.direction === "outbound";
  // a teammate's own gmail reply on the thread, as opposed to a letter sent from here
  const relayed = outbound && message.status === "received";
  const name = note
    ? message.author?.trim() || "studio"
    : message.author?.trim() || (outbound ? "you" : clientName || "client");
  return {
    id: message.id,
    name,
    at: message.sent_at || message.created_at,
    note,
    outbound,
    relayed,
    mark: initials(name),
    subject: message.subject?.trim() || "",
    formArrival:
      message.channel === "form" ||
      (message.direction === "inbound" && /^new inquiry$/i.test(message.subject?.trim() ?? "")),
    ...(() => {
      const split = splitMail(message.body);
      const inbound = (message.direction === "inbound" && message.channel !== "form") || relayed;
      return { ...split, text: inbound ? clientReplyText(split.text) : split.text };
    })(),
    waiting: message.status === "queued",
    failed: message.status === "failed",
  };
}

/** Opens a proposal from a letter on the studio's address (or this machine while developing). */
export function proposalOpenHref(href: string) {
  if (typeof window === "undefined") return href;
  try {
    return `${proposalOrigin()}${new URL(href).pathname}`;
  } catch {
    return href;
  }
}

export const INVOICE_STATUS: Record<string, string> = {
  sent: "waiting on payment",
  deposit_paid: "deposit paid",
  paid: "paid",
  canceled: "canceled",
};
