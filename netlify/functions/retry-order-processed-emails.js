import { createClient } from "@supabase/supabase-js";
import { getEnv, securityHeaders } from "./_shared/http.js";
import { drainOrderProcessedEmailQueue } from "./_shared/order-processed-email.js";
import { drainOrderReceiptQueue } from "./_shared/order-receipt.js";

export default async function handler() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("retry-order-processed-emails: Supabase env vars missing");
    return new Response(null, { status: 204, headers: securityHeaders() });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const results = await drainOrderProcessedEmailQueue({ supabase, limit: 2 });
  const receipts = await drainOrderReceiptQueue({ supabase, limit: 2 });
  const sent = results.filter(result => result.sent).length;
  const receiptsSent = receipts.filter(result => result.ok).length;
  const attention = results.filter(result => result.state === "NEEDS_REVIEW").length;
  console.info(
    `retry-order-processed-emails: processed ${results.length}, sent ${sent}, needs review ${attention}; receipts processed ${receipts.length}, sent ${receiptsSent}`,
  );
  return new Response(null, { status: 204, headers: securityHeaders() });
}

export const config = {
  schedule: "*/5 * * * *",
};
