import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

function keyFrom(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encryptionKey() {
  const secret = process.env["INTEGRATION_ENCRYPTION_KEY"];
  if (!secret) throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
  return keyFrom(secret);
}

/**
 * Every key a stored secret might be locked with: the current one first, then, while a key is
 * being rotated, the one before it (INTEGRATION_ENCRYPTION_KEY_PREVIOUS). New secrets always use
 * the current key; old ones still open until they're saved again.
 */
function decryptionKeys() {
  const previous = process.env["INTEGRATION_ENCRYPTION_KEY_PREVIOUS"]?.trim();
  return [encryptionKey(), ...(previous ? [keyFrom(previous)] : [])];
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  return openSecret(value).value;
}

/** a stored secret, and whether it was still locked with the previous key */
export function openSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted value");
  const keys = decryptionKeys();
  for (const [index, key] of keys.entries()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      const opened = Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      return { value: opened, stale: index > 0 };
    } catch {
      // not this key; try the one before it
    }
  }
  throw new Error("This secret can't be opened with the current encryption key.");
}

export function createPublicToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 8) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
