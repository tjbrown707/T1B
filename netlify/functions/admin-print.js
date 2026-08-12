import { Buffer } from "node:buffer";
import { authenticateOrderManager } from "./_shared/admin-auth.js";
import { assertOrderPrintable, buildFulfillmentPdf } from "./_shared/fulfillment-pdf.js";
import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { printNodeConfig, submitPrintNodeJob } from "./_shared/printnode.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = "GET, POST, OPTIONS";
const MAX_BODY_BYTES = 4 * 1024;
const ORDER_FIELDS = [
  "id", "order_number", "status", "payment_status", "fulfillment_status", "fulfillment_method",
  "payment_confirmed_at", "items", "subtotal", "discount_amount", "shipping",
  "total", "payment_method", "customer_name", "customer_email", "customer_phone",
  "ship_address", "ship_city", "ship_state", "ship_zip", "created_at",
].join(",");

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (!["GET", "POST"].includes(request.method)) return fail(405, "Method not allowed");
  const auth = await authenticateOrderManager(request, fail);
  if (auth.response) return auth.response;

  const config = printNodeConfig();
  if (request.method === "GET") {
    return jsonResponse(200, {
      fulfillmentConfigured: config.fulfillmentConfigured,
      labelConfigured: config.labelConfigured,
    }, METHODS);
  }

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);
  const orderId = typeof parsed.data?.orderId === "string" ? parsed.data.orderId.trim() : "";
  const document = typeof parsed.data?.document === "string" ? parsed.data.document.trim() : "";
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  if (document === "fulfillment") return printFulfillment(auth, orderId, config);
  if (document === "label") return printLabel(auth, orderId, config);
  return fail(400, "Choose a valid document to print.");
}

async function printFulfillment(auth, orderId, config) {
  if (!config.fulfillmentConfigured) return fail(503, "The fulfillment printer is not configured yet.");
  const [orderResult, allocationResult] = await Promise.all([
    auth.supabase.from("orders").select(ORDER_FIELDS).eq("id", orderId).maybeSingle(),
    auth.supabase
      .from("inventory_reservations")
      .select("product_id,quantity,state,inventory_lots(lot_number,is_provisional,storage_location)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);
  if (orderResult.error || allocationResult.error) {
    console.error("admin-print: fulfillment load failed:", orderResult.error || allocationResult.error);
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
    const jobId = await submitPrintNodeJob({
      printerId: config.fulfillmentPrinterId,
      title: `${order.order_number} - pick ticket and packing slip`,
      contentType: "pdf_base64",
      content: Buffer.from(bytes).toString("base64"),
    });
    await recordPrintEvent(auth, orderId, auth.user.id, "FULFILLMENT_PACKET_PRINTED", jobId);
    console.info(`admin-print: staff ${auth.user.id} printed fulfillment ${order.order_number} as job ${jobId}`);
    return jsonResponse(200, { printed: true, jobId }, METHODS);
  } catch (error) {
    console.error("admin-print: fulfillment print failed:", error);
    return fail(502, "PrintNode could not print the fulfillment packet.");
  }
}

async function printLabel(auth, orderId, config) {
  if (!config.labelConfigured) return fail(503, "The label printer is not configured yet.");
  const { data: shipment, error } = await auth.supabase
    .from("order_shipments")
    .select("label_url,tracking_number,orders(order_number,fulfillment_method)")
    .eq("order_id", orderId)
    .in("status", ["LABEL_PURCHASED", "IN_TRANSIT", "DELIVERED"])
    .maybeSingle();
  if (error) {
    console.error("admin-print: label load failed:", error);
    return fail(500, "The shipping label could not be loaded.");
  }
  if (shipment?.orders?.fulfillment_method === "LOCAL_HANDOFF") {
    return fail(409, "This order is marked for local handoff and cannot print a shipping label.");
  }
  if (!shipment?.label_url) return fail(409, "Buy the shipping label before printing it.");
  try {
    const jobId = await submitPrintNodeJob({
      printerId: config.labelPrinterId,
      title: `${shipment.orders?.order_number || "Tier One order"} - shipping label`,
      contentType: "pdf_uri",
      content: shipment.label_url,
    });
    await recordPrintEvent(auth, orderId, auth.user.id, "SHIPPING_LABEL_PRINTED", jobId);
    console.info(`admin-print: staff ${auth.user.id} printed label for ${orderId} as job ${jobId}`);
    return jsonResponse(200, { printed: true, jobId }, METHODS);
  } catch (printError) {
    console.error("admin-print: label print failed:", printError);
    return fail(502, "PrintNode could not print the shipping label.");
  }
}

async function recordPrintEvent(auth, orderId, actorUserId, eventType, jobId) {
  const { error } = await auth.supabase.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    actor_user_id: actorUserId,
    details: { printnode_job_id: jobId },
  });
  if (error) console.error(`admin-print: ${eventType} audit insert failed:`, error);
}

export const config = {
  path: "/.netlify/functions/admin-print",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}
