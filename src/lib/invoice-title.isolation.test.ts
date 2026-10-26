import assert from "node:assert/strict";
import test from "node:test";

import { invoiceTitle } from "./invoice-title.ts";

test("invoice titles match Square's SS count", () => {
  assert.equal(invoiceTitle("INV-101"), "SS101");
  assert.equal(invoiceTitle("SS7"), "SS007");
  assert.equal(invoiceTitle("SS101"), "SS101");
});
