import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invoiceTitle } from "@/lib/invoice-title";

/**
 * The next invoice number: one past the last made here and past any made by hand in square, so the
 * two never overlap. "SS751" here; square shows it as "SS-751".
 */
export async function claimInvoiceNumber() {
  const { highestSquareInvoiceNumber } = await import("./square.server");
  const highest = await highestSquareInvoiceNumber().catch((error: unknown) => {
    console.error("[invoice number] square's invoices couldn't be read:", error);
    return 0;
  });
  const claimed = await supabaseAdmin.rpc("claim_invoice_number", { after_number: highest });
  if (!claimed.error && claimed.data) return invoiceTitle(claimed.data);
  // before the invoice numbers migration has run, the plain counter
  const plain = await supabaseAdmin.rpc("next_invoice_number");
  if (plain.error || typeof plain.data !== "string" || !plain.data)
    throw new Error(plain.error?.message ?? "The invoice number could not be opened.");
  return invoiceTitle(plain.data);
}
