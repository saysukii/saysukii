import {
  defaultEmailTemplate,
  mergeEmailTemplates,
  type EmailTemplateId,
  type EmailTemplateInfo,
} from "@/lib/email-templates";

/** Every template as the studio saved it; the app's own words until the table exists or is reachable. */
export async function loadEmailTemplates(): Promise<EmailTemplateInfo[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .select("id, subject, headline, body");
  if (error) {
    console.error("[email templates] using the app's own words:", error.message);
    return mergeEmailTemplates([]);
  }
  return mergeEmailTemplates(data ?? []);
}

export async function loadEmailTemplate(id: EmailTemplateId): Promise<EmailTemplateInfo> {
  const all = await loadEmailTemplates();
  return all.find((item) => item.id === id) ?? defaultEmailTemplate(id);
}
