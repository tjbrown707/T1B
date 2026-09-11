import { Buffer } from "node:buffer";
import { authenticateOrderManager } from "./_shared/admin-auth.js";
import { printFulfillment } from "./_shared/print-fulfillment.js";
import { jsonResponse, readJsonBody } from "./_shared/http.js";
import {
  assertLocalHandoffLabelPrintable,
  buildLocalHandoffLabelPdf,
} from "./_shared/local-handoff-label.js";
import { recordOrderPrintSubmission } from "./_shared/order-processed-email.js";
import {
  getPrintNodePrinterReadiness,
  printNodeConfig,
  submitPrintNodeJob,
} from "./_shared/printnode.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = "GET, POST, OPTIONS";
const MAX_BODY_BYTES = 4 * 1024;
const ORDER_FIELDS = [
  "id", "order_number", "status", "payment_status", "fulfillment_status", "fulfillment_method",
  "inventory_accounting_mode", "payment_confirmed_at", "items", "subtotal", "discount_amount", "shipping",
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
    const [packing, label] = await Promise.all([
      getPrintNodePrinterReadiness({
        apiKey: config.apiKey,
        printerId: config.fulfillmentPrinterId,
      }),
      getPrintNodePrinterReadiness({
        apiKey: config.apiKey,
        printerId: config.labelPrinterId,
      }),
    ]);
    return jsonResponse(200, {
      fulfillmentConfigured: packing.configured,
      labelConfigured: label.configured,
      packing,
      label,
    }, METHODS);
  }

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);
  const orderId = typeof parsed.data?.orderId === "string" ? parsed.data.orderId.trim() : "";
  const document = typeof parsed.data?.document === "string" ? parsed.data.document.trim() : "";
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  if (document === "fulfillment") {
    const result = await printFulfillment(auth, orderId, config);
    return jsonResponse(result.status, result.body.printed ? result.body : { error: result.body.error }, METHODS);
  }
  if (document === "local_handoff_label") return printLocalHandoffLabel(auth, orderId, config);
  if (document === "label") return printLabel(auth, orderId, config);
  return fail(400, "Choose a valid document to print.");
}


async function printLocalHandoffLabel(auth, orderId, config) {
  if (!config.labelConfigured) {
    return fail(503, "The 4x6 label printer is not configured yet. Use Open 4x6 Label to print it from the browser.");
  }
  const { data: order, error } = await auth.supabase
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("admin-print: local handoff label load failed:", error);
    return fail(500, "The pickup label could not be loaded.");
  }
  if (!order) return fail(404, "Order not found.");
  const blocked = assertLocalHandoffLabelPrintable(order);
  if (blocked) return fail(409, blocked);

  try {
    const bytes = await buildLocalHandoffLabelPdf(order);
    const jobId = await submitPrintNodeJob({
      printerId: config.labelPrinterId,
      title: `${order.order_number} - local handoff label`,
      contentType: "pdf_base64",
      content: Buffer.from(bytes).toString("base64"),
    });
    console.info(`admin-print: staff ${auth.user.id} printed local handoff label ${order.order_number} as job ${jobId}`);
    return jsonResponse(200, { printed: true, jobId }, METHODS);
  } catch (printError) {
    console.error("admin-print: local handoff label print failed:", printError);
    return fail(502, "PrintNode could not print the pickup label. Use Open 4x6 Label to print it from the browser.");
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
    const notification = await recordOrderPrintSubmission({
      supabase: auth.supabase,
      orderId,
      eventType: "SHIPPING_LABEL_PRINTED",
      actorUserId: auth.user.id,
      jobId,
    });
    console.info(`admin-print: staff ${auth.user.id} printed label for ${orderId} as job ${jobId}`);
    return jsonResponse(200, { printed: true, jobId, notification }, METHODS);
  } catch (printError) {
    console.error("admin-print: label print failed:", printError);
    return fail(502, "PrintNode could not print the shipping label.");
  }
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

export { packingPrinterUnavailableMessage } from "./_shared/print-fulfillment.js";
