import { createFileRoute } from "@tanstack/react-router";

import { AddOnInvoice } from "@/components/proposal/AddOnInvoice";

// An invoice of its own, for add-ons and work without a proposal: inside.saysukii.com/invoice/<token>.
export const Route = createFileRoute("/invoice/$token")({
  head: () => ({
    meta: [
      { title: "say sukii invoice" },
      { name: "description", content: "an invoice from say sukii." },
      { property: "og:title", content: "say sukii invoice" },
      { name: "twitter:title", content: "say sukii invoice" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { token } = Route.useParams();
  return <AddOnInvoice token={token} />;
}
