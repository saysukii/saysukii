import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convenienceFee, paymentFee, splitCharge, withFee } from "./convenience-fee";

describe("the 4% convenience fee", () => {
  it("adds 4% to the whole, and each half of a deposit carries half", () => {
    assert.equal(convenienceFee(461_000), 18_440);
    assert.equal(withFee(230_500, 0), 239_720);
    assert.equal(withFee(230_500, 230_500), 239_720);
    // an odd total still comes to exactly 4% across both payments
    assert.equal(paymentFee(500, 0) + paymentFee(501, 500), convenienceFee(1001));
  });

  it("takes a charge apart again", () => {
    assert.deepEqual(splitCharge(239_720, 0), { baseCents: 230_500, feeCents: 9_220 });
    assert.deepEqual(splitCharge(520, 0), { baseCents: 500, feeCents: 20 });
  });
});
