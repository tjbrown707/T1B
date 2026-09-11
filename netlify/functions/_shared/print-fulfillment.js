import { Buffer } from "node:buffer";
import { assertOrderPrintable, buildFulfillmentPdf } from "./fulfillment-pdf.js";
import { recordOrderPrintSubmission } from "./order-processed-email.js";
import { getPrintNodePrinterReadiness, submitPrintNodeJob } from "./printnode.js";

const ORDER_FIELDS = [
  "id", "order_number", "status", "payment_status", "fulfillment_status", "fulfillment_method",
  "inventory_accounting_mode", "payment_confirmed_at", "items", "subtotal", "discount_amount", "shipping",
  "total", "payment_method", "customer_name", "customer_email", "customer_phone",
  "ship_address", "ship_city", "ship_state", "ship_zip", "created_at",
].join(",");

export async function printFulfillment(auth, orderId, config, { automatic = false } = {}) {
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
  if (automatic) {
    const { data: events, error } = await auth.supabase.from("order_events")
      .select("details").eq("order_id", orderId).eq("event_type", "FULFILLMENT_PACKET_PRINTED");
    if (error) return fail(503, "The previous print status could not be checked. Check the printer before using Print Packing Slip.");
    const previous = (events || []).find(event => Number.isInteger(Number(event?.details?.printnode_job_id))
      && Number(event.details.printnode_job_id) > 0);
    if (previous) return { status: 200, body: { printed: true, alreadyPrinted: true, jobId: Number(previous.details.printnode_job_id) } };
    // PrintNode retains idempotency keys for 24 hours. Old confirmation retries
    // must use the explicit reprint action rather than risk a second automatic job.
    const confirmedAt = new Date(order.payment_confirmed_at).getTime();
    if (!Number.isFinite(confirmedAt) || Date.now() - confirmedAt >= 23 * 60 * 60 * 1000) {
      return fail(409, "Automatic printing has expired for this payment. Check the printer, then use Print Packing Slip if needed.");
    }
  }
  const blocked = assertOrderPrintable(order);
  if (blocked) return fail(409, blocked);

  const printerReadiness = await getPrintNodePrinterReadiness({
    apiKey: config.apiKey,
    printerId: config.fulfillmentPrinterId,
  });
  const unavailableMessage = packingPrinterUnavailableMessage(printerReadiness);
  if (unavailableMessage) return fail(503, unavailableMessage);
  if (printerReadiness.available === null) {
    console.warn(`admin-print: packing printer readiness is ${printerReadiness.reason}; continuing with the print request`);
  }

  try {
    const bytes = await buildFulfillmentPdf(order);
    const jobId = await submitPrintNodeJob({
      printerId: config.fulfillmentPrinterId,
      title: `${order.order_number} - packing slip`,
      contentType: "pdf_base64",
      content: Buffer.from(bytes).toString("base64"),
      ...(automatic ? { idempotencyKey: `payment-packing-slip/${orderId}` } : {}),
    });
    const notification = await recordOrderPrintSubmission({
      supabase: auth.supabase,
      orderId,
      eventType: "FULFILLMENT_PACKET_PRINTED",
      actorUserId: auth.user.id,
      jobId,
      automatic,
    });
    console.info(`admin-print: staff ${auth.user.id} printed fulfillment ${order.order_number} as job ${jobId}`);
    return { status: 200, body: { printed: true, jobId, notification } };
  } catch (error) {
    console.error("admin-print: fulfillment print failed:", error);
    return fail(502, automatic ? "The packing-slip print could not be confirmed. Check the printer queue before using Print Packing Slip again." : "PrintNode could not print the packing slip.");
  }
}


function fail(status, error) {
  return { status, body: { printed: false, error } };
}

export function packingPrinterUnavailableMessage(printerReadiness) {
  if (printerReadiness.available !== false) return "";
  if (printerReadiness.reason === "printer_missing") {
    return "PrintNode cannot find the configured packing-slip printer. Check the fulfillment printer setting, then try again.";
  }
  if (printerReadiness.reason === "computer_disconnected") {
    return "The PrintNode computer for packing slips is disconnected. Open PrintNode on that computer and wait for it to reconnect, then try again.";
  }
  if (printerReadiness.reason === "printer_offline") {
    return "The packing-slip printer is offline. Turn it on and wait for it to show online in PrintNode, then try again.";
  }
  if (printerReadiness.reason === "authentication_failed") {
    return "PrintNode rejected the saved API key. Update PRINTNODE_API_KEY in Netlify before trying again.";
  }
  return "The packing-slip printer is not configured yet.";
}
