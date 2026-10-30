import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { decryptSecret, encryptSecret, openSecret } from "./crypto.server";

const saved = {
  key: process.env["INTEGRATION_ENCRYPTION_KEY"],
  previous: process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"],
};

afterEach(() => {
  process.env["INTEGRATION_ENCRYPTION_KEY"] = saved.key;
  if (saved.previous === undefined) delete process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"];
  else process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"] = saved.previous;
});

describe("rotating the integration key", () => {
  it("still opens a secret locked with the previous key, and says it's stale", () => {
    process.env["INTEGRATION_ENCRYPTION_KEY"] = "the old key";
    delete process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"];
    const locked = encryptSecret("refresh-token");

    process.env["INTEGRATION_ENCRYPTION_KEY"] = "the new key";
    process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"] = "the old key";
    assert.deepEqual(openSecret(locked), { value: "refresh-token", stale: true });

    const relocked = encryptSecret("refresh-token");
    assert.deepEqual(openSecret(relocked), { value: "refresh-token", stale: false });
  });

  it("can't open an old secret once the previous key is gone", () => {
    process.env["INTEGRATION_ENCRYPTION_KEY"] = "the old key";
    const locked = encryptSecret("refresh-token");
    process.env["INTEGRATION_ENCRYPTION_KEY"] = "the new key";
    delete process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"];
    assert.throws(() => decryptSecret(locked));
  });
});
