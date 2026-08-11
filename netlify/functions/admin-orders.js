// Staff order-management endpoint.
//
// GET   returns a filtered, cursor-paginated order queue.
// PATCH changes one status, provided it has not changed since the staff member
//       loaded it. That comparison prevents two people from silently
//       overwriting each other's work.
//
// The browser never receives the service-role key. Every request presents a
// normal Supabase access token, which is checked server-side, and the user must
// carry `app_metadata.role = "admin" | "order_manager"`.

import { createClient } from "@supabase/supabase-js";
import { hasOrderManagerRole, isOrderStatus } from "../../src/data/order-management.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_FIELDS = [
  "id",
  "order_number",
  "status",
  "items",
  "items_text",
  "subtotal",
  "discount_code",
  "discount_amount",
  "shipping",
  "total",
  "payment_method",
  "customer_name",
  "customer_email",
  "customer_phone",
  "ship_address",
  "ship_city",
  "ship_state",
  "ship_zip",
  "created_at",
].join(",");

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, null);
  }
  if (event.httpMethod !== "GET" && event.httpMethod !== "PATCH") {
    return fail(405, "Method not allowed");
  }

  const auth = await authenticateOrderManager(event);
  if (auth.response) return auth.response;

  if (event.httpMethod === "GET") return listOrders(auth.supabase, event);
  return updateOrderStatus(auth.supabase, auth.user, event);
};

async function authenticateOrderManager(event) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("admin-orders: Supabase env vars missing");
    return { response: fail(500, "Order management is not configured.") };
  }

  const token = readBearerToken(event.headers);
  if (!token) return { response: fail(401, "Sign in to manage orders.") };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { response: fail(401, "Your session has expired. Sign in again.") };
  }
  if (!data.user.email_confirmed_at) {
    return { response: fail(403, "Confirm this account's email before managing orders.") };
  }
  if (!hasOrderManagerRole(data.user)) {
    console.warn(`admin-orders: forbidden user ${data.user.id}`);
    return { response: fail(403, "This account does not have order-management access.") };
  }

  return { supabase, user: data.user };
}

async function listOrders(supabase, event) {
  const params = event.queryStringParameters || {};
  const status = typeof params.status === "string" ? params.status.trim().toUpperCase() : "";
  if (status && !isOrderStatus(status)) return fail(400, "Unknown order status filter.");

  const search = sanitiseSearch(params.q);
  const limit = parseLimit(params.limit);
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  if (params.cursor && !cursor) return fail(400, "Invalid pagination cursor.");

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
    // Both values are strictly validated in decodeCursor before being placed
    // into PostgREST's raw `or` expression.
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("admin-orders: list failed:", error);
    return fail(500, "Orders could not be loaded.");
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > limit;
  const orders = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && orders.length > 0
    ? encodeCursor(orders[orders.length - 1])
    : null;

  return response(200, {
    orders,
    nextCursor,
    total: cursor ? null : (count ?? orders.length),
  });
}

async function updateOrderStatus(supabase, user, event) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return fail(400, "Invalid request.");
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
  const expectedStatus = typeof body.expectedStatus === "string"
    ? body.expectedStatus.trim().slice(0, 64)
    : "";

  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  if (!isOrderStatus(status)) return fail(400, "Choose a valid order status.");
  if (!expectedStatus) return fail(400, "The order's current status is required.");
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
    return response(409, {
      error: "Someone else updated this order. Its current status has been loaded; review it and try again.",
      order: current,
    });
  }

  console.info(
    `admin-orders: ${user.id} (${user.email || "no-email"}) changed ` +
    `${updated.order_number} from ${expectedStatus} to ${status}`
  );
  return response(200, { order: updated });
}

function readBearerToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

export function sanitiseSearch(value) {
  if (typeof value !== "string") return "";
  // Commas, parentheses, quotes, and wildcard characters are deliberately
  // excluded because Supabase's `.or()` argument is raw PostgREST syntax.
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

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "https://www.tierone.bio",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      Vary: "Origin, Authorization",
    },
    body: payload === null ? "" : JSON.stringify(payload),
  };
}

function fail(statusCode, message) {
  return response(statusCode, { error: message });
}
