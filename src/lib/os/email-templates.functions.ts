import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import { isEmailTemplateId } from "@/lib/email-templates";

const templateId = z.string().refine(isEmailTemplateId, "that isn't one of the letters");

/** Every letter's words, as the studio last saved them. */
export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { loadEmailTemplates } = await import("./email-templates.server");
    return loadEmailTemplates();
  });

/** Saves a letter's words; from now on it sends exactly as written. */
export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: templateId,
        subject: z.string().trim().max(300),
        headline: z.string().trim().max(200),
        body: z.string().trim().min(1, "write the letter first.").max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_templates").upsert({
      id: data.id,
      subject: data.subject,
      headline: data.headline,
      body: data.body,
      updated_by: context.profile.id,
    });
    if (error) {
      throw new Error(
        /email_templates/.test(error.message)
          ? "Run the email templates migration in Supabase first."
          : error.message,
      );
    }
    return { saved: true };
  });

/** Puts a letter back to the app's own words. */
export const resetEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: templateId }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { reset: true };
  });
