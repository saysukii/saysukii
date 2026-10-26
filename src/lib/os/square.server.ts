import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret, encryptSecret } from "./crypto.server";

function squareEnvironment() {
  return process.env["SQUARE_ENVIRONMENT"]?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

function squareHost() {
  return squareEnvironment() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function isLiveStudio() {
  const app = process.env["APP_URL"]?.trim();
  if (!app) return true;
  try {
    const host = new URL(app).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return true;
  }
}

export function squareAuthorizeUrl(state: string) {
  const appId = process.env["SQUARE_APPLICATION_ID"];
  const redirectUri = process.env["SQUARE_REDIRECT_URI"];
  if (!appId || !redirectUri) throw new Error("Square OAuth is not configured");
  if (squareEnvironment() === "sandbox" && isLiveStudio()) {
    throw new Error(
      "Square is still the sandbox on this studio, so the permission page stays blank. Set SQUARE_ENVIRONMENT to production, use the production application id and secret, and set the redirect URL to https://inside.saysukii.com/api/integrations/square/callback.",
    );
  }
  const url = new URL("/oauth2/authorize", squareHost());
  url.searchParams.set("client_id", appId);
  url.searchParams.set(
    "scope",
    [
      "PAYMENTS_WRITE",
      "PAYMENTS_READ",
      "ORDERS_WRITE",
      "ORDERS_READ",
      "MERCHANT_PROFILE_READ",
    ].join(" "),
  );
  if (squareEnvironment() === "production") url.searchParams.set("session", "false");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function exchangeSquareCode(code: string, connectedBy: string) {
  const clientId = process.env["SQUARE_APPLICATION_ID"];
  const clientSecret = process.env["SQUARE_APPLICATION_SECRET"];
  const redirectUri = process.env["SQUARE_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Square OAuth is not configured");
  }

  const response = await squareRequest<SquareTokenResponse>("/oauth2/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.access_token) throw new Error("Square did not return an access token");

  const { error } = await supabaseAdmin.from("integration_connections").upsert(
    {
      provider: "square",
      status: "connected",
      encrypted_access_token: encryptSecret(response.access_token),
      encrypted_refresh_token: response.refresh_token
        ? encryptSecret(response.refresh_token)
        : null,
      expires_at: response.expires_at ?? null,
      metadata: {
        merchant_id: response.merchant_id ?? null,
        environment: squareEnvironment(),
      },
      connected_by: connectedBy,
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
  return response;
}

async function squareAccessToken() {
  const direct = process.env["SQUARE_ACCESS_TOKEN"];
  if (direct) return direct;
  const { data, error } = await supabaseAdmin
    .from("integration_connections")
    .select("encrypted_access_token")
    .eq("provider", "square")
    .eq("status", "connected")
    .maybeSingle();
  if (error || !data?.encrypted_access_token) throw new Error("Square is not connected");
  return decryptSecret(data.encrypted_access_token);
}

export async function createSquarePaymentLink(input: {
  idempotencyKey: string;
  label: string;
  amountCents: number;
}) {
  const locationId = process.env["SQUARE_LOCATION_ID"];
  if (!locationId) throw new Error("SQUARE_LOCATION_ID is not configured");
  const response = await squareRequest<SquarePaymentLinkResponse>(
    "/v2/online-checkout/payment-links",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${await squareAccessToken()}` },
      body: JSON.stringify({
        idempotency_key: input.idempotencyKey,
        quick_pay: {
          name: input.label,
          price_money: { amount: input.amountCents, currency: "USD" },
          location_id: locationId,
        },
        checkout_options: {
          redirect_url: process.env["SQUARE_PAYMENT_REDIRECT_URL"],
          ask_for_shipping_address: false,
        },
      }),
    },
  );
  const link = response.payment_link;
  if (!link?.url) throw new Error("Square did not return a payment link");
  return { url: link.url, orderId: link.order_id ?? null, id: link.id };
}

export async function verifySquareWebhook(body: string, signature: string) {
  const signatureKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  const notificationUrl = process.env["SQUARE_WEBHOOK_URL"];
  if (!signatureKey || !notificationUrl) throw new Error("Square webhook is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(notificationUrl + body),
  );
  const expected = bytesToBase64(new Uint8Array(digest));
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return mismatch === 0;
}

async function squareRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${squareHost()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Square-Version": "2026-08-19",
      ...init.headers,
    },
  });
  const payload = (await response.json()) as T & {
    errors?: Array<{ detail?: string; code?: string }>;
  };
  if (!response.ok) {
    const detail = payload.errors?.map((error) => error.detail ?? error.code).join("; ");
    throw new Error(detail || `Square request failed (${response.status})`);
  }
  return payload;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type SquareTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  merchant_id?: string;
};

type SquarePaymentLinkResponse = {
  payment_link?: { id?: string; url?: string; order_id?: string };
};
