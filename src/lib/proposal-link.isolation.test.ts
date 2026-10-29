import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { freeProposalSlug, proposalCards, proposalSlug } from "./proposal-link";

describe("proposal links by the client's name", () => {
  it("writes the name the way it reads", () => {
    assert.equal(proposalSlug("Maya Chen"), "maya-chen");
    assert.equal(proposalSlug("  José & Ana  "), "jose-ana");
    assert.equal(proposalSlug("Fenty Beauty"), "fenty-beauty");
    assert.equal(proposalSlug("!!"), "client");
  });

  it("numbers a name that's taken, and never takes a studio page", () => {
    const taken = new Set(["maya-chen", "maya-chen-2"]);
    assert.equal(
      freeProposalSlug("Maya Chen", (slug) => taken.has(slug)),
      "maya-chen-3",
    );
    assert.equal(
      freeProposalSlug("Book", () => false),
      "book-2",
    );
    assert.equal(
      freeProposalSlug("Schedule", () => false),
      "schedule-2",
    );
  });

  it("finds name links and older token links in a letter, and leaves other links alone", () => {
    const { text, cards } = proposalCards(
      "hi love,\n\n[your proposal](https://inside.saysukii.com/maya-chen)\n\n" +
        "[older](https://inside.saysukii.com/proposal/abc_123#maya)\n\n" +
        "[book a call](https://inside.saysukii.com/book)\n\n" +
        "[saysukii.com](https://www.saysukii.com)\n\n" +
        "[someone else](https://example.com/maya-chen)",
    );
    assert.deepEqual(
      cards.map((card) => card.key),
      ["maya-chen", "abc_123"],
    );
    assert.match(text, /book a call/);
    assert.match(text, /saysukii\.com\]/);
    assert.match(text, /example\.com/);
  });
});
