import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatPhone, typePhone } from "./phone";

describe("phone numbers the studio's way", () => {
  it("writes a us number as 000.000.0000", () => {
    assert.equal(formatPhone("(305) 555-0176"), "305.555.0176");
    assert.equal(formatPhone("+1 305 555 0176"), "305.555.0176");
    assert.equal(formatPhone("3055550176"), "305.555.0176");
  });

  it("leaves anything else as it was written", () => {
    assert.equal(formatPhone("+44 20 7946 0958"), "+44 20 7946 0958");
    assert.equal(formatPhone("305-555-0176 ext 2"), "305-555-0176 ext 2");
    assert.equal(formatPhone(null), "");
  });

  it("formats while it's typed", () => {
    assert.equal(typePhone("305"), "305");
    assert.equal(typePhone("3055"), "305.5");
    assert.equal(typePhone("305.555.017"), "305.555.017");
    assert.equal(typePhone("(305) 555-0176"), "305.555.0176");
    assert.equal(typePhone("+44 20 7946"), "+44 20 7946");
  });
});
