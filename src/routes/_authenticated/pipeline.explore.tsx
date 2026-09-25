import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { InquiryLayoutExplore, LAYOUT_STUDIES } from "@/components/inquiry/InquiryLayoutExplore";

const searchSchema = z.object({
  v: z.enum(["overview", "correspondence", "atelier", "board"]).optional().catch("overview"),
  id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/pipeline/explore")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Inquiry layouts — Say Sukii OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PipelineExplorePage,
});

function PipelineExplorePage() {
  const { v, id } = Route.useSearch();
  const layout = LAYOUT_STUDIES.some((item) => item.id === v) ? v : "overview";
  return <InquiryLayoutExplore layout={layout ?? "overview"} selectedId={id} />;
}
