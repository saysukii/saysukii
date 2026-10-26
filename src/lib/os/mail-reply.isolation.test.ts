import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientReplyText } from "./mail-reply";

describe("client reply text", () => {
  it("keeps their note and drops the letter they were answering", () => {
    const body = [
      "thank you!",
      "",
      "Warmly,",
      "",
      "*Tai* ✦",
      "*Designer + Systems Architect*",
      "--",
      "",
      "On Mon, Oct 26, 2026 at 4:09 PM Say Sukii <info@saysukii.com> wrote:",
      "",
      "> Hi tai,",
      "> Thanks again for reaching out!",
    ].join("\n");
    assert.equal(
      clientReplyText(body),
      ["thank you!", "", "Warmly,", "", "*Tai* ✦", "*Designer + Systems Architect*"].join("\n"),
    );
  });
});
