import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProposalPacket } from "@/components/proposal/ProposalPacket";
import { proposalHead } from "@/lib/proposal-head";
import { findProposalSlug } from "@/lib/os/proposals.functions";

// Older links: /proposal/<token> moves to the client's name, inside.saysukii.com/maya-chen.
export const Route = createFileRoute("/proposal/$token")({
  loader: async ({ params }) => {
    if (params.token.startsWith("preview_")) return;
    const { slug } = await findProposalSlug({ data: { token: params.token } }).catch(() => ({
      slug: null,
    }));
    if (slug) throw redirect({ to: "/$slug", params: { slug }, replace: true });
  },
  head: proposalHead,
  component: OlderProposalLink,
});

function OlderProposalLink() {
  const { token } = Route.useParams();
  return <ProposalPacket token={token} />;
}
