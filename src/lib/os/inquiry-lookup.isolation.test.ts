import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inquiryProblem } from "./inquiry-lookup";

describe("inquiryProblem", () => {
  it("lets letters, notes and files through on an archived inquiry", () => {
    assert.equal(inquiryProblem({ archived: true }), null);
    assert.equal(inquiryProblem({ archived: false }), null);
  });

  it("says plainly when an archived inquiry has to be reopened first", () => {
    assert.equal(
      inquiryProblem({ archived: true }, "send an invoice"),
      "this inquiry is archived. reopen it to send an invoice.",
    );
    assert.equal(inquiryProblem({ archived: false }, "send an invoice"), null);
  });

  it("says when the inquiry is gone, rather than a database error", () => {
    assert.equal(inquiryProblem(null), "this inquiry is no longer here.");
    assert.equal(inquiryProblem(null, "send an invoice"), "this inquiry is no longer here.");
  });
});
