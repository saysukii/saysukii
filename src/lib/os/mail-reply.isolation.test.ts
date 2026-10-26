import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientReplyText, mailPieces } from "./mail-reply";

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

  it("reads asterisks as the emphasis they wrote", () => {
    assert.deepEqual(mailPieces("thank you!\n\n*Tai* ✦\n*Designer + Systems Architect*"), [
      { kind: "text", text: "thank you!\n\n" },
      { kind: "em", text: "Tai" },
      { kind: "text", text: " ✦\n" },
      { kind: "em", text: "Designer + Systems Architect" },
    ]);
    assert.deepEqual(mailPieces("**bold** and *italic*"), [
      { kind: "strong", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "em", text: "italic" },
    ]);
  });
});
