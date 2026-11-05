import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fileLinkOld, FILE_LINK_SECONDS } from "../app-file-link";
import { studioFileKey, studioFileSlug } from "./inquiry-holds";
import { attachedNames, storedFileFor } from "./letter-files";

function stored(name: string, created_at = "2026-11-01T10:00:00Z") {
  return { id: name, name, signed_url: `/file/project-files/${name}?token=t`, created_at };
}

function keyFor(name: string) {
  return studioFileKey("inquiries/abc", name).split("/").pop()!;
}

describe("attachedNames", () => {
  it("reads a plain list", () => {
    assert.deepEqual(attachedNames("ceremony-layout.pdf, reference-photos.zip"), [
      "ceremony-layout.pdf",
      "reference-photos.zip",
    ]);
  });

  it("keeps a comma inside a name", () => {
    assert.deepEqual(attachedNames("Smith, Jane contract.pdf, plan.pdf"), [
      "Smith, Jane contract.pdf",
      "plan.pdf",
    ]);
    assert.deepEqual(attachedNames("a, b, c.pdf"), ["a, b, c.pdf"]);
  });

  it("doesn't take a version number for an extension", () => {
    assert.deepEqual(attachedNames("Plan v1.2, final.pdf"), ["Plan v1.2, final.pdf"]);
  });

  it("leaves names with no extension apart at the end of the line", () => {
    assert.deepEqual(attachedNames("plan.pdf, notes, photos"), ["plan.pdf", "notes", "photos"]);
    assert.deepEqual(attachedNames("  "), []);
  });
});

describe("storedFileFor", () => {
  it("finds the stored file for the name the letter kept", () => {
    const file = stored("1793898269303-ceremony-layout.pdf");
    assert.equal(storedFileFor("Ceremony Layout.pdf", [file]), file);
  });

  it("matches every name the way the upload wrote it", () => {
    for (const name of [
      "Bride's moodboard (final).pdf",
      "Smith, Jane contract.PDF",
      "2026-01 layout.pdf",
      "été à la plage.jpg",
      "a very long name that goes on well past the forty characters storage keeps.pdf",
      "notes",
      "婚礼.pdf",
    ]) {
      const key = keyFor(name);
      assert.equal(storedFileFor(name, [stored(key)])?.name, key, name);
    }
  });

  it("still matches a long name stored while slugs could end in a dash", () => {
    const old = "1793898269303-a-long-name-that-breaks-right-at-the-40th-.pdf";
    const name = "a long name that breaks right at the 40th mark.pdf";
    assert.equal(studioFileSlug(name), "a-long-name-that-breaks-right-at-the-40t.pdf");
    assert.equal(
      storedFileFor("a long name that breaks right at the 40th-.pdf", [stored(old)])?.id,
      old,
    );
  });

  it("matches a picked name that already starts with a timestamp", () => {
    const name = "1793898269303-ceremony-layout.pdf";
    assert.equal(storedFileFor(name, [stored(keyFor(name))])?.name, keyFor(name));
  });

  it("matches a file stored under its plain name", () => {
    assert.equal(storedFileFor("contract.pdf", [stored("contract.pdf")])?.name, "contract.pdf");
  });

  it("doesn't match a different file", () => {
    assert.equal(
      storedFileFor("Ceremony Layout.pdf", [stored("1793898269303-floor-plan.pdf")]),
      null,
    );
    assert.equal(storedFileFor("layout.pdf", [stored("1793898269303-layout.png")]), null);
  });

  it("gives a removed or unsigned file no link", () => {
    const unsigned = { ...stored("1793898269303-plan.pdf"), signed_url: null };
    assert.equal(storedFileFor("plan.pdf", [unsigned]), null);
    assert.equal(storedFileFor("plan.pdf", []), null);
  });

  it("gives each letter the copy added just before it", () => {
    const first = stored("1000000000000-plan.pdf", "2026-11-01T10:00:00Z");
    const second = stored("2000000000000-plan.pdf", "2026-11-03T10:00:00Z");
    const files = [first, second];
    assert.equal(storedFileFor("plan.pdf", files, "2026-11-02T10:00:00Z"), first);
    assert.equal(storedFileFor("plan.pdf", files, "2026-11-04T10:00:00Z"), second);
    assert.equal(storedFileFor("plan.pdf", files, "2026-10-01T10:00:00Z"), first);
    assert.equal(storedFileFor("plan.pdf", files), second);
    assert.equal(storedFileFor("plan.pdf", files, "not a date"), second);
  });
});

describe("studio file names", () => {
  it("stores a name in the same form as before", () => {
    assert.equal(studioFileSlug("Ceremony Layout.pdf"), "ceremony-layout.pdf");
    assert.match(
      studioFileKey("inquiries/abc", "Ceremony Layout.pdf"),
      /^inquiries\/abc\/\d+-ceremony-layout\.pdf$/,
    );
  });
});

describe("fileLinkOld", () => {
  const fetched = 1_000_000;

  it("trusts a link while it has time left", () => {
    assert.equal(fileLinkOld(fetched, fetched + 60_000), false);
  });

  it("replaces a link close to running out, and one past it", () => {
    assert.equal(fileLinkOld(fetched, fetched + (FILE_LINK_SECONDS - 60) * 1000), true);
    assert.equal(fileLinkOld(fetched, fetched + FILE_LINK_SECONDS * 2000), true);
  });
});
