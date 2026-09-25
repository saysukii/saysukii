import { createFileRoute } from "@tanstack/react-router";

import { InquirePublicPage } from "@/components/inquiry/InquirePublicPage";

export const Route = createFileRoute("/inquire/")({
  head: () => ({
    meta: [
      { title: "Let's Connect – Say Sukii" },
      {
        name: "description",
        content: "Tell Say Sukii about a wedding, event, delivery, or floral project.",
      },
      { property: "og:title", content: "Let's Connect – Say Sukii" },
      {
        property: "og:description",
        content: "Share the details of your floral vision with Say Sukii.",
      },
    ],
  }),
  component: InquirePage,
});

function InquirePage() {
  return <InquirePublicPage />;
}
