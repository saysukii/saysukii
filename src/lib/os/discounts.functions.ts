import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import type { SavedDiscount } from "@/lib/discount";

/** The studio's named discounts, to pick again for any client. Empty until the migration runs. */
export const listStudioDiscounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<SavedDiscount[]> => {
    const { data, error } = await context.supabase
      .from("studio_discounts")
      .select("id, name, kind, value")
      .order("name");
    if (error) return [];
    return (data ?? []).map((row) => ({ ...row, value: Number(row.value) }));
  });

/** Keeps a named discount; using a name again updates it. */
export const saveStudioDiscount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        kind: z.enum(["percent", "amount"]),
        value: z.number().positive().max(100_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("studio_discounts")
      .select("id")
      .ilike("name", data.name)
      .maybeSingle();
    const write = existing
      ? context.supabase
          .from("studio_discounts")
          .update({ name: data.name, kind: data.kind, value: data.value })
          .eq("id", existing.id)
      : context.supabase.from("studio_discounts").insert(data);
    const { error } = await write;
    if (error) {
      throw new Error(
        /studio_discounts/.test(error.message)
          ? "Run the card fee and discounts migration in Supabase first."
          : error.message,
      );
    }
    return { saved: true };
  });

export const removeStudioDiscount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("studio_discounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { removed: true };
  });
