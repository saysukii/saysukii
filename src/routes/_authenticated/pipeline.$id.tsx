import { createFileRoute } from "@tanstack/react-router";

import { InquiryDesk } from "@/components/inquiry/InquiryDesk";

export const Route = createFileRoute("/_authenticated/pipeline/$id")({
  head: () => ({
    meta: [{ title: "Lead — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: InquiryWorkspacePage,
});

function InquiryWorkspacePage() {
  const { id } = Route.useParams();
  return <InquiryDesk selectedId={id} />;
}
