import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOARD_COLUMNS, BOARD_REVIEW, confidenceLabel, deskGroup, deskLane, sourceExcerpt } from "./inquiry-desk";
import { approvedCandidatePatch, isBookInquiry, isReviewCandidate } from "./inquiry-detection";

describe("inquiry review lane", () => {
  it("keeps candidates out of waiting and off the book until approved", () => {
    const candidate = {
      status: "new" as const,
      detection_status: "candidate" as const,
    };
    assert.equal(deskLane(candidate), "review");
    assert.equal(deskGroup(candidate.status), "waiting");
    assert.equal(isReviewCandidate(candidate), true);
    assert.equal(isBookInquiry(candidate), false);

    const approved = { ...candidate, ...approvedCandidatePatch() };
    assert.equal(approved.status, "new");
    assert.equal(approved.detection_status, "confirmed");
    assert.equal(deskLane(approved), "waiting");
    assert.equal(isBookInquiry(approved), true);
    assert.equal(isReviewCandidate(approved), false);
  });

  it("formats confidence and a one-line source peek", () => {
    assert.equal(confidenceLabel(0.86), "86%");
    assert.equal(confidenceLabel(null), null);
    assert.match(
      sourceExcerpt("wedding flowers at PAMM", "Hi Say Sukii — we're getting married at PAMM on March 14."),
      /wedding flowers at PAMM — Hi Say Sukii/,
    );
  });

  it("does not treat dismissed detections as book or review", () => {
    const dismissed = { status: "new" as const, detection_status: "dismissed" as const };
    assert.equal(isBookInquiry(dismissed), false);
    assert.equal(isReviewCandidate(dismissed), false);
  });

  it("keeps candidates only in needs review, off the board columns", () => {
    const candidate = { status: "new" as const, detection_status: "candidate" as const };
    const fresh = { status: "new" as const, detection_status: "na" as const };
    assert.equal(BOARD_REVIEW.match(candidate), true);
    assert.equal(BOARD_COLUMNS.some((column) => column.match(candidate)), false);
    assert.equal(BOARD_COLUMNS.find((column) => column.match(fresh))?.id, "new");
  });

  it("collapses replied and talking into in touch, and closed into archived", () => {
    assert.equal(BOARD_COLUMNS.find((column) => column.match({ status: "contacted", detection_status: "na" }))?.id, "touch");
    assert.equal(BOARD_COLUMNS.find((column) => column.match({ status: "in_conversation", detection_status: "na" }))?.id, "touch");
    assert.equal(BOARD_COLUMNS.find((column) => column.match({ status: "proposal_sent", detection_status: "na" }))?.label, "proposal sent");
    assert.equal(BOARD_COLUMNS.find((column) => column.match({ status: "closed", detection_status: "na" }))?.id, "archived");
  });
});
