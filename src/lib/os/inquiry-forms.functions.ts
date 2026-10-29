import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import { SAY_SUKII_STUDIO_ID, type Json } from "@/integrations/supabase/types";
import {
  hydrateInquiryDrafts,
  type InquiryDrafts,
  type InquiryPathDraft,
} from "@/lib/os/inquiry-draft";
import { INTEREST_OPTIONS } from "@/lib/os/inquiry-schema";

const copySchema = z.object({
  label: z.string().max(180).optional(),
  hint: z.string().max(240).optional(),
  options: z.record(z.string().max(80), z.string().max(160)).optional(),
});

const pathSchema = z.object({
  order: z.array(z.string().max(40)).max(40),
  copy: z.record(z.string().max(40), copySchema),
});

const draftsSchema = z.object({
  shared: pathSchema.optional(),
  weddings: pathSchema.optional(),
  events: pathSchema.optional(),
  deliveries: pathSchema.optional(),
  subscriptions: pathSchema.optional(),
  set_design: pathSchema.optional(),
});

function lowerDrafts(drafts: z.infer<typeof draftsSchema>): InquiryDrafts {
  const next: InquiryDrafts = {};
  for (const [key, path] of Object.entries(drafts)) {
    if (!path) continue;
    const copy: InquiryPathDraft["copy"] = {};
    for (const [id, item] of Object.entries(path.copy)) {
      const options = item.options
        ? Object.fromEntries(
            Object.entries(item.options).map(([option, label]) => [option, label.toLowerCase()]),
          )
        : undefined;
      copy[id] = {
        label: (item.label ?? "").toLowerCase(),
        hint: (item.hint ?? "").toLowerCase(),
        ...(options && Object.keys(options).length ? { options } : {}),
      };
    }
    next[key as keyof InquiryDrafts] = { order: path.order, copy };
  }
  return next;
}

export const getInquiryForms = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("studios")
      .select("inquiry_forms")
      .eq("id", SAY_SUKII_STUDIO_ID)
      .maybeSingle();
    if (error || !data?.inquiry_forms) return null;
    const parsed = draftsSchema.safeParse(data.inquiry_forms);
    if (!parsed.success) return null;
    const drafts = hydrateInquiryDrafts(lowerDrafts(parsed.data));
    if (!drafts.shared && !INTEREST_OPTIONS.some((option) => drafts[option.value])) return null;
    return drafts;
  } catch {
    return null;
  }
});

export const saveInquiryForms = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => draftsSchema.parse(input))
  .handler(async ({ data }) => {
    const saved = lowerDrafts(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("studios")
      .update({ inquiry_forms: saved as unknown as Json })
      .eq("id", SAY_SUKII_STUDIO_ID);
    if (error) throw new Error(error.message);
    return saved;
  });
