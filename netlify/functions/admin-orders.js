// Authenticated staff order queue. A normal Supabase access token is checked
// server-side and the user must have app_metadata.role admin/order_manager.

import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import {
  canDeleteOrder,
  hasOrderManagerRole,
  isOrderStatus,
} from "../../src/data/order-management.js";
import { getEnv, jsonResponse, readBearerToken, readJsonBody } from "./_shared/http.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4 * 1024;
const METHODS = "GET, PATCH, DELETE, OPTIONS";
const ORDER_FIELDS = [
  "id", "order_number", "status", "items", "items_text", "subtotal",
  "discount_code", "discount_amount", "shipping", "total", "payment_method",
  "customer_name", "customer_email", "customer_phone", "ship_address",
  "ship_city", "ship_state", "ship_zip", "created_at",
].join(",");

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (!["GET", "PATCH", "DELETE"].includes(request.method)) return fail(405, "Method not allowed");

  const auth = await authenticateOrderManager(request);
  if (auth.response) return auth.response;

  if (request.method === "GET") return listOrders(auth.supabase, new URL(request.url).searchParams);
  if (request.method === "PATCH") return updateOrderStatus(auth.supabase, auth.user, request);
  return deleteOrder(auth.supabase, auth.user, request);
}

async function authenticateOrderManager(request) {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("admin-orders: Supabase env vars missing");
    return { response: fail(500, "Order management is not configured.") };
  }

  const token = readBearerToken(request);
  if (!token) return { response: fail(401, "Sign in to manage orders.") };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { response: fail(401, "Your session has expired. Sign in again.") };
  if (!data.user.email_confirmed_at) {
    return { response: fail(403, "Confirm this account's email before managing orders.") };
  }
  if (!hasOrderManagerRole(data.user)) {
    console.warn(`admin-orders: forbidden user ${data.user.id}`);
    return { response: fail(403, "This account does not have order-management access.") };
  }
  return { supabase, user: data.user };
}

async function listOrders(supabase, params) {
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
  const hasMore = rows.length > limit;
  const orders = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && orders.length > 0 ? encodeCursor(orders[orders.length - 1]) : null;
  return jsonResponse(200, { orders, nextCursor, total: cursor ? null : (count ?? orders.length) }, METHODS);
}

async function updateOrderStatus(supabase, user, request) {
  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);

  const orderId = typeof parsed.data?.orderId === "string" ? parsed.data.orderId.trim() : "";
  const status = typeof parsed.data?.status === "string" ? parsed.data.status.trim().toUpperCase() : "";
  const expectedStatus = typeof parsed.data?.expectedStatus === "string"
    ? parsed.data.expectedStatus.trim().toUpperCase()
    : "";
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  if (!isOrderStatus(status)) return fail(400, "Choose a valid order status.");
  if (!isOrderStatus(expectedStatus)) return fail(400, "The order's current status is invalid.");
  if (status === expectedStatus) return fail(400, "Choose a different status.");

  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("status", expectedStatus)
    .select(ORDER_FIELDS)
    .maybeSingle();
  if (error) {
    console.error("admin-orders: update failed:", error);
    return fail(500, "The order status could not be updated.");
  }

  if (!updated) {
    const { data: current, error: readError } = await supabase
      .from("orders")
      .select(ORDER_FIELDS)
      .eq("id", orderId)
      .maybeSingle();
    if (readError) {
      console.error("admin-orders: conflict read failed:", readError);
      return fail(500, "The order status could not be confirmed.");
    }
    if (!current) return fail(404, "Order not found.");
    return jsonResponse(409, {
      error: "Someone else updated this order. Its current status has been loaded; review it and try again.",
      order: current,
    }, METHODS);
  }

  console.info(`admin-orders: staff ${user.id} changed ${updated.order_number} from ${expectedStatus} to ${status}`);
  return jsonResponse(200, { order: updated }, METHODS);
}

async function deleteOrder(supabase, user, request) {
  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);

  const orderId = typeof parsed.data?.orderId === "string" ? parsed.data.orderId.trim() : "";
  const expectedOrderNumber = typeof parsed.data?.expectedOrderNumber === "string"
    ? parsed.data.expectedOrderNumber.trim()
    : "";
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  if (!/^[A-Z0-9_-]{1,64}$/i.test(expectedOrderNumber)) return fail(400, "Invalid order number.");

  // All three filters are part of the DELETE itself. If the order changes after
  // the confirmation dialog opens, the stale request deletes nothing.
  const { data: deleted, error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("order_number", expectedOrderNumber)
    .eq("status", "CANCELLED")
    .select(ORDER_FIELDS)
    .maybeSingle();
  if (error) {
    console.error("admin-orders: delete failed:", error);
    return fail(500, "The order could not be deleted.");
  }

  if (!deleted) {
    const { data: current, error: readError } = await supabase
      .from("orders")
      .select(ORDER_FIELDS)
      .eq("id", orderId)
      .maybeSingle();
    if (readError) {
      console.error("admin-orders: delete conflict read failed:", readError);
      return fail(500, "The order could not be confirmed.");
    }
    if (!current) return fail(404, "This order no longer exists.");
    if (!canDeleteOrder(current.status)) {
      return jsonResponse(409, {
        error: "Only cancelled orders can be deleted. The current order has been reloaded.",
        order: current,
      }, METHODS);
    }
    return jsonResponse(409, {
      error: "This order changed while you were viewing it. Reload it before deleting.",
      order: current,
    }, METHODS);
  }

  console.info(`admin-orders: staff ${user.id} permanently deleted cancelled order ${deleted.order_number}`);
  return jsonResponse(200, {
    deletedOrder: {
      id: deleted.id,
      orderNumber: deleted.order_number,
    },
  }, METHODS);
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

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}
