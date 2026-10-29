import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ProposalPacket } from "@/components/proposal/ProposalPacket";
import { proposalHead } from "@/lib/proposal-head";
import { NotOnTheBooks } from "@/components/studio/NotOnTheBooks";
import { findProposalBySlug } from "@/lib/os/proposals.functions";
import { previewTokenFor } from "@/lib/preview-proposals";

// A proposal lives at the client's name: inside.saysukii.com/maya-chen.
export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const { token } = await findProposalBySlug({ data: { slug: params.slug } }).catch(() => ({
      token: null,
    }));
    if (token) return { token };
    // preview proposals live in this browser, so the page looks for them itself
    if (import.meta.env.DEV) return { token: null };
    throw notFound();
  },
  head: ({ loaderData }) => (loaderData?.token || import.meta.env.DEV ? proposalHead() : {}),
  component: ClientProposal,
});

function ClientProposal() {
  const { slug } = Route.useParams();
  const { token } = Route.useLoaderData();
  const [previewToken, setPreviewToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!token) setPreviewToken(previewTokenFor(slug));
  }, [token, slug]);

  if (token) return <ProposalPacket token={token} />;
  if (previewToken === undefined) return null;
  return previewToken ? <ProposalPacket token={previewToken} /> : <NotOnTheBooks />;
}
