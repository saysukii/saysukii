import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formLine, inquiryAnswers, shareNote } from "@/lib/os/inquiry-desk";

describe("inquiry form answers", () => {
  it("keeps a subscription note separate from space and cadence", () => {
    const message = [
      "Space: home",
      "Cadence: weekly",
      "thank you for being amazing <3",
      "date: 2026-10-30",
      "space: home",
      "cadence: weekly",
    ].join("\n");
    assert.equal(shareNote(message), "thank you for being amazing <3");
    assert.equal(formLine(message, "space"), "home");
    assert.equal(formLine(message, "cadence"), "weekly");
    const answers = inquiryAnswers({
      event_type: "subscription",
      message,
      eventWhen: "10/30/26",
      source: "instagram",
    });
    assert.deepEqual(
      answers.map((answer) => answer.label),
      ["interest", "space", "start", "cadence", "heard from", "anything else"],
    );
    assert.equal(
      answers.find((answer) => answer.label === "anything else")?.value,
      "thank you for being amazing <3",
    );
    assert.equal(
      answers.some((answer) => answer.label === "vision"),
      false,
    );
    assert.equal(answers[0]?.value, "concierge + subscriptions");
  });

  it("still calls a wedding note the vision", () => {
    const answers = inquiryAnswers({
      event_type: "wedding",
      message: "garden roses and a long table",
      venue_text: "Vizcaya",
      budget_range: "$10,000",
      eventWhen: "03/14/27",
    });
    assert.equal(
      answers.find((answer) => answer.label === "vision")?.value,
      "garden roses and a long table",
    );
    assert.equal(
      answers.some((answer) => answer.label === "anything else"),
      false,
    );
  });
});
