import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { invoiceBookingLine, invoiceDateLabel } from "./floral-agreement";

describe("the invoice's booking line", () => {
  it("names the service and date, and points to the approved proposal", () => {
    assert.equal(
      invoiceBookingLine("floral subscription", invoiceDateLabel("2026-10-30")),
      "Booking for floral subscription service on 10/30/26 per approved proposal.",
    );
    assert.equal(
      invoiceBookingLine("Wedding", invoiceDateLabel("March 14, 2027 · 6:00 pm")),
      "Booking for wedding floral service on 03/14/27 per approved proposal.",
    );
    assert.equal(
      invoiceBookingLine("brand activation", ""),
      "Booking for event floral service per approved proposal.",
    );
  });

  it("leaves the proposal out of an invoice that isn't part of one", () => {
    assert.equal(
      invoiceBookingLine("brand activation", invoiceDateLabel("2027-03-12"), false),
      "Booking for event floral service on 03/12/27.",
    );
  });
});
