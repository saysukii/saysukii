import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isProposalSlug, proposalCards } from "@/lib/proposal-link";
import { hashToken } from "@/lib/os/crypto.server";
import { refreshInquirySummarySafe } from "@/lib/os/inquiry-summary.server";
import { syncInquiryAutoTaskFor } from "@/lib/os/tasks.functions";

export async function markProposalsSentInLetter(inquiryId: string, body: string) {
  const cards = proposalCards(body).cards;
  if (!cards.length) return;
  const sentAt = new Date().toISOString();
  for (const card of cards) {
    // a card carries the client's name, or the token on an older /proposal/ link
    const lookup = supabaseAdmin.from("proposals").select("id, status, inquiry_id");
    const { data, error: lookupError } = await (
      isProposalSlug(card.key)
        ? lookup.eq("slug", card.key)
        : lookup.eq("access_token_hash", hashToken(card.key))
    ).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!data || data.inquiry_id !== inquiryId || data.status !== "draft") continue;
    const { error } = await supabaseAdmin
      .from("proposals")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("inquiries")
      .update({ status: "proposal_sent", proposal_sent_at: sentAt })
      .eq("id", inquiryId);
    await syncInquiryAutoTaskFor(supabaseAdmin, inquiryId);
    await refreshInquirySummarySafe(supabaseAdmin, inquiryId);
  }
}
