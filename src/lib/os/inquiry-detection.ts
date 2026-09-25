import type { DetectionStatus, InquiryOrigin, InquiryStatus } from "@/integrations/supabase/types";

/** Leads that belong in the book. Candidates and dismissed detections stay out. */
export const BOOK_DETECTION_STATUSES: DetectionStatus[] = ["na", "confirmed"];

/** Visible on the inquiries desk. Dismissed detections leave the board. */
export const DESK_DETECTION_STATUSES: DetectionStatus[] = ["na", "confirmed", "candidate"];

export function inquiryOriginFromCreator(createdBy: string | null): InquiryOrigin {
  return createdBy ? "manual" : "form";
}

export function isBookInquiry(inquiry: { detection_status: DetectionStatus }) {
  return BOOK_DETECTION_STATUSES.includes(inquiry.detection_status);
}

export function isReviewCandidate(inquiry: { detection_status: DetectionStatus }) {
  return inquiry.detection_status === "candidate";
}

export function approvedCandidatePatch() {
  return {
    detection_status: "confirmed" as const,
    status: "new" as InquiryStatus,
    closed_at: null,
    closed_reason: null,
  };
}
