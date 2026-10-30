import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillTemplate, mergeEmailTemplates, subjectStart } from "./email-templates";

describe("the studio's email templates", () => {
  it("fills in what it knows and leaves the rest as written", () => {
    assert.equal(
      fillTemplate("hi {name}, {{job.title}} · {invoice} · {due}", {
        name: "Amelia",
        job: "your wedding",
        invoice: "SS103",
      }),
      "hi Amelia, your wedding · SS103 · {due}",
    );
  });

  it("keeps the studio's saved words over the app's own", () => {
    const templates = mergeEmailTemplates([
      { id: "booked", subject: "", headline: "it's official", body: "yay, {name}!" },
      { id: "connect", subject: "hello", headline: "ignored", body: "" },
      { id: "retired", subject: "x", headline: "", body: "y" },
    ]);
    const booked = templates.find((item) => item.id === "booked")!;
    assert.equal(booked.saved, true);
    assert.equal(booked.headline, "it's official");
    assert.equal(booked.body, "yay, {name}!");
    assert.equal(booked.subject, "your project is booked · receipt for {invoice}");
    // an empty letter isn't kept, and a letter no longer in the app is dropped
    assert.equal(templates.find((item) => item.id === "connect")!.saved, undefined);
    assert.equal(templates.length, 10);
  });

  it("knows a subject's fixed start", () => {
    assert.equal(subjectStart("thank you · receipt for {invoice}"), "thank you · receipt for");
  });
});
