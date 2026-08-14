// Server-authoritative order creation. The browser supplies only customer
// details, product ids, quantities and requested discount codes. Prices are
// recomputed from the catalog, then the order insert and personal-code
// redemption happen in one Postgres transaction.

import { createClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../../src/data/catalog.js";
import { MAX_CART_QUANTITY } from "../../src/data/cart.js";
import { isSaleActive } from "../../src/data/pricing.js";
import { orderTotals, orderLineItems, isShippingDiscountCode } from "../../src/data/order-totals.js";
import { getEnv, jsonResponse, readBearerToken, readJsonBody } from "./_shared/http.js";

const MAX_BODY_BYTES = 32 * 1024;
const ORDER_NUMBER_PATTERN = /^T1B-\d{6}-\d{6}$/;
const CODE_PATTERN = /^[A-Z0-9_@-]{1,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOMER_LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  address: 200,
  city: 100,
  state: 100,
  zip: 20,
};

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, "POST, OPTIONS");
  if (request.method !== "POST") return fail(405, "Method not allowed");

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);

  const validated = validateOrderRequest(parsed.data);
  if (validated.error) return fail(400, validated.error);
  const input = validated.data;

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("create-order: Supabase env vars missing");
    return fail(500, "Order system unavailable. Please contact sales@tierone.bio.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId = null;
  const token = readBearerToken(request);
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return fail(401, "Your session has expired. Please sign in again.");
    userId = data.user.id;
  }

  let discount = null;
  let personalDiscountCode = null;
  let freeShipping = false;
  for (const code of input.discountCodes) {
    const resolved = await resolveDiscount(supabase, code, userId, input.orderNumber);
    if (!resolved) return fail(400, `Discount code ${code} is not valid.`);
    if (resolved.type === "shipping") {
      freeShipping = true;
    } else {
      if (discount) return fail(400, "Only one discount code can be applied to an order.");
      discount = resolved;
      if (resolved.source === "personal") personalDiscountCode = code;
    }
  }

  const totals = orderTotals(input.items, { discount, freeShipping });
  const lineItems = orderLineItems(input.items);
  const itemsText = lineItems
    .map(line => `${line.name} ${line.dose} x${line.qty} @ $${line.unitPrice.toFixed(2)}${line.bulk ? " (bulk)" : ""} = $${line.lineTotal.toFixed(2)}`)
    .join("\n");

  const row = {
    user_id: userId,
    order_number: input.orderNumber,
    status: "AWAITING PAYMENT",
    items: lineItems,
    items_text: itemsText,
    subtotal: totals.subtotal,
    discount_code: input.discountCodes.join(", ") || null,
    discount_amount: totals.discountAmount,
    shipping: totals.shipping,
    total: totals.total,
    payment_method: input.paymentMethod,
    customer_name: input.customer.name,
    customer_email: input.customer.email,
    customer_phone: input.customer.phone,
    ship_address: input.customer.address,
    ship_city: input.customer.city,
    ship_state: input.customer.state,
    ship_zip: input.customer.zip,
  };

  const { data, error } = await supabase.rpc("create_order_transaction", {
    order_payload: row,
    personal_discount_code: personalDiscountCode,
  });
  if (error) {
    if (String(error.message).includes("discount_code_not_redeemable")) {
      return fail(409, "That personal discount code was just used or has expired. Please review your order.");
    }
    if (String(error.message).includes("insufficient_inventory:")) {
      const productId = String(error.message).split("insufficient_inventory:")[1]?.split(/\s|\n/)[0] || "";
      const product = PRODUCTS.find(entry => entry.id === productId);
      return fail(409, `${product ? `${product.name} ${product.dose}` : "One item"} no longer has enough available inventory for this order.`);
    }
    console.error("create-order: transaction failed:", error);
    return fail(500, "We could not save your order. Please try again.");
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) {
    console.error("create-order: transaction returned no order");
    return fail(500, "We could not confirm your order. Please try again.");
  }

  // The order number is generated in the browser and can be replayed. Only
  // return an existing order when every immutable field exactly matches this
  // request; otherwise a collision could disclose another customer's order.
  if (!ordersMatch(saved, row)) {
    console.error(`create-order: order number collision for ${input.orderNumber}`);
    return fail(409, "That order reference is already in use. Please start a new order.");
  }

  return jsonResponse(200, {
    ok: true,
    orderNumber: saved.order_number,
    status: saved.status,
    discountCode: saved.discount_code || "",
    totals: {
      subtotal: Number(saved.subtotal),
      discountAmount: Number(saved.discount_amount),
      shipping: Number(saved.shipping),
      total: Number(saved.total),
    },
    itemsText: saved.items_text || "",
    items: Array.isArray(saved.items) ? saved.items : [],
  }, "POST, OPTIONS");
}

export function validateOrderRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid request." };

  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) return { error: "Invalid order reference." };
  if (body.researchAcknowledged !== true) return { error: "The research-use acknowledgement is required." };

  const sourceCustomer = body.customer && typeof body.customer === "object" && !Array.isArray(body.customer)
    ? body.customer
    : {};
  const customer = {};
  for (const [field, maxLength] of Object.entries(CUSTOMER_LIMITS)) {
    const value = typeof sourceCustomer[field] === "string" ? sourceCustomer[field].trim() : "";
    if (!value) return { error: "Shipping details are incomplete." };
    if (value.length > maxLength) return { error: "One or more shipping details are too long." };
    customer[field] = value;
  }
  if (!EMAIL_PATTERN.test(customer.email)) return { error: "Enter a valid email address." };

  if (!Array.isArray(body.items) || body.items.length === 0) return { error: "Your cart is empty." };
  if (body.items.length > PRODUCTS.length) return { error: "Your cart contains too many items." };
  const items = [];
  const seenIds = new Set();
  for (const raw of body.items) {
    const product = PRODUCTS.find(productEntry => productEntry.id === raw?.id);
    if (!product) return { error: "Your cart contains an item we no longer stock." };
    const qty = Number(raw?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_CART_QUANTITY) {
      return { error: `Quantity for ${product.name} is not valid.` };
    }
    if (seenIds.has(product.id)) return { error: "Your cart lists the same item twice." };
    seenIds.add(product.id);
    items.push({ id: product.id, qty });
  }

  if (body.paymentMethod !== "cashapp" && body.paymentMethod !== "venmo") {
    return { error: "Choose Cash App or Venmo as the payment method." };
  }
  const paymentMethod = body.paymentMethod === "venmo" ? "Venmo" : "Cash App";

  const rawCodes = body.discountCodes ?? [];
  if (!Array.isArray(rawCodes) || rawCodes.length > 2) return { error: "Too many discount codes were supplied." };
  const discountCodes = [];
  for (const rawCode of rawCodes) {
    if (typeof rawCode !== "string") return { error: "Invalid discount code." };
    const code = rawCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) return { error: "Invalid discount code." };
    if (!discountCodes.includes(code)) discountCodes.push(code);
  }

  return { data: { orderNumber, customer, items, paymentMethod, discountCodes } };
}

export function ordersMatch(saved, expected) {
  const fields = [
    "user_id", "order_number", "items_text", "discount_code", "payment_method",
    "customer_name", "customer_email", "customer_phone", "ship_address",
    "ship_city", "ship_state", "ship_zip",
  ];
  if (fields.some(field => (saved[field] ?? null) !== (expected[field] ?? null))) return false;

  const moneyFields = ["subtotal", "discount_amount", "shipping", "total"];
  if (moneyFields.some(field => Math.round(Number(saved[field]) * 100) !== Math.round(Number(expected[field]) * 100))) {
    return false;
  }
  return canonicalJson(saved.items) === canonicalJson(expected.items);
}

async function resolveDiscount(supabase, code, userId, orderNumber) {
  if (isSaleActive()) return null;

  const sitewideCodes = readSitewideCodes();
  if (!sitewideCodes) return null;
  const sitewide = sitewideCodes[code];
  if (isShippingDiscountCode(code)) {
    return sitewide && typeof sitewide === "object"
      ? { type: "shipping", value: 0, source: "sitewide" }
      : null;
  }
  if (sitewide && typeof sitewide === "object") return normalise(sitewide, "sitewide");

  if (!userId) return null;
  const { data, error } = await supabase
    .from("discount_codes")
    .select("code, type, value, expires_at, redeemed_at, order_number")
    .eq("code", code)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !canUsePersonalDiscount(data, orderNumber)) return null;
  return normalise(data, "personal");
}

export function canUsePersonalDiscount(discount, orderNumber, now = Date.now()) {
  if (!discount) return false;
  // A response can be lost after the transaction commits. Let that exact order
  // resume; the transaction's conflict path will not redeem the code again.
  if (discount.redeemed_at) return discount.order_number === orderNumber;
  if (!discount.expires_at) return true;
  const expiry = new Date(discount.expires_at).getTime();
  return Number.isFinite(expiry) && expiry > now;
}

function normalise(match, source) {
  const type = match.type === "fixed" ? "fixed" : "percent";
  const value = Number(match.value);
  if (!Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100)) return null;
  return { type, value, source };
}

function readSitewideCodes() {
  try {
    const parsed = JSON.parse(getEnv("DISCOUNT_CODES") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("create-order: DISCOUNT_CODES is not valid JSON:", error);
    return null;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(status, error) {
  return jsonResponse(status, { ok: false, error }, "POST, OPTIONS");
}

export const config = {
  path: "/.netlify/functions/create-order",
  rateLimit: {
    windowLimit: 8,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
