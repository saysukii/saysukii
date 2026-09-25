import { createFileRoute } from "@tanstack/react-router";

import { InquiryDesk } from "@/components/inquiry/InquiryDesk";

export const Route = createFileRoute("/_authenticated/pipeline/")({
  head: () => ({
    meta: [
      { title: "Inquiries — Say Sukii OS" },
      { name: "description", content: "Every inquiry from first note through booking or close." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <InquiryDesk />,
});
