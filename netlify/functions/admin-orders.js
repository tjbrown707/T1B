// Netlify Function: lets the shop owner read every order and move one through
// its status lifecycle, without opening the Supabase dashboard.
//
// WHY THIS IS A SERVER FUNCTION
// -----------------------------
// The orders table allows a customer to SELECT only their own rows and has no
// UPDATE policy at all. That is the right shape for customers, and it means the
// browser cannot do this job no matter who is signed in. So the work happens
// here with the service-role key — which makes this file solely responsible for
// deciding who is allowed to ask.
//
// Authorisation is an explicit allowlist of addresses in ADMIN_EMAILS, checked
// against the server's own view of the caller: the session token is exchanged
// for a user record here rather than trusting any field the browser sent.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   ADMIN_EMAILS — comma-separated. Unset or empty means nobody has access.

import { createClient } from "@supabase/supabase-js";
import { isAdminEmail, isValidStatus, normalizeStatus } from "../../src/data/order-status.js";

// Explicit rather than "*": the column list is the contract with the admin
// page, so a column added to the table later cannot start flowing to the
// browser without someone deciding it should.
const ORDER_FIELDS = [
  "id", "order_number", "status", "created_at",
  "items", "items_text",
  "subtotal", "discount_code", "discount_amount", "shipping", "total",
  "payment_method",
  "customer_name", "customer_email", "customer_phone",
  "ship_address", "ship_city", "ship_state", "ship_zip",
].join(", ");

// A small shop's whole history fits comfortably; the cap only exists so this
// can never try to serialise an unbounded table into one response.
const MAX_ORDERS = 500;

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return fail(405, "Method not allowed");
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("admin-orders: Supabase env vars missing");
    return fail(500, "Unavailable");
  }

  const token = (event.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail(401, "Not signed in");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return fail(401, "Not signed in");

  // A confirmed address is part of the check, not a formality. If signup
  // confirmation were ever switched off in Supabase, anyone could register the
  // owner's address and be handed the allowlist along with it.
  if (!user.email_confirmed_at) return fail(403, "Not authorised");

  if (!isAdminEmail(user.email, ADMIN_EMAILS)) {
    // Logged so a genuine lockout (a typo in ADMIN_EMAILS) is diagnosable from
    // the function log rather than guessed at.
    console.warn(`admin-orders: refused ${user.email}`);
    return fail(403, "Not authorised");
  }

  if (event.httpMethod === "GET") {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_FIELDS)
      .order("created_at", { ascending: false })
      .limit(MAX_ORDERS);
    if (error) {
      console.error("admin-orders: list failed:", error);
      return fail(500, "Could not load orders");
    }
    return ok({ orders: data || [] });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return fail(400, "Invalid request");
  }

  const orderNumber = String(body.orderNumber || "").trim().slice(0, 32);
  const status = normalizeStatus(body.status);
  if (!orderNumber) return fail(400, "Which order?");
  if (!isValidStatus(status)) return fail(400, "That is not a status this shop uses.");

  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("order_number", orderNumber)
    .select(ORDER_FIELDS);

  if (error) {
    console.error("admin-orders: update failed:", error);
    return fail(500, "Could not update that order");
  }
  // order_number is UNIQUE, so zero rows means no such order rather than a
  // partial update.
  if (!Array.isArray(data) || data.length === 0) return fail(404, "No order with that number");

  // Money changed meaning here. The function log is the only record of who did
  // it, so it is worth a line.
  console.log(`admin-orders: ${user.email} set ${orderNumber} to ${status}`);
  return ok({ order: data[0] });
};

function ok(payload) {
  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, ...payload }) };
}

function fail(statusCode, error) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify({ ok: false, error }) };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "https://www.tierone.bio",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}
