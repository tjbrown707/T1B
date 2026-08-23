import { authenticateOrderManager } from "./_shared/admin-auth.js";
import {
  assertLocalHandoffLabelPrintable,
  buildLocalHandoffLabelPdf,
} from "./_shared/local-handoff-label.js";
import { SITE_ORIGIN, jsonResponse } from "./_shared/http.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = "GET, OPTIONS";
const ORDER_FIELDS = [
  "id", "order_number", "payment_status", "fulfillment_method", "items",
  "customer_name", "customer_email", "customer_phone", "ship_address",
  "ship_city", "ship_state", "ship_zip", "created_at",
].join(",");

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (request.method !== "GET") return fail(405, "Method not allowed");

  const auth = await authenticateOrderManager(request, fail);
  if (auth.response) return auth.response;
  const orderId = (new URL(request.url).searchParams.get("orderId") || "").trim();
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");

  const { data: order, error } = await auth.supabase
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("admin-local-handoff-label: load failed:", error);
    return fail(500, "The pickup label could not be loaded.");
  }
  if (!order) return fail(404, "Order not found.");
  const blocked = assertLocalHandoffLabelPrintable(order);
  if (blocked) return fail(409, blocked);

  try {
    const bytes = await buildLocalHandoffLabelPdf(order);
    console.info(`admin-local-handoff-label: staff ${auth.user.id} generated ${order.order_number}`);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${order.order_number}-pickup-label.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Authorization",
        "Access-Control-Allow-Methods": METHODS,
        Vary: "Origin, Authorization",
      },
    });
  } catch (generationError) {
    console.error("admin-local-handoff-label: generation failed:", generationError);
    return fail(500, "The pickup label could not be generated.");
  }
}

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}

export const config = {
  path: "/.netlify/functions/admin-local-handoff-label",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
