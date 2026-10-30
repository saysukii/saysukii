import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { encryptSecret, openSecret } from "./crypto.server";

// every column holding a secret locked with INTEGRATION_ENCRYPTION_KEY
const LOCKED = [
  {
    table: "integration_connections",
    columns: ["encrypted_access_token", "encrypted_refresh_token"],
  },
  { table: "email_integration", columns: ["encrypted_access_token", "encrypted_refresh_token"] },
  { table: "granola_integration", columns: ["encrypted_api_key"] },
] as const;

/**
 * Saves every stored secret again under the current key, after INTEGRATION_ENCRYPTION_KEY has
 * changed and the old key sits in INTEGRATION_ENCRYPTION_KEY_PREVIOUS. Once it reports nothing
 * left on the old key, the previous key can be removed.
 */
export async function rekeyStoredSecrets() {
  const report = { moved: 0, current: 0, unreadable: [] as string[] };
  for (const { table, columns } of LOCKED) {
    const { data, error } = await supabaseAdmin.from(table).select(["id", ...columns].join(", "));
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
      const patch: Record<string, string> = {};
      for (const column of columns) {
        const value = row[column];
        if (!value) continue;
        try {
          const opened = openSecret(value);
          if (opened.stale) patch[column] = encryptSecret(opened.value);
          else report.current += 1;
        } catch {
          report.unreadable.push(`${table}.${column} (${row["id"]})`);
        }
      }
      if (!Object.keys(patch).length) continue;
      const saved = await supabaseAdmin
        .from(table)
        .update(patch as never)
        .eq("id", row["id"]!);
      if (saved.error) throw new Error(`${table}: ${saved.error.message}`);
      report.moved += Object.keys(patch).length;
    }
  }
  return report;
}
