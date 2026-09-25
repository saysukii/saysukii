import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decryptSecret, encryptSecret } from "./crypto.server";
import {
  GMAIL_PUBLIC_FIELDS,
  GMAIL_SCOPES,
  createGmailIntegration,
  createMemoryGmailVault,
  gmailAuthorizeUrl,
  publicStatusContainsSecrets,
} from "./gmail.server";

process.env["INTEGRATION_ENCRYPTION_KEY"] ??= "gmail-isolation-test-key";

const credentials = {
  clientId: "sukii-google-client",
  clientSecret: "sukii-google-secret",
  redirectUri: "http://localhost:8080/api/integrations/gmail/callback",
  loginHint: "info@saysukii.com",
};

function fakeOAuth() {
  const revoked: string[] = [];
  let refreshCount = 0;
  return {
    revoked,
    client: {
      async token(params: Record<string, string>) {
        if (params["grant_type"] === "authorization_code") {
          const code = params["code"] ?? "missing";
          return {
            access_token: `access-${code}`,
            refresh_token: `refresh-${code}`,
            expires_in: 3600,
            scope: GMAIL_SCOPES.join(" "),
          };
        }
        if (params["grant_type"] === "refresh_token") {
          refreshCount += 1;
          return {
            access_token: `access-refreshed-${refreshCount}`,
            expires_in: 3600,
          };
        }
        throw new Error(`unexpected grant ${params["grant_type"]}`);
      },
      async userEmail(accessToken: string) {
        assert.match(accessToken, /^access-/);
        return "info@saysukii.com";
      },
      async revoke(token: string) {
        revoked.push(token);
      },
    },
  };
}

describe("Gmail OAuth isolation", () => {
  it("requests read + send scopes with offline refresh", () => {
    const url = new URL(gmailAuthorizeUrl("state-token", credentials));
    const scope = url.searchParams.get("scope") ?? "";
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.match(scope, /gmail\.readonly/);
    assert.match(scope, /gmail\.send/);
    assert.match(scope, /userinfo\.email/);
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.equal(url.searchParams.get("login_hint"), "info@saysukii.com");
    assert.equal(url.searchParams.get("hd"), "saysukii.com");
  });

  it("connects, disconnects, reconnects, and refreshes without exposing tokens", async () => {
    const vault = createMemoryGmailVault();
    const oauth = fakeOAuth();
    let now = new Date("2026-09-14T16:00:00.000Z");
    const gmail = createGmailIntegration({
      vault,
      oauth: oauth.client,
      credentials,
      encrypt: encryptSecret,
      decrypt: decryptSecret,
      now: () => now,
    });

    const connected = await gmail.completeOAuth("first", "admin-1");
    assert.equal(connected.status, "connected");
    assert.equal(connected.account_email, "info@saysukii.com");
    assert.equal(connected.connected_by, "admin-1");
    assert.deepEqual(Object.keys(connected).sort(), [...GMAIL_PUBLIC_FIELDS].sort());
    assert.equal(publicStatusContainsSecrets(connected), false);
    assert.equal(JSON.stringify(connected).includes("access-first"), false);
    assert.equal(JSON.stringify(connected).includes("refresh-first"), false);

    const stored = await vault.read();
    assert.ok(stored?.encrypted_access_token);
    assert.ok(stored?.encrypted_refresh_token);
    assert.equal(decryptSecret(stored.encrypted_access_token), "access-first");
    assert.equal(decryptSecret(stored.encrypted_refresh_token), "refresh-first");
    assert.notEqual(stored.encrypted_access_token, "access-first");

    const disconnected = await gmail.disconnect();
    assert.equal(disconnected.status, "disconnected");
    assert.equal(disconnected.account_email, null);
    assert.equal(disconnected.connected_at, null);
    assert.ok(oauth.revoked.includes("access-first"));
    assert.ok(oauth.revoked.includes("refresh-first"));
    const afterDisconnect = await vault.read();
    assert.equal(afterDisconnect?.encrypted_access_token, null);
    assert.equal(afterDisconnect?.encrypted_refresh_token, null);
    assert.equal(afterDisconnect?.token_expires_at, null);
    assert.equal(publicStatusContainsSecrets(disconnected), false);

    const reconnected = await gmail.completeOAuth("second", "admin-1");
    assert.equal(reconnected.status, "connected");
    assert.equal(reconnected.account_email, "info@saysukii.com");
    const afterReconnect = await vault.read();
    assert.equal(decryptSecret(afterReconnect?.encrypted_access_token ?? ""), "access-second");
    assert.equal(decryptSecret(afterReconnect?.encrypted_refresh_token ?? ""), "refresh-second");
    assert.notEqual(afterReconnect?.encrypted_access_token, stored?.encrypted_access_token);

    const refreshed = await gmail.refresh({ force: true });
    assert.equal(refreshed.status, "connected");
    assert.equal(publicStatusContainsSecrets(refreshed), false);
    const afterRefresh = await vault.read();
    assert.equal(decryptSecret(afterRefresh?.encrypted_access_token ?? ""), "access-refreshed-1");
    assert.equal(decryptSecret(afterRefresh?.encrypted_refresh_token ?? ""), "refresh-second");

    now = new Date("2026-09-14T17:30:00.000Z");
    const access = await gmail.validAccessToken();
    assert.equal(access, "access-refreshed-2");
    const publicAfterValid = await gmail.publicStatus();
    assert.equal(JSON.stringify(publicAfterValid).includes(access), false);
    assert.equal(publicStatusContainsSecrets(publicAfterValid), false);
  });
});
