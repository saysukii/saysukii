import assert from "node:assert/strict";
import test from "node:test";

import { knockPageGround } from "./proposal-ground.ts";

test("a flat page wash clears and the type stays", () => {
  const width = 10;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 245;
    data[index + 1] = 230;
    data[index + 2] = 232;
    data[index + 3] = 255;
  }
  const ink = (2 * width + 5) * 4;
  data[ink] = 20;
  data[ink + 1] = 18;
  data[ink + 2] = 16;
  data[ink + 3] = 255;
  knockPageGround({ data, width, height });
  assert.equal(data[3], 0);
  assert.equal(data[ink + 3], 255);
});

test("a page that is already clear is left alone", () => {
  const width = 10;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  data[0] = 12;
  data[3] = 255;
  knockPageGround({ data, width, height });
  assert.equal(data[3], 255);
});
