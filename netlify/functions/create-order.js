// Netlify Function: records an order, and is the authority on what it costs.
//
// WHY THIS EXISTS
// ---------------
// Checkout used to compute every figure in the browser and insert the result
// straight into Supabase. Two problems followed from that:
//
//   1. Prices were whatever the browser said they were. The cart lives in
//      localStorage and the page is the customer's own, so the subtotal, the
//      discount and the total reaching the owner's fulfilment notification
//      could all be edited before they were sent.
//
//   2. Confirming twice created two orders. The retry guard was an in-memory
//      React ref, which does not survive a refresh, a closed tab, or a second
//      device.
//
// So this function ignores every monetary value in the request and recomputes
// all of them from the catalog, and writes through a UNIQUE constraint on
// order_number so a replay returns the original order instead of making a new
// one. The client is told the order exists only when it really does.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   DISCOUNT_CODES (optional — sitewide codes, same JSON as validate-discount)

import { createClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../../src/data/catalog.js";
import { MAX_CART_QUANTITY } from "../../src/data/cart.js";
import { isSaleActive } from "../../src/data/pricing.js";
import { orderTotals, orderLineItems, isShippingDiscountCode } from "../../src/data/order-totals.js";

const ORDER_NUMBER_PATTERN = /^T1B-\d{6}-\d{6}$/;
const REQUIRED_CUSTOMER_FIELDS = ["name", "email", "phone", "address", "city", "state", "zip"];

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return fail(405, "Method not allowed");
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return fail(400, "Invalid request");
  }

  // ── Validate the request ────────────────────────────────────────────────
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) return fail(400, "Invalid order reference.");

  // The acknowledgement is a condition of sale, so it is enforced here and not
  // only in the UI, where it could simply be skipped.
  if (body.researchAcknowledged !== true) {
    return fail(400, "The research-use acknowledgement is required.");
  }

  const customer = body.customer && typeof body.customer === "object" ? body.customer : {};
  for (const field of REQUIRED_CUSTOMER_FIELDS) {
    if (typeof customer[field] !== "string" || !customer[field].trim()) {
      return fail(400, "Shipping details are incomplete.");
    }
  }

  // Only ids and quantities are read from the request. Everything else the
  // client sent about these items — names, doses, prices — is discarded.
  if (!Array.isArray(body.items) || body.items.length === 0) return fail(400, "Your cart is empty.");
  const items = [];
  for (const raw of body.items) {
    const product = PRODUCTS.find(p => p.id === raw?.id);
    if (!product) return fail(400, "Your cart contains an item we no longer stock.");
    const qty = Number(raw?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_CART_QUANTITY) {
      return fail(400, `Quantity for ${product.name} is not valid.`);
    }
    if (items.some(i => i.id === product.id)) return fail(400, "Your cart lists the same item twice.");
    items.push({ id: product.id, qty });
  }

  const paymentMethod = body.paymentMethod === "venmo" ? "Venmo" : "Cash App";

  // Connect only once the request itself is known to be well-formed, so a bad
  // request is answered with a 400 that says what is wrong rather than a 500.
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("create-order: Supabase env vars missing");
    return fail(500, "Order system unavailable. Please contact sales@tierone.bio.");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Who is ordering ─────────────────────────────────────────────────────
  // A token is optional: guests check out too, and orders.user_id is nullable,
  // so a guest order still gets a durable record.
  let userId = null;
  const token = (event.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return fail(401, "Your session has expired. Please sign in again.");
    userId = data.user.id;
  }

  // ── Resolve discounts server-side ───────────────────────────────────────
  let discount = null;
  let freeShipping = false;
  const codes = [...new Set((Array.isArray(body.discountCodes) ? body.discountCodes : [])
    .filter(c => typeof c === "string" && c.trim())
    .map(c => c.trim().toUpperCase()))];

  for (const code of codes) {
    const resolved = await resolveDiscount(supabase, code, userId);
    if (!resolved) return fail(400, `Discount code ${code} is not valid.`);
    if (isShippingDiscountCode(code)) {
      freeShipping = true;
    } else {
      if (discount) return fail(400, "Only one discount code can be applied to an order.");
      discount = resolved;
    }
  }

  // ── Recompute every figure ──────────────────────────────────────────────
  const totals = orderTotals(items, { discount, freeShipping });
  const lineItems = orderLineItems(items);
  const itemsText = lineItems
    .map(l => `${l.name} ${l.dose} x${l.qty} @ $${l.unitPrice.toFixed(2)}${l.bulk ? " (bulk)" : ""} = $${l.lineTotal.toFixed(2)}`)
    .join("\n");

  // ── Write, idempotently ─────────────────────────────────────────────────
  // ignoreDuplicates leans on the UNIQUE (order_number) constraint: a replayed
  // confirmation inserts nothing and the original row is read back below.
  const row = {
    user_id: userId,
    order_number: orderNumber,
    // The customer has said they sent payment; nobody has verified it landed.
    // Recording that honestly is the difference between an order the owner
    // knows to reconcile and one that looks already settled.
    status: "AWAITING PAYMENT",
    items: lineItems,
    items_text: itemsText,
    subtotal: totals.subtotal,
    discount_code: codes.join(", ") || null,
    discount_amount: totals.discountAmount,
    shipping: totals.shipping,
    total: totals.total,
    payment_method: paymentMethod,
    customer_name: customer.name.trim(),
    customer_email: customer.email.trim(),
    customer_phone: customer.phone.trim(),
    ship_address: customer.address.trim(),
    ship_city: customer.city.trim(),
    ship_state: customer.state.trim(),
    ship_zip: customer.zip.trim(),
  };

  const { error: writeError } = await supabase
    .from("orders")
    .upsert(row, { onConflict: "order_number", ignoreDuplicates: true });

  if (writeError) {
    console.error("create-order: write failed:", writeError);
    return fail(500, "We could not save your order. Please try again.");
  }

  // Read back so success is only reported for a row that genuinely exists.
  const { data: saved, error: readError } = await supabase
    .from("orders")
    .select("order_number, total, subtotal, discount_amount, shipping, created_at, user_id")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (readError || !saved) {
    console.error("create-order: readback failed:", readError);
    return fail(500, "We could not confirm your order. Please try again.");
  }

  // If the stored row belongs to somebody else, this order number collided
  // with an existing one. Say so rather than showing another customer's total.
  if (saved.user_id && userId && saved.user_id !== userId) {
    console.error(`create-order: order number ${orderNumber} belongs to another user`);
    return fail(409, "That order reference is already in use. Please start a new order.");
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      ok: true,
      orderNumber: saved.order_number,
      // The authoritative figures, for the confirmation screen and the receipt.
      totals: {
        subtotal: Number(saved.subtotal),
        discountAmount: Number(saved.discount_amount),
        shipping: Number(saved.shipping),
        total: Number(saved.total),
      },
      itemsText,
      items: lineItems,
    }),
  };
};

// Mirrors validate-discount: sitewide codes come from the DISCOUNT_CODES env
// var, personal codes from the discount_codes table and are bound to a user.
// Returns { type, value } or null.
async function resolveDiscount(supabase, code, userId) {
  // Discount codes are disabled while a sitewide sale is running, matching the
  // cart. Without this a customer could stack a code on top of a sale by
  // calling this endpoint directly.
  if (isSaleActive()) return null;

  if (isShippingDiscountCode(code)) {
    // Shipping codes waive postage; they carry no monetary value of their own.
    const sitewide = readSitewideCodes()[code];
    return sitewide ? { type: "shipping", value: 0 } : null;
  }

  const sitewide = readSitewideCodes()[code];
  if (sitewide && typeof sitewide === "object") return normalise(sitewide);

  if (!userId) return null;
  const { data, error } = await supabase
    .from("discount_codes")
    .select("code, type, value, expires_at, redeemed_at")
    .eq("code", code)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.redeemed_at) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return normalise(data);
}

function normalise(match) {
  const type = match.type === "fixed" ? "fixed" : "percent";
  const value = Number(match.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type, value };
}

function readSitewideCodes() {
  try {
    return JSON.parse(process.env.DISCOUNT_CODES || "{}");
  } catch (err) {
    console.error("create-order: DISCOUNT_CODES is not valid JSON:", err);
    return {};
  }
}

function fail(statusCode, error) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify({ ok: false, error }) };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    // Only our own site may call this endpoint from a browser.
    "Access-Control-Allow-Origin": "https://www.tierone.bio",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
