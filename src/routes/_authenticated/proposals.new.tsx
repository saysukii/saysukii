import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ProposalBuilder } from "@/components/proposals/ProposalBuilder";

export const Route = createFileRoute("/_authenticated/proposals/new")({
  validateSearch: z.object({
    inquiry: z.string().uuid().optional(),
  }),
  head: () => ({
    meta: [
      { title: "New proposal — Say Sukii OS" },
      {
        name: "description",
        content: "Build a client proposal from an inquiry and the Say Sukii arrangement library.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewProposalPage,
});

function NewProposalPage() {
  const { inquiry } = Route.useSearch();
  return <ProposalBuilder inquiryId={inquiry} />;
}
