import { buildAgreementContent } from "@/lib/agreement-templates";
import type { StatementOfWork } from "@/lib/floral-agreement";
import { proposalSlug } from "@/lib/proposal-link";

export type PreviewProposal = {
  token: string;
  inquiryId: string;
  clientName: string;
  contactName?: string | null;
  number: string;
  eventDate: string | null;
  venueText: string | null;
  eventLabel: string;
  totalCents: number;
  depositPercent: number;
  depositCents: number;
  work?: StatementOfWork;
  pdfDataUrl: string;
  fileName?: string;
  pageUrls?: string[];
  status: "draft" | "sent" | "viewed" | "accepted";
  agreement: string | null;
  signedName: string | null;
  signedAt: string | null;
  paymentLink: string | null;
  paid: boolean;
  changeNote: string | null;
  viewedAt?: string | null;
  courtesyCents?: number;
  courtesyNote?: string | null;
  sentAt?: string | null;
};

type ChangeNote = {
  id: string;
  inquiryId: string;
  author: string;
  body: string;
  sentAt: string;
};

const PROPOSALS_KEY = "say-sukii-preview-proposals";
const NOTES_KEY = "say-sukii-preview-change-notes";

function readMap(): Record<string, PreviewProposal> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(PROPOSALS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PreviewProposal>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, PreviewProposal>) {
  sessionStorage.setItem(PROPOSALS_KEY, JSON.stringify(map));
}

function readNotes(): ChangeNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(NOTES_KEY);
    return raw ? (JSON.parse(raw) as ChangeNote[]) : [];
  } catch {
    return [];
  }
}

export function previewProposalForInquiry(inquiryId: string) {
  return Object.values(readMap()).find((item) => item.inquiryId === inquiryId) ?? null;
}

/** A preview link carries the client's name, like the real ones; this finds the proposal it means. */
export function previewTokenFor(key: string) {
  if (key.startsWith("preview_")) return key;
  const found = Object.values(readMap()).find((item) => proposalSlug(item.clientName) === key);
  if (found) return found.token;
  return key === proposalSlug(fentyDemo().clientName) ? FENTY_DEMO : null;
}

export function readPreviewProposal(token: string) {
  return readMap()[token] ?? null;
}

export function clearPreviewProposal(inquiryId: string) {
  const map = readMap();
  for (const [token, item] of Object.entries(map)) {
    if (item.inquiryId === inquiryId && item.status !== "accepted") delete map[token];
  }
  writeMap(map);
}

export function savePreviewProposal(input: {
  inquiryId: string;
  clientName: string;
  contactName?: string | null;
  eventDate: string | null;
  venueText: string | null;
  eventLabel: string;
  totalCents: number;
  depositPercent: number;
  courtesyCents?: number;
  pdfDataUrl: string;
  fileName?: string;
  work?: StatementOfWork;
}) {
  const map = readMap();
  const existing = Object.values(map).find((item) => item.inquiryId === input.inquiryId);
  if (existing?.status === "accepted") throw new Error("This proposal is already accepted.");
  const token = existing?.token ?? `preview_${crypto.randomUUID().replace(/-/g, "")}`;
  const depositCents = Math.round(input.totalCents * (input.depositPercent / 100));
  const fileName = input.fileName || existing?.fileName;
  const work = input.work ?? existing?.work;
  const next: PreviewProposal = {
    token,
    inquiryId: input.inquiryId,
    clientName: input.clientName,
    contactName: input.contactName ?? input.clientName,
    number: existing?.number ?? `SS-preview`,
    eventDate: input.eventDate,
    venueText: input.venueText,
    eventLabel: input.eventLabel,
    totalCents: input.totalCents,
    courtesyCents: input.courtesyCents ?? existing?.courtesyCents ?? 0,
    depositPercent: input.depositPercent,
    depositCents,
    pdfDataUrl: input.pdfDataUrl,
    ...(fileName ? { fileName } : {}),
    ...(work ? { work } : {}),
    status: existing && existing.status !== "draft" ? existing.status : "draft",
    agreement: null,
    signedName: null,
    signedAt: null,
    paymentLink: null,
    paid: false,
    changeNote: existing?.changeNote ?? null,
    sentAt: existing?.sentAt ?? null,
  };
  map[token] = next;
  writeMap(map);
  return next;
}

export function updatePreviewProposalTerms(
  token: string,
  totalCents: number,
  depositPercent: number,
  work?: StatementOfWork,
  courtesyCents = 0,
) {
  const map = readMap();
  const current = map[token];
  if (!current || current.status === "accepted") return current ?? null;
  current.totalCents = totalCents;
  current.courtesyCents = courtesyCents;
  current.depositPercent = depositPercent;
  current.depositCents = Math.round(totalCents * (depositPercent / 100));
  if (work) current.work = work;
  map[token] = current;
  writeMap(map);
  return current;
}

export function markPreviewProposalSent(token: string) {
  const map = readMap();
  const current = map[token];
  if (!current || current.status !== "draft") return current ?? null;
  current.status = "sent";
  current.sentAt = current.sentAt ?? new Date().toISOString();
  map[token] = current;
  writeMap(map);
  return current;
}

const FENTY_DEMO = "preview_fentybeauty091726";
const FENTY_FRESH = "courtesy-250";

function fentyDemo(): PreviewProposal {
  return {
    token: FENTY_DEMO,
    inquiryId: "fenty-beauty",
    clientName: "Fenty Beauty",
    contactName: null,
    number: "SS-0917",
    eventDate: "2026-09-17",
    venueText: "The Shelbourne by Proper, 1801 Collins Ave, Miami Beach",
    eventLabel: "private dinner",
    totalCents: 400250,
    courtesyCents: 25000,
    depositPercent: 100,
    depositCents: 400250,
    pdfDataUrl: "/attachments/fenty-beauty-proposal.pdf",
    pageUrls: [1, 2, 3, 4, 5, 6].map((page) => `/attachments/fenty-pages/page-0${page}.png?v=2`),
    status: "sent",
    agreement: null,
    signedName: null,
    signedAt: null,
    paymentLink: null,
    paid: false,
    changeNote: null,
  };
}

export function openPreviewProposal(token: string) {
  const map = readMap();
  if (
    typeof window !== "undefined" &&
    token === FENTY_DEMO &&
    sessionStorage.getItem("say-sukii-fenty-fresh") !== FENTY_FRESH
  ) {
    delete map[token];
    sessionStorage.setItem("say-sukii-fenty-fresh", FENTY_FRESH);
  }
  const current = map[token] ?? (token === FENTY_DEMO ? fentyDemo() : null);
  if (!current) return null;
  if (token === FENTY_DEMO) current.pageUrls = fentyDemo().pageUrls ?? [];
  current.viewedAt = new Date().toISOString();
  if (current.status === "sent") current.status = "viewed";
  map[token] = current;
  writeMap(map);
  return current;
}

export function requestPreviewChanges(token: string, note: string) {
  const map = readMap();
  const current = map[token];
  if (!current) throw new Error("This proposal is unavailable.");
  if (current.status !== "sent" && current.status !== "viewed") {
    throw new Error("This proposal can no longer be changed from here.");
  }
  current.changeNote = note;
  map[token] = current;
  writeMap(map);
  return current;
}

export function previewChangeMessages(inquiryId: string) {
  return readNotes()
    .filter((item) => item.inquiryId === inquiryId)
    .map((item) => ({
      id: item.id,
      inquiry_id: item.inquiryId,
      direction: "inbound" as const,
      channel: "email" as const,
      subject: "changes on the proposal",
      body: item.body,
      from_address: null,
      to_address: null,
      gmail_message_id: null,
      gmail_thread_id: null,
      author: item.author,
      sent_at: item.sentAt,
      status: "received" as const,
      created_by: null,
      created_at: item.sentAt,
    }));
}

export function acceptPreviewProposal(token: string) {
  const map = readMap();
  const current = map[token];
  if (!current) throw new Error("This proposal is unavailable.");
  if (current.status === "accepted" && current.agreement) return current;
  if (current.status !== "sent" && current.status !== "viewed") {
    throw new Error("This proposal can no longer be accepted.");
  }
  current.status = "accepted";
  current.agreement = buildAgreementContent("standard", {
    clientName: current.clientName,
    contactName: null,
    projectTitle: current.eventLabel,
    eventDate: current.eventDate,
    venue: current.venueText,
    totalCents: current.totalCents,
    depositCents: current.depositCents,
    proposalNumber: current.number,
    statement: current.work,
  });
  map[token] = current;
  writeMap(map);
  return current;
}

export function signPreviewProposal(token: string, name: string) {
  const map = readMap();
  const current = map[token];
  if (!current?.agreement) throw new Error("Accept the proposal before signing.");
  const signedAt = new Date().toISOString();
  current.signedName = name;
  current.signedAt = signedAt;
  current.paymentLink = null;
  map[token] = current;
  writeMap(map);
  return current;
}

export function payPreviewProposal(token: string) {
  const map = readMap();
  const current = map[token];
  if (!current?.signedName) throw new Error("Sign the agreement before paying.");
  current.paid = true;
  map[token] = current;
  writeMap(map);
  return current;
}
