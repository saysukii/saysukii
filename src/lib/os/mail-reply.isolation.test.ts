import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readMailLine, replyAllPeople } from "./mail-people";
import { clientReplyText, linkPlainMail, mailPieces } from "./mail-reply";

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

describe("reply all", () => {
  it("reads the to and cc line the studio stores", () => {
    assert.deepEqual(
      readMailLine("camila@example.com, ana@planner.example · cc: maya@saysukii.com"),
      {
        to: ["camila@example.com", "ana@planner.example"],
        cc: ["maya@saysukii.com"],
      },
    );
    assert.deepEqual(readMailLine("camila@example.com"), { to: ["camila@example.com"], cc: [] });
  });

  it("keeps everyone on the latest letter except the studio inbox and the client", () => {
    const people = replyAllPeople(
      [
        {
          direction: "outbound",
          from_address: "info@saysukii.com",
          to_address: "camila@example.com",
          status: "sent",
        },
        {
          direction: "inbound",
          from_address: "ana@planner.example",
          to_address:
            "info@saysukii.com, camila@example.com · cc: maya@saysukii.com, mom@example.com",
          status: "received",
        },
        { direction: "note", from_address: null, to_address: null },
      ],
      "camila@example.com",
    );
    assert.deepEqual(people, {
      to: ["ana@planner.example"],
      cc: ["maya@saysukii.com", "mom@example.com"],
    });
  });

  it("puts a teammate who wrote from gmail back on to", () => {
    const people = replyAllPeople(
      [
        {
          direction: "outbound",
          from_address: "maya@saysukii.com",
          to_address: "camila@example.com · cc: info@saysukii.com",
          status: "received",
        },
      ],
      "camila@example.com",
    );
    assert.deepEqual(people, { to: ["maya@saysukii.com"], cc: [] });
  });
  it("shows a gmail reaction without its link address", () => {
    assert.equal(
      clientReplyText(
        "💖\n\nTaī ✦ reacted via Gmail <https://www.google.com/gmail/about/?utm_source=gmail-in-product&utm_medium=et&utm_campaign=emojireactionemail#app>",
      ),
      "💖\n\nTaī ✦ reacted via Gmail",
    );
    assert.equal(
      clientReplyText("the gallery is here https://example.com/gallery"),
      "the gallery is here https://example.com/gallery",
    );
  });
});

describe("links in a plain-text letter", () => {
  it("links the words a plain-text letter wrote its link after", () => {
    const body = [
      "email: andrea@atwasi.com [andrea@atwasi.com]",
      "web: www.atwasi.com [http://www.atwasi.com]",
      "see the deck [https://example.com/deck]",
    ].join("\n");
    assert.equal(
      linkPlainMail(body),
      [
        "email: [andrea@atwasi.com](mailto:andrea@atwasi.com)",
        "web: [www.atwasi.com](http://www.atwasi.com)",
        "[see the deck](https://example.com/deck)",
      ].join("\n"),
    );
  });

  it("drops a signature picture's address and links bare ones", () => {
    assert.equal(
      linkPlainMail(
        "CEO\n[https://ci3.googleusercontent.com/mail-sig/AIorK4xMRLTWs]\nor write paul@greenmaru.com.",
      ),
      "CEO\n\nor write [paul@greenmaru.com](mailto:paul@greenmaru.com).",
    );
  });

  it("leaves a link already written the studio's way alone", () => {
    const body = "[your proposal](https://inside.saysukii.com/maya-chen) <3";
    assert.equal(linkPlainMail(body), body);
  });
});
