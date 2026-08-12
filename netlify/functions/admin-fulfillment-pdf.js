import { authenticateOrderManager } from "./_shared/admin-auth.js";
import { buildFulfillmentPdf, assertOrderPrintable } from "./_shared/fulfillment-pdf.js";
import { SITE_ORIGIN, jsonResponse } from "./_shared/http.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = "GET, OPTIONS";
const ORDER_FIELDS = [
  "id", "order_number", "status", "payment_status", "fulfillment_status",
  "payment_confirmed_at", "items", "subtotal", "discount_amount", "shipping",
  "total", "payment_method", "customer_name", "customer_email", "customer_phone",
  "ship_address", "ship_city", "ship_state", "ship_zip", "created_at",
].join(",");

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (request.method !== "GET") return fail(405, "Method not allowed");

  const auth = await authenticateOrderManager(request, fail);
  if (auth.response) return auth.response;
  const orderId = (new URL(request.url).searchParams.get("orderId") || "").trim();
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");

  const [orderResult, allocationResult] = await Promise.all([
    auth.supabase.from("orders").select(ORDER_FIELDS).eq("id", orderId).maybeSingle(),
    auth.supabase
      .from("inventory_reservations")
      .select("product_id,quantity,state,inventory_lots(lot_number,is_provisional,storage_location)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);
  if (orderResult.error || allocationResult.error) {
    console.error("admin-fulfillment-pdf: load failed:", orderResult.error || allocationResult.error);
    return fail(500, "The fulfillment document could not be loaded.");
  }
  if (!orderResult.data) return fail(404, "Order not found.");

  const order = {
    ...orderResult.data,
    allocations: (allocationResult.data || []).map(allocation => ({
      productId: allocation.product_id,
      quantity: allocation.quantity,
      state: allocation.state,
      lot: allocation.inventory_lots || null,
    })),
  };
  const blocked = assertOrderPrintable(order);
  if (blocked) return fail(409, blocked);

  try {
    const bytes = await buildFulfillmentPdf(order);
    console.info(`admin-fulfillment-pdf: staff ${auth.user.id} generated ${order.order_number}`);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${order.order_number}-fulfillment.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Authorization",
        "Access-Control-Allow-Methods": METHODS,
        Vary: "Origin, Authorization",
      },
    });
  } catch (error) {
    console.error("admin-fulfillment-pdf: generation failed:", error);
    return fail(500, "The fulfillment document could not be generated.");
  }
}

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}

export const config = {
  path: "/.netlify/functions/admin-fulfillment-pdf",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
