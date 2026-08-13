// Authenticated staff order queue. A normal Supabase access token is checked
// server-side and the user must have app_metadata.role admin/order_manager.

import { Buffer } from "node:buffer";
import {
  isOrderStatus,
} from "../../src/data/order-management.js";
import { authenticateOrderManager } from "./_shared/admin-auth.js";
import { jsonResponse, readJsonBody } from "./_shared/http.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4 * 1024;
const METHODS = "GET, PATCH, OPTIONS";
const ORDER_FIELDS = [
  "id", "order_number", "status", "items", "items_text", "subtotal",
  "discount_code", "discount_amount", "shipping", "total", "payment_method",
  "customer_name", "customer_email", "customer_phone", "ship_address",
  "ship_city", "ship_state", "ship_zip", "created_at", "updated_at",
  "payment_status", "fulfillment_status", "fulfillment_method",
  "payment_received_via", "payment_amount_received", "payment_confirmed_at",
].join(",");

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (!["GET", "PATCH"].includes(request.method)) return fail(405, "Method not allowed");

  const auth = await authenticateOrderManager(request, fail);
  if (auth.response) return auth.response;

  if (request.method === "GET") return listOrders(auth.supabase, new URL(request.url).searchParams);
  return updateOrderWorkflow(auth.supabase, auth.user, request);
}

async function listOrders(supabase, params) {
  const orderId = (params.get("orderId") || "").trim();
  if (orderId && !UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  const status = (params.get("status") || "").trim().toUpperCase();
  if (status && !isOrderStatus(status)) return fail(400, "Unknown order status filter.");

  const search = sanitiseSearch(params.get("q"));
  const limit = parseLimit(params.get("limit"));
  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return fail(400, "Invalid pagination cursor.");

  let query = supabase
    .from("orders")
    .select(ORDER_FIELDS, cursor ? {} : { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (orderId) query = query.eq("id", orderId).limit(1);
  if (status) query = query.eq("status", status);
  if (search) {
    const pattern = `%${search}%`;
    query = query.or([
      `order_number.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `customer_email.ilike.${pattern}`,
      `customer_phone.ilike.${pattern}`,
    ].join(","));
  }
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("admin-orders: list failed:", error);
    return fail(500, "Orders could not be loaded.");
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = !orderId && rows.length > limit;
  const orders = hasMore ? rows.slice(0, limit) : rows;
  let allocations;
  let shipments;
  try {
    [allocations, shipments] = await Promise.all([
      loadOrderAllocations(supabase, orders.map(order => order.id)),
      loadOrderShipments(supabase, orders.map(order => order.id)),
    ]);
  } catch (hydrationError) {
    console.error("admin-orders: related records failed:", hydrationError);
    return fail(500, "Order inventory and shipping details could not be loaded.");
  }
  const hydrated = orders.map(order => ({
    ...order,
    allocations: allocations.get(order.id) || [],
    shipment: shipments.get(order.id) || null,
  }));
  const nextCursor = hasMore && orders.length > 0 ? encodeCursor(orders[orders.length - 1]) : null;
  return jsonResponse(200, {
    orders: hydrated,
    nextCursor,
    total: cursor ? null : (count ?? hydrated.length),
  }, METHODS);
}

async function loadOrderAllocations(supabase, orderIds) {
  const grouped = new Map();
  if (orderIds.length === 0) return grouped;
  const { data, error } = await supabase
    .from("inventory_reservations")
    .select("order_id,product_id,quantity,state,inventory_lots(id,lot_number,supplier_batch_id,is_provisional,expires_on,storage_location)")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("admin-orders: allocation read failed:", error);
    throw new Error("Order inventory allocations could not be loaded.");
  }
  for (const allocation of data || []) {
    const list = grouped.get(allocation.order_id) || [];
    list.push({
      productId: allocation.product_id,
      quantity: allocation.quantity,
      state: allocation.state,
      lot: allocation.inventory_lots || null,
    });
    grouped.set(allocation.order_id, list);
  }
  return grouped;
}

async function loadOrderShipments(supabase, orderIds) {
  const grouped = new Map();
  if (orderIds.length === 0) return grouped;
  const { data, error } = await supabase
    .from("order_shipments")
    .select("order_id,status,carrier,service_name,postage_amount,currency,tracking_number,tracking_url,label_url,parcel,error_message")
    .in("order_id", orderIds);
  if (error) {
    console.error("admin-orders: shipment read failed:", error);
    throw new Error("Shipment details could not be loaded.");
  }
  for (const shipment of data || []) grouped.set(shipment.order_id, shipment);
  return grouped;
}

async function updateOrderWorkflow(supabase, user, request) {
  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);

  const orderId = typeof parsed.data?.orderId === "string" ? parsed.data.orderId.trim() : "";
  const action = typeof parsed.data?.action === "string" ? parsed.data.action.trim() : "";
  const expectedPaymentStatus = typeof parsed.data?.expectedPaymentStatus === "string"
    ? parsed.data.expectedPaymentStatus.trim().toUpperCase()
    : "";
  const expectedFulfillmentStatus = typeof parsed.data?.expectedFulfillmentStatus === "string"
    ? parsed.data.expectedFulfillmentStatus.trim().toUpperCase()
    : "";
  const fulfillmentMethod = typeof parsed.data?.fulfillmentMethod === "string"
    ? parsed.data.fulfillmentMethod.trim().toUpperCase()
    : "";
  const paymentReceivedVia = typeof parsed.data?.paymentReceivedVia === "string"
    ? parsed.data.paymentReceivedVia.trim()
    : "";
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  const rpc = workflowRpc(action, {
    orderId,
    expectedPaymentStatus,
    expectedFulfillmentStatus,
    fulfillmentMethod,
    paymentReceivedVia,
    paymentAmountReceived: parsed.data?.paymentAmountReceived,
    expectedPaymentAmount: parsed.data?.expectedPaymentAmount,
    actorUserId: user.id,
  });
  if (!rpc) return fail(400, "Choose a valid order action.");

  const { data, error } = await supabase.rpc(rpc.name, rpc.args);
  if (error) return workflowError(error, action);
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) return fail(404, "Order not found.");

  let allocations;
  let shipments;
  try {
    [allocations, shipments] = await Promise.all([
      loadOrderAllocations(supabase, [orderId]),
      loadOrderShipments(supabase, [orderId]),
    ]);
  } catch (hydrationError) {
    console.error("admin-orders: updated order hydration failed:", hydrationError);
    return fail(500, "The order was updated, but its related details could not be reloaded. Refresh the page.");
  }
  const order = {
    ...updated,
    allocations: allocations.get(orderId) || [],
    shipment: shipments.get(orderId) || null,
  };
  console.info(`admin-orders: staff ${user.id} performed ${action} on ${order.order_number}`);
  return jsonResponse(200, { order }, METHODS);
}

export function workflowRpc(action, input) {
  const fulfillmentMethod = input.fulfillmentMethod || "SHIP";
  const paymentReceivedVia = input.paymentReceivedVia || "Other";
  const paymentAmountReceived = parsePaymentAmount(input.paymentAmountReceived);
  if (action === "confirm_payment"
      && input.expectedPaymentStatus === "AWAITING_PAYMENT"
      && ["SHIP", "LOCAL_HANDOFF"].includes(fulfillmentMethod)
      && ["Cash App", "Venmo", "Cash", "Other"].includes(paymentReceivedVia)
      && paymentAmountReceived !== null) {
    return {
      name: "confirm_order_payment",
      args: {
        p_order_id: input.orderId,
        p_expected_payment_status: input.expectedPaymentStatus,
        p_fulfillment_method: fulfillmentMethod,
        p_payment_received_via: paymentReceivedVia,
        p_payment_amount_received: paymentAmountReceived,
        p_actor_user_id: input.actorUserId,
      },
    };
  }
  const expectedPaymentAmount = parsePaymentAmount(input.expectedPaymentAmount);
  if (action === "update_payment_amount"
      && input.expectedPaymentStatus === "PAID"
      && paymentAmountReceived !== null
      && expectedPaymentAmount !== null) {
    return {
      name: "update_order_payment_amount",
      args: {
        p_order_id: input.orderId,
        p_expected_payment_amount: expectedPaymentAmount,
        p_payment_amount_received: paymentAmountReceived,
        p_actor_user_id: input.actorUserId,
      },
    };
  }
  if (action === "cancel_unpaid" && input.expectedPaymentStatus === "AWAITING_PAYMENT") {
    return {
      name: "cancel_unpaid_order",
      args: {
        p_order_id: input.orderId,
        p_expected_payment_status: input.expectedPaymentStatus,
        p_actor_user_id: input.actorUserId,
      },
    };
  }
  const targets = { mark_picked: "PICKED", mark_packed: "PACKED", mark_handed_off: "DELIVERED" };
  if (targets[action] && /^[A-Z_]{3,30}$/.test(input.expectedFulfillmentStatus)) {
    return {
      name: "advance_order_fulfillment",
      args: {
        p_order_id: input.orderId,
        p_expected_fulfillment_status: input.expectedFulfillmentStatus,
        p_target_fulfillment_status: targets[action],
        p_actor_user_id: input.actorUserId,
      },
    };
  }
  return null;
}

function workflowError(error, action) {
  const message = String(error?.message || "");
  if (message.includes("insufficient_inventory:")) {
    return fail(409, "There is not enough available inventory to confirm this payment.");
  }
  if (message.includes("status_conflict") || message.includes("order_payment_status_conflict")) {
    return fail(409, "Someone else updated this order. Refresh it before trying again.");
  }
  if (message.includes("payment_amount_conflict")) {
    return fail(409, "The recorded payment amount changed. Refresh the order before correcting it.");
  }
  if (message.includes("paid_order_requires_refund")) {
    return fail(409, "A paid order cannot be cancelled as unpaid. Use the refund workflow instead.");
  }
  if (message.includes("invalid_fulfillment_method")
      || message.includes("invalid_payment_received_via")
      || message.includes("invalid_payment_amount")
      || message.includes("invalid_fulfillment_transition")) {
    return fail(400, "Choose a valid payment amount, payment method, and fulfillment option.");
  }
  if (message.includes("inventory_counter_mismatch") || message.includes("inventory_reservation_mismatch")) {
    console.error(`admin-orders: inventory integrity error during ${action}:`, error);
    return fail(409, "Inventory needs review before this order can move forward.");
  }
  console.error(`admin-orders: ${action} failed:`, error);
  return fail(500, "The order could not be updated.");
}

export function parsePaymentAmount(value) {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "" || raw === null || raw === undefined) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount >= 100000000) return null;
  const cents = Math.round(amount * 100);
  if (Math.abs((amount * 100) - cents) > 0.000001) return null;
  return cents / 100;
}

export function sanitiseSearch(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-z0-9@._+\-\s]/gi, "").trim().slice(0, 80);
}

export function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(10, parsed));
}

export function encodeCursor(order) {
  return Buffer.from(JSON.stringify({
    createdAt: new Date(order.created_at).toISOString(),
    id: order.id,
  })).toString("base64url");
}

export function decodeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!UUID_PATTERN.test(parsed?.id)) return null;
    const timestamp = new Date(parsed?.createdAt);
    if (Number.isNaN(timestamp.getTime())) return null;
    return { id: parsed.id, createdAt: timestamp.toISOString() };
  } catch {
    return null;
  }
}

export const config = {
  path: "/.netlify/functions/admin-orders",
  rateLimit: {
    windowLimit: 180,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}
