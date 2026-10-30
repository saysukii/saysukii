import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { afterSignIn } from "@/lib/after-sign-in";

const signInEmailSchema = z.object({
  email: z.string().trim().email().max(320),
  kind: z.enum(["link", "reset"]),
  /** a studio page to open once signed in */
  next: z.string().trim().max(500).optional(),
});

const LETTER = {
  link: {
    eventType: "sign_in_link",
    subject: "your studio link",
    eyebrow: "sign in",
    headline: "your studio link",
    body: "here's your link into the studio. it works once, for the next hour.",
    button: "enter the studio",
  },
  reset: {
    eventType: "password_reset",
    subject: "reset your password",
    eyebrow: "password",
    headline: "reset your password",
    body: "open this link to choose a new password for the studio. it works once, for the next hour.",
    button: "choose a new password",
  },
} as const;

/**
 * The magic link and the password reset, sent by the studio in its own letter instead of Supabase's.
 * Only active team members get one, and the answer is the same either way, so nobody can test
 * which emails belong to the studio.
 */
export const sendSignInEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) => signInEmailSchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const letter = LETTER[data.kind];
    const [{ supabaseAdmin }, { getRequest }, { renderSaySukiiEmail }, { sendStudioEmail }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@tanstack/react-start/server"),
        import("./email-layout"),
        import("./email.server"),
      ]);

    const { data: member } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .eq("active", true)
      .maybeSingle();
    if (!member) return { sent: true };

    // one letter a minute per person, so the button can't be used to flood an inbox
    const { count } = await supabaseAdmin
      .from("integration_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", letter.eventType)
      .contains("payload", { recipients: [email] })
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if (count) return { sent: true };

    const origin = (
      process.env["APP_URL"]?.replace(/\/$/, "") ?? new URL(getRequest().url).origin
    ).replace(/\/$/, "");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: data.kind === "link" ? "magiclink" : "recovery",
      email,
    });
    if (error || !link.properties?.hashed_token) {
      console.error("[sign-in email] no link:", error?.message);
      throw new Error("We couldn't send that email. Try again in a moment.");
    }
    const url = new URL("/auth/callback", origin);
    url.searchParams.set("token_hash", link.properties.hashed_token);
    url.searchParams.set("type", data.kind === "link" ? "email" : "recovery");
    if (data.kind === "link" && data.next) url.searchParams.set("next", afterSignIn(data.next));

    const sent = await sendStudioEmail({
      to: email,
      subject: letter.subject,
      eventType: letter.eventType,
      referenceType: "profile",
      referenceId: member.id,
      html: renderSaySukiiEmail({
        eyebrow: letter.eyebrow,
        headline: letter.headline,
        body: letter.body,
        button: { label: letter.button, url: url.toString() },
        note: "didn't ask for this? you can let it be. nothing changes until the link is opened.",
      }),
    });
    // the studio's gmail isn't connected, so there's nothing to send it through
    if (sent.skipped) throw new Error("We couldn't send that email. Try again in a moment.");
    return { sent: true };
  });
