import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  STUDIO_BASE_WIDTH,
  STUDIO_HANDHELD_ZOOM,
  STUDIO_MAX_ZOOM,
  studioZoomFor,
} from "./studio-zoom";

describe("studio zoom", () => {
  it("leaves the 13-inch as it is", () => {
    assert.equal(studioZoomFor(STUDIO_BASE_WIDTH), 1);
    assert.equal(studioZoomFor(Number.NaN), 1);
  });

  it("leaves a laptop window narrower than the 13-inch as it is", () => {
    assert.equal(studioZoomFor(1440), 1);
    assert.equal(studioZoomFor(1280), 1);
  });

  it("shrinks the 13-inch page to fit a tablet held wide", () => {
    assert.equal(studioZoomFor(1180, true), 0.803);
    assert.equal(studioZoomFor(1366, true), 0.929);
  });

  it("shows phones and tablets held tall a touch smaller", () => {
    assert.equal(studioZoomFor(390, true), STUDIO_HANDHELD_ZOOM);
    assert.equal(studioZoomFor(820, true), STUDIO_HANDHELD_ZOOM);
    assert.equal(studioZoomFor(1024), STUDIO_HANDHELD_ZOOM);
  });

  it("scales a wider window gently to look like the 13-inch", () => {
    // a 15-inch macbook air at its default size
    assert.equal(studioZoomFor(1710), 1.163);
  });

  it("stops growing on a big monitor", () => {
    assert.equal(studioZoomFor(1920), STUDIO_MAX_ZOOM);
    assert.equal(studioZoomFor(2560), STUDIO_MAX_ZOOM);
  });

  it("keeps every viewport unit in the styles corrected for chrome's scaling", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const raw = css
      .split("\n")
      .map((line, index) => ({ line: line.trim(), at: index + 1 }))
      .filter(({ line }) => !line.startsWith("@media") && !line.startsWith("@container"))
      .filter(({ line }) => /(?<![\w.#-])-?\d*\.?\d+(vh|vw|svh|dvh|lvh|vmin|vmax)\b/.test(line))
      .filter(({ line }) => {
        const units = line.match(
          /-?\d*\.?\d+(vh|vw|svh|dvh|lvh|vmin|vmax)\b(?! \/ var\(--studio-vz)/g,
        );
        return Boolean(units?.length);
      });
    assert.deepEqual(
      raw.map(({ at, line }) => `styles.css:${at} ${line}`),
      [],
      "write viewport units as calc(100vh / var(--studio-vz, 1)) so the scaled studio fits",
    );
  });
});
