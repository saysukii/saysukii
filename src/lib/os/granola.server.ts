import { SAY_SUKII_STUDIO_ID } from "@/integrations/supabase/types";

import { encryptSecret } from "./crypto.server";

const GRANOLA_NOTES_URL = "https://public-api.granola.ai/v1/notes?page_size=1";

export type GranolaConnectionStatus = "connected" | "disconnected" | "error";

export type GranolaConnection = {
  status: GranolaConnectionStatus;
  connected_at: string | null;
  updated_at: string | null;
};

type GranolaStored = GranolaConnection & {
  encrypted_api_key: string | null;
};

export type GranolaVault = {
  read(): Promise<GranolaStored | null>;
  write(record: Omit<GranolaStored, "updated_at">): Promise<void>;
};

export function normalizeGranolaKey(value: string) {
  return value.trim().replace(/^bearer\s+/i, "");
}

export function granolaKeyError(value: string) {
  const key = normalizeGranolaKey(value);
  if (!/^grn_[A-Za-z0-9._-]{8,200}$/.test(key)) {
    return "paste the workspace key from granola. it starts with grn_.";
  }
  return null;
}

export function createMemoryGranolaVault(): GranolaVault {
  let row: GranolaStored | null = null;
  return {
    async read() {
      return row;
    },
    async write(record) {
      row = { ...record, updated_at: new Date().toISOString() };
    },
  };
}

export function publicGranola(row: GranolaStored | null): GranolaConnection {
  const connected = row?.status === "connected" && Boolean(row.encrypted_api_key);
  return {
    status: connected ? "connected" : row?.status === "error" ? "error" : "disconnected",
    connected_at: connected ? row.connected_at : null,
    updated_at: row?.updated_at ?? null,
  };
}

export async function readGranolaConnection(vault: GranolaVault) {
  return publicGranola(await vault.read());
}

export async function connectGranolaKey(
  apiKey: string,
  deps: { vault: GranolaVault; fetchImpl?: typeof fetch; now?: () => Date },
) {
  const key = normalizeGranolaKey(apiKey);
  const invalid = granolaKeyError(key);
  if (invalid) throw new Error(invalid);

  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(GRANOLA_NOTES_URL, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("granola could not be reached. try again.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("granola did not accept that key.");
  }
  if (!response.ok) {
    throw new Error("granola could not be reached. try again.");
  }

  const now = (deps.now ?? (() => new Date()))().toISOString();
  await deps.vault.write({
    encrypted_api_key: encryptSecret(key),
    status: "connected",
    connected_at: now,
  });
  return { status: "connected" as const, connected_at: now, updated_at: now };
}

export async function disconnectGranolaKey(deps: { vault: GranolaVault; now?: () => Date }) {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  await deps.vault.write({
    encrypted_api_key: null,
    status: "disconnected",
    connected_at: null,
  });
  return { status: "disconnected" as const, connected_at: null, updated_at: now };
}

export function supabaseGranolaVault(): GranolaVault {
  return {
    async read() {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("granola_integration")
        .select("encrypted_api_key, status, connected_at, updated_at")
        .eq("studio_id", SAY_SUKII_STUDIO_ID)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async write(record) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("granola_integration").upsert(
        {
          studio_id: SAY_SUKII_STUDIO_ID,
          encrypted_api_key: record.encrypted_api_key,
          status: record.status,
          connected_at: record.connected_at,
        },
        { onConflict: "studio_id" },
      );
      if (error) throw new Error(error.message);
    },
  };
}
