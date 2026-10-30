import { createFileRoute, notFound } from "@tanstack/react-router";

import { SquarePay } from "@/components/proposal/SquarePay";

// a local-only mock of the pay pop-up, open on its own; nothing here charges a card
export const Route = createFileRoute("/pay-mock")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Pay mock — Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: PayMock,
});

function PayMock() {
  return (
    <main className="client-packet">
      <SquarePay
        demo
        startOpen
        token="preview_pay_mock"
        amountCents={200125}
        clientName="Amelia Stone"
        clientEmail="amelia@example.com"
        summary={{
          service: "wedding florals",
          eventDate: "03/12/27",
          balance: { amountCents: 200125, due: "02/10/27" },
        }}
        onPaid={() => undefined}
      />
    </main>
  );
}
