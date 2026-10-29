import { createFileRoute } from "@tanstack/react-router";

import { InquireScene } from "@/components/inquiry/InquireScene";
import { InquiryQuestionEditor } from "@/components/inquiry/InquiryQuestionEditor";

export const Route = createFileRoute("/inquire/preview")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Let's Connect – Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: InquirePreviewPage,
});

function InquirePreviewPage() {
  return (
    <InquireScene wide scroll>
      <InquiryQuestionEditor />
    </InquireScene>
  );
}
