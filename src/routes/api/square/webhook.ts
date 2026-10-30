import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { settleSquarePayment } from "@/lib/os/square-paid.server";
import { verifySquareWebhook } from "@/lib/os/square.server";

export const Route = createFileRoute("/api/square/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("x-square-hmacsha256-signature") ?? "";
        if (!(await verifySquareWebhook(body, signature))) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        const payload = JSON.parse(body) as SquareWebhook;
        const { data: existing } = await supabaseAdmin
          .from("webhook_events")
          .select("status")
          .eq("provider", "square")
          .eq("event_id", payload.event_id)
          .maybeSingle();
        if (existing?.status === "processed") return Response.json({ received: true });

        await supabaseAdmin.from("webhook_events").upsert(
          {
            provider: "square",
            event_id: payload.event_id,
            event_type: payload.type,
            status: "received",
            payload: payload as unknown as Json,
          },
          { onConflict: "provider,event_id" },
        );

        try {
          if (payload.type === "payment.updated") {
            const payment = payload.data?.object?.payment;
            if (payment?.status === "COMPLETED" && payment.order_id) {
              await settleSquarePayment(payment);
            }
          }
          await supabaseAdmin
            .from("webhook_events")
            .update({ status: "processed", processed_at: new Date().toISOString() })
            .eq("provider", "square")
            .eq("event_id", payload.event_id);
          return Response.json({ received: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await supabaseAdmin
            .from("webhook_events")
            .update({ status: "failed", error_message: message })
            .eq("provider", "square")
            .eq("event_id", payload.event_id);
          return Response.json({ error: "Webhook processing failed" }, { status: 500 });
        }
      },
    },
  },
});

type SquareWebhook = {
  event_id: string;
  type: string;
  data?: { object?: { payment?: SquarePayment } };
};

type SquarePayment = {
  id: string;
  order_id?: string;
  status?: string;
  updated_at?: string;
  amount_money?: { amount?: number | string };
  [key: string]: unknown;
};
