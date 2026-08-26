import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_shared/http.js";

const BATCH_LIMIT = 100;
const CONCURRENCY = 10;

export async function releaseExpiredReservations({
  supabase,
  now = new Date(),
  batchLimit = BATCH_LIMIT,
}) {
  const cutoff = new Date(now);
  if (Number.isNaN(cutoff.getTime())) throw new Error("Invalid reservation release time.");
  const limit = Math.min(Math.max(Number(batchLimit) || 1, 1), BATCH_LIMIT);
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,reservation_expires_at")
    .eq("payment_status", "AWAITING_PAYMENT")
    .not("reservation_expires_at", "is", null)
    .lte("reservation_expires_at", cutoff.toISOString())
    .order("reservation_expires_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const orders = Array.isArray(data) ? data : [];
  const summary = { examined: orders.length, released: 0, skipped: 0, failed: 0 };
  for (let offset = 0; offset < orders.length; offset += CONCURRENCY) {
    const chunk = orders.slice(offset, offset + CONCURRENCY);
    const results = await Promise.all(chunk.map(async order => {
      const result = await supabase.rpc("cancel_unpaid_order", {
        p_order_id: order.id,
        p_expected_payment_status: "AWAITING_PAYMENT",
        p_actor_user_id: null,
      });
      if (!result.error) return "released";
      const message = String(result.error.message || "");
      if (message.includes("paid_order_requires_refund") || message.includes("order_payment_status_conflict")) {
        return "skipped";
      }
      console.error(`release-stale-unpaid-orders: ${order.order_number} failed:`, result.error);
      return "failed";
    }));
    for (const result of results) summary[result] += 1;
  }
  return summary;
}

export default async function handler() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("release-stale-unpaid-orders: Supabase env vars missing");
    return new Response(null, { status: 204 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const summary = await releaseExpiredReservations({ supabase });
    console.info(
      `release-stale-unpaid-orders: examined ${summary.examined}, released ${summary.released}, skipped ${summary.skipped}, failed ${summary.failed}`,
    );
  } catch (error) {
    console.error("release-stale-unpaid-orders: expired order query failed:", error);
  }
  return new Response(null, { status: 204 });
}

export const config = {
  schedule: "17 * * * *",
};
