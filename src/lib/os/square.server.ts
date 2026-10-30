import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { squareInvoiceNumber } from "@/lib/invoice-title";

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

export function squareAuthorizeUrl(state: string) {
  const appId = process.env["SQUARE_APPLICATION_ID"];
  const redirectUri = process.env["SQUARE_REDIRECT_URI"];
  if (!appId || !redirectUri) throw new Error("Square OAuth is not configured");
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
      "ITEMS_READ",
      "CUSTOMERS_READ",
      "CUSTOMERS_WRITE",
      "INVOICES_READ",
      "INVOICES_WRITE",
    ].join(" "),
  );
  url.searchParams.set("session", squareEnvironment() === "production" ? "false" : "true");
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

/** What the client's page needs to show square's secure card fields; none of it is secret. */
export function squareCheckoutConfig() {
  const applicationId = process.env["SQUARE_APPLICATION_ID"];
  const locationId = process.env["SQUARE_LOCATION_ID"];
  if (!applicationId || !locationId) return null;
  return {
    applicationId,
    locationId,
    sandbox: squareEnvironment() !== "production",
  };
}

export type SquareOrderLine = { name: string; note?: string; amountCents: number };

/** An itemized order, so square shows what was paid for, not just an amount. */
export async function createSquareOrder(input: {
  idempotencyKey: string;
  referenceId: string;
  lines: SquareOrderLine[];
  discountCents?: number;
}) {
  const locationId = process.env["SQUARE_LOCATION_ID"];
  if (!locationId) throw new Error("SQUARE_LOCATION_ID is not configured");
  const discount = input.discountCents ?? 0;
  const response = await squareRequest<{
    order?: { id?: string; total_money?: { amount?: number } };
  }>("/v2/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${await squareAccessToken()}` },
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      order: {
        location_id: locationId,
        reference_id: input.referenceId,
        line_items: input.lines.map((line) => ({
          name: line.name,
          quantity: "1",
          ...(line.note ? { note: line.note } : {}),
          base_price_money: { amount: line.amountCents, currency: "USD" },
        })),
        ...(discount > 0
          ? {
              discounts: [
                {
                  name: "courtesy discount",
                  amount_money: { amount: discount, currency: "USD" },
                  scope: "ORDER",
                },
              ],
            }
          : {}),
      },
    }),
  });
  const orderId = response.order?.id;
  if (!orderId) throw new Error("Square did not return an order");
  return { orderId, totalCents: Number(response.order?.total_money?.amount ?? 0) };
}

export type SquareCompletedPayment = {
  id: string;
  order_id?: string;
  status?: string;
  updated_at?: string;
  amount_money?: { amount?: number | string };
};

/** Charges a card or apple pay token from the client's page against that order. */
export async function createSquareCardPayment(input: {
  sourceId: string;
  verificationToken?: string | undefined;
  idempotencyKey: string;
  amountCents: number;
  orderId: string;
  referenceId: string;
  buyerEmail?: string | null | undefined;
  note: string;
}) {
  const locationId = process.env["SQUARE_LOCATION_ID"];
  if (!locationId) throw new Error("SQUARE_LOCATION_ID is not configured");
  const response = await squareRequest<{ payment?: SquareCompletedPayment }>("/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${await squareAccessToken()}` },
    body: JSON.stringify({
      source_id: input.sourceId,
      idempotency_key: input.idempotencyKey,
      amount_money: { amount: input.amountCents, currency: "USD" },
      location_id: locationId,
      order_id: input.orderId,
      reference_id: input.referenceId,
      note: input.note,
      autocomplete: true,
      ...(input.verificationToken ? { verification_token: input.verificationToken } : {}),
      ...(input.buyerEmail ? { buyer_email_address: input.buyerEmail } : {}),
    }),
  });
  if (!response.payment?.id) throw new Error("Square did not return a payment");
  return response.payment;
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

export type SquareCatalogItem = {
  id: string;
  name: string;
  variation: string | null;
  description: string | null;
  priceCents: number | null;
};

/** Every item variation in the studio's square catalog, priced or not, the way square's invoice picker lists them. */
export async function listSquareCatalog(): Promise<SquareCatalogItem[]> {
  const token = await squareAccessToken();
  const items: SquareCatalogItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ types: "ITEM" });
    if (cursor) query.set("cursor", cursor);
    const response = await squareRequest<SquareCatalogResponse>(`/v2/catalog/list?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    for (const object of response.objects ?? []) {
      const item = object.item_data;
      if (!item?.name || object.is_deleted || item.is_archived) continue;
      const variations = item.variations ?? [];
      for (const variation of variations) {
        const data = variation.item_variation_data;
        if (!variation.id || variation.is_deleted) continue;
        const named = data?.name?.trim();
        items.push({
          id: variation.id,
          name: item.name.trim(),
          variation:
            variations.length > 1 && named && named.toLowerCase() !== "regular" ? named : null,
          description: item.description_plaintext?.trim() || item.description?.trim() || null,
          priceCents:
            data?.pricing_type === "VARIABLE_PRICING" ? null : (data?.price_money?.amount ?? null),
        });
      }
    }
    cursor = response.cursor;
    if (!cursor) break;
  }
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

export type SquareInvoiceLine = {
  name: string;
  note: string | null;
  quantity: number;
  unitCents: number;
  catalogId: string | null;
};

/**
 * A square invoice the client pays on square's own page, the same kind Sukii makes in her dashboard.
 * Catalog items stay linked to the catalog; anything priced by hand goes as its own line.
 */
export async function createSquareInvoice(input: {
  key: string;
  number: string;
  title: string;
  customer: { name: string; email: string };
  lines: SquareInvoiceLine[];
  courtesyCents: number;
  depositCents: number | null;
  balanceDue: string;
  /** "Booking for … per approved proposal.", shown under the invoice's title in square */
  description?: string | null;
}) {
  const locationId = process.env["SQUARE_LOCATION_ID"];
  if (!locationId) throw new Error("SQUARE_LOCATION_ID is not configured");
  const auth = { Authorization: `Bearer ${await squareAccessToken()}` };
  const today = new Date().toISOString().slice(0, 10);

  const found = await squareRequest<{ customers?: Array<{ id?: string }> }>(
    "/v2/customers/search",
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        query: { filter: { email_address: { exact: input.customer.email } } },
        limit: 1,
      }),
    },
  );
  let customerId = found.customers?.[0]?.id;
  if (!customerId) {
    const [given, ...rest] = input.customer.name.trim().split(/\s+/);
    const created = await squareRequest<{ customer?: { id?: string } }>("/v2/customers", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        idempotency_key: `${input.key}-customer`,
        given_name: given || input.customer.email,
        family_name: rest.join(" ") || undefined,
        email_address: input.customer.email,
      }),
    });
    customerId = created.customer?.id;
  }
  if (!customerId) throw new Error("Square did not return a customer");

  const order = await squareRequest<{ order?: { id?: string } }>("/v2/orders", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      idempotency_key: `${input.key}-order`,
      order: {
        location_id: locationId,
        customer_id: customerId,
        line_items: input.lines.map((line) =>
          line.catalogId
            ? {
                catalog_object_id: line.catalogId,
                quantity: String(line.quantity),
                ...(line.note ? { note: line.note } : {}),
              }
            : {
                name: line.name,
                quantity: String(line.quantity),
                base_price_money: { amount: line.unitCents, currency: "USD" },
                ...(line.note ? { note: line.note } : {}),
              },
        ),
        ...(input.courtesyCents > 0
          ? {
              discounts: [
                {
                  uid: "courtesy",
                  name: "courtesy discount",
                  amount_money: { amount: input.courtesyCents, currency: "USD" },
                  scope: "ORDER",
                },
              ],
            }
          : {}),
      },
    }),
  });
  const orderId = order.order?.id;
  if (!orderId) throw new Error("Square did not return an order");

  const draft = await squareRequest<{ invoice?: { id?: string; version?: number } }>(
    "/v2/invoices",
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        idempotency_key: `${input.key}-invoice`,
        invoice: {
          location_id: locationId,
          order_id: orderId,
          primary_recipient: { customer_id: customerId },
          payment_requests: input.depositCents
            ? [
                {
                  request_type: "DEPOSIT",
                  due_date: today,
                  fixed_amount_requested_money: { amount: input.depositCents, currency: "USD" },
                },
                {
                  request_type: "BALANCE",
                  due_date: input.balanceDue < today ? today : input.balanceDue,
                },
              ]
            : [{ request_type: "BALANCE", due_date: today }],
          delivery_method: "SHARE_MANUALLY",
          accepted_payment_methods: {
            card: true,
            square_gift_card: false,
            bank_account: false,
            buy_now_pay_later: false,
            cash_app_pay: false,
          },
          invoice_number: squareInvoiceNumber(input.number),
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
        },
      }),
    },
  );
  if (!draft.invoice?.id || draft.invoice.version == null)
    throw new Error("Square did not return an invoice");

  const published = await squareRequest<{ invoice?: { id?: string; public_url?: string } }>(
    `/v2/invoices/${encodeURIComponent(draft.invoice.id)}/publish`,
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        version: draft.invoice.version,
        idempotency_key: `${input.key}-publish`,
      }),
    },
  );
  const url = published.invoice?.public_url;
  if (!url) throw new Error("Square did not return a link to pay the invoice");
  return { invoiceId: draft.invoice.id, orderId, url };
}

/** Where a square invoice stands: what's been paid, and whether it's done. */
/**
 * The highest invoice number in square, counting ones made there by hand ("SS-750" is 750), so the
 * studio's next number steps past it. Zero when square can't be read.
 */
export async function highestSquareInvoiceNumber() {
  const locationId = process.env["SQUARE_LOCATION_ID"];
  if (!locationId) return 0;
  const response = await squareRequest<{ invoices?: Array<{ invoice_number?: string }> }>(
    "/v2/invoices/search",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${await squareAccessToken()}` },
      body: JSON.stringify({
        query: {
          filter: { location_ids: [locationId] },
          sort: { field: "INVOICE_SORT_DATE", order: "DESC" },
        },
        limit: 200,
      }),
    },
  );
  return Math.max(
    0,
    ...(response.invoices ?? []).map(
      (invoice) => Number(invoice.invoice_number?.match(/(\d+)\s*$/)?.[1] ?? 0) || 0,
    ),
  );
}

export async function readSquareInvoice(invoiceId: string) {
  const response = await squareRequest<{
    invoice?: {
      status?: string;
      payment_requests?: Array<{ total_completed_amount_money?: { amount?: number } }>;
    };
  }>(`/v2/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${await squareAccessToken()}` },
  });
  const invoice = response.invoice;
  const paidCents = (invoice?.payment_requests ?? []).reduce(
    (sum, request) => sum + Number(request.total_completed_amount_money?.amount ?? 0),
    0,
  );
  return { status: invoice?.status ?? "UNKNOWN", paidCents };
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

type SquareCatalogResponse = {
  cursor?: string;
  objects?: Array<{
    id?: string;
    is_deleted?: boolean;
    item_data?: {
      name?: string;
      description?: string;
      description_plaintext?: string;
      is_archived?: boolean;
      variations?: Array<{
        id?: string;
        is_deleted?: boolean;
        item_variation_data?: {
          name?: string;
          pricing_type?: "FIXED_PRICING" | "VARIABLE_PRICING";
          price_money?: { amount?: number; currency?: string };
        };
      }>;
    };
  }>;
};

type SquarePaymentLinkResponse = {
  payment_link?: { id?: string; url?: string; order_id?: string };
};
