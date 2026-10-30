import assert from "node:assert/strict";
import test, { describe, it } from "node:test";

import { invoiceTitle, squareInvoiceNumber } from "./invoice-title.ts";

test("invoice titles match Square's SS count", () => {
  assert.equal(invoiceTitle("INV-101"), "SS101");
  assert.equal(invoiceTitle("SS7"), "SS007");
  assert.equal(invoiceTitle("SS101"), "SS101");
});

describe("invoice numbers in square", () => {
  it("writes the studio's number the way square does", () => {
    assert.equal(squareInvoiceNumber("SS751"), "SS-751");
    assert.equal(squareInvoiceNumber("SS-750"), "SS-750");
    assert.equal(invoiceTitle("SS-750"), "SS750");
  });
});
