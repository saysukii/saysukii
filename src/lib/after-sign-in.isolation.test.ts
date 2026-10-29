import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { afterSignIn } from "./after-sign-in";

describe("where sign-in lands", () => {
  it("carries on to the studio page that was asked for", () => {
    assert.equal(afterSignIn("/pipeline/0d6c1c2e"), "/pipeline/0d6c1c2e");
    assert.equal(afterSignIn("/calendar?week=2"), "/calendar?week=2");
  });

  it("never leaves the studio, and falls back to today", () => {
    assert.equal(afterSignIn("https://elsewhere.com"), "/dashboard");
    assert.equal(afterSignIn("//elsewhere.com"), "/dashboard");
    assert.equal(afterSignIn("/auth"), "/dashboard");
    assert.equal(afterSignIn(undefined), "/dashboard");
  });
});
