import type { User } from "@supabase/supabase-js";

import type { ProfileRow } from "@/integrations/supabase/types";

export {
  getDevPreviewAppointments,
  getDevPreviewClient,
  getDevPreviewClients,
  getDevPreviewDashboard,
  getDevPreviewDirectories,
  getDevPreviewInquiryWorkspace,
  getDevPreviewLibrary,
  getDevPreviewPipeline,
  getDevPreviewProject,
  getDevPreviewProjects,
  getDevPreviewProposal,
  getDevPreviewProposalBuilderData,
  getDevPreviewProposals,
  getDevPreviewSettings,
  getDevPreviewShoppingList,
  getDevPreviewTasks,
  PREVIEW_IDS,
  previewArchiveInquiry,
  previewReviewDecision,
  previewSetInquiryStatus,
} from "@/lib/dev-preview-data";

export function isDevPreviewEnabled() {
  return import.meta.env.DEV;
}

export const DEV_PREVIEW_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "info@saysukii.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "Sukii" },
  created_at: new Date().toISOString(),
} as User;

export const DEV_PREVIEW_PROFILE: ProfileRow = {
  id: DEV_PREVIEW_USER.id,
  full_name: "Sukii",
  email: "info@saysukii.com",
  role: "admin",
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_seen_at: null,
};
