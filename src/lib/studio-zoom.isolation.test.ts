import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { STUDIO_BASE_WIDTH, STUDIO_MAX_ZOOM, studioZoomFor } from "./studio-zoom";

describe("studio zoom", () => {
  it("leaves a 13-inch laptop and anything narrower as it is", () => {
    assert.equal(studioZoomFor(STUDIO_BASE_WIDTH), 1);
    assert.equal(studioZoomFor(1024), 1);
    assert.equal(studioZoomFor(390), 1);
    assert.equal(studioZoomFor(Number.NaN), 1);
  });

  it("scales a wider window to look like the 13-inch", () => {
    // a 15-inch macbook air at its default size
    assert.equal(studioZoomFor(1710), 1.336);
    assert.equal(studioZoomFor(1440), 1.125);
  });

  it("stops growing on a big monitor", () => {
    assert.equal(studioZoomFor(1920), STUDIO_MAX_ZOOM);
    assert.equal(studioZoomFor(3840), STUDIO_MAX_ZOOM);
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
