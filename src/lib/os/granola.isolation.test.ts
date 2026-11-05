import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decryptSecret } from "./crypto.server";
import {
  connectGranolaKey,
  createMemoryGranolaVault,
  disconnectGranolaKey,
  publicGranola,
  readGranolaConnection,
} from "./granola.server";

process.env["INTEGRATION_ENCRYPTION_KEY"] ??= "granola-isolation-test-key";

const KEY = "grn_workspace_key_for_say_sukii";

function notesResponse(status: number) {
  return new Response(
    status === 200 ? JSON.stringify({ notes: [], hasMore: false, cursor: null }) : "no",
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("granola connection", () => {
  it("rejects a key that is not a granola workspace key", async () => {
    const vault = createMemoryGranolaVault();
    await assert.rejects(
      connectGranolaKey("not-a-key", { vault, fetchImpl: async () => notesResponse(200) }),
      /starts with grn_/,
    );
    assert.equal(await vault.read(), null);
  });

  it("stores the key encrypted after granola accepts it", async () => {
    const vault = createMemoryGranolaVault();
    const seen: string[] = [];
    const connected = await connectGranolaKey(`  Bearer ${KEY}  `, {
      vault,
      now: () => new Date("2026-11-02T17:00:00.000Z"),
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        seen.push(headers.get("Authorization") ?? "");
        return notesResponse(200);
      },
    });

    assert.deepEqual(seen, [`Bearer ${KEY}`]);
    assert.equal(connected.status, "connected");
    const stored = await vault.read();
    assert.ok(stored?.encrypted_api_key);
    assert.equal(stored.encrypted_api_key.includes(KEY), false);
    assert.equal(decryptSecret(stored.encrypted_api_key), KEY);
    assert.deepEqual(await readGranolaConnection(vault), {
      status: "connected",
      connected_at: "2026-11-02T17:00:00.000Z",
      updated_at: stored.updated_at,
    });
    assert.equal(JSON.stringify(publicGranola(stored)).includes(KEY), false);
  });

  it("leaves the studio disconnected when granola refuses the key", async () => {
    const vault = createMemoryGranolaVault();
    await assert.rejects(
      connectGranolaKey(KEY, { vault, fetchImpl: async () => notesResponse(401) }),
      /did not accept/,
    );
    assert.equal((await readGranolaConnection(vault)).status, "disconnected");
  });

  it("clears the key on disconnect", async () => {
    const vault = createMemoryGranolaVault();
    await connectGranolaKey(KEY, { vault, fetchImpl: async () => notesResponse(200) });
    const disconnected = await disconnectGranolaKey({ vault });
    assert.equal(disconnected.status, "disconnected");
    assert.equal((await vault.read())?.encrypted_api_key, null);
    assert.equal((await readGranolaConnection(vault)).status, "disconnected");
  });
});
