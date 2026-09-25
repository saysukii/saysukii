import { Resend } from "resend";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendInput = {
  to: string | string[];
  subject: string;
  html: string;
  referenceType?: string;
  referenceId?: string;
  eventType: string;
};

function studioFrom() {
  return process.env["RESEND_FROM_EMAIL"] ?? "Say Sukii <studio@saysukii.com>";
}

export async function sendStudioEmail(input: SendInput) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    await logEmail(input, "failed", "RESEND_API_KEY is not configured");
    return { skipped: true };
  }

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: studioFrom(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) throw new Error(error.message);
    await logEmail(input, "succeeded");
    return { skipped: false, id: data?.id };
  } catch (error) {
    await logEmail(input, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function logEmail(input: SendInput, status: "succeeded" | "failed", errorMessage?: string) {
  await supabaseAdmin.from("integration_events").insert({
    provider: "resend",
    event_type: input.eventType,
    status,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    error_message: errorMessage ?? null,
    attempts: 1,
    payload: { recipients: Array.isArray(input.to) ? input.to : [input.to] },
  });
}

export function emailFrame(title: string, body: string, action?: { label: string; url: string }) {
  const actionHtml = action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#92908d;color:#f6f3ec;text-decoration:none;padding:14px 22px;border-radius:14px;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f2eff0;color:#24221f;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:48px 24px"><p style="font-size:11px;letter-spacing:.2em;color:#947479;text-transform:uppercase">Say Sukii OS</p><h1 style="font-weight:400;font-size:30px">${escapeHtml(title)}</h1><div style="font-size:15px;line-height:1.7;color:#686461">${body}</div>${actionHtml}<p style="margin-top:42px;font-size:12px;color:#868481">Flowers for the people.</p></div></body></html>`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
