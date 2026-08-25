import { readFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "./http.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8000;
const STAFF_NOTIFICATION_EMAIL = "sales@tierone.bio";
const SENDER = "Tier One BioSystems <noreply@tierone.bio>";

let cachedReceiptTemplate = null;

function loadReceiptTemplate() {
  if (cachedReceiptTemplate) return cachedReceiptTemplate;
  const candidates = [
    path.join(process.cwd(), "email-template.html"),
    path.join(process.cwd(), "..", "email-template.html"),
    path.resolve("email-template.html"),
  ];
  for (const candidate of candidates) {
    try {
      cachedReceiptTemplate = readFileSync(candidate, "utf8");
      return cachedReceiptTemplate;
    } catch {
      // Netlify and local tests use different working directories.
    }
  }
  throw new Error("email-template.html not found in the function bundle");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("Order email contains an invalid amount.");
  return `$${amount.toFixed(2)}`;
}

function orderEmailValues(order) {
  const discountCode = order.discount_code || "";
  const discountAmount = Number(order.discount_amount);
  return {
    customerName: order.customer_name || "Research Customer",
    customerEmail: order.customer_email || "",
    customerPhone: order.customer_phone || "",
    orderNumber: order.order_number || "",
    orderItems: order.items_text || "",
    orderSubtotal: money(order.subtotal),
    discountCode,
    discountAmount: discountAmount > 0 ? `-${money(discountAmount)}` : "",
    shipping: Number(order.shipping) === 0 ? "FREE" : money(order.shipping),
    paymentMethod: order.payment_method || "",
    orderTotal: money(order.total),
    shippingAddress: order.ship_address || "",
    shippingCity: order.ship_city || "",
    shippingState: order.ship_state || "",
    shippingZip: order.ship_zip || "",
  };
}

export function renderOrderReceipt(order, template = loadReceiptTemplate()) {
  const values = orderEmailValues(order);
  let html = template.replace(
    /\{\{#discountCode\}\}([\s\S]*?)\{\{\/discountCode\}\}/g,
    values.discountCode ? "$1" : "",
  );
  const escaped = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]),
  );
  escaped.orderItems = escaped.orderItems.replace(/\r?\n/g, "<br>");
  html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(escaped, key) ? escaped[key] : match
  ));
  return html;
}

function customerReceiptText(order) {
  const values = orderEmailValues(order);
  return [
    `Thank you, ${values.customerName}!`,
    "",
    `Your order ${values.orderNumber} has been received and is awaiting payment confirmation.`,
    "",
    "ORDER DETAILS",
    values.orderItems,
    `Subtotal: ${values.orderSubtotal}`,
    values.discountCode ? `Discount code: ${values.discountCode}` : "",
    values.discountAmount ? `Discount: ${values.discountAmount}` : "",
    `Shipping: ${values.shipping}`,
    `Total: ${values.orderTotal}`,
    `Payment method: ${values.paymentMethod}`,
    "",
    "SHIPPING TO",
    values.customerName,
    values.shippingAddress,
    `${values.shippingCity}, ${values.shippingState} ${values.shippingZip}`,
    values.customerPhone,
    "",
    `Include ${values.orderNumber} in the payment note.`,
    "Questions? Email sales@tierone.bio.",
    "",
    "All products are sold for research and laboratory use only.",
    "Not for human consumption. Not a drug, food, or cosmetic.",
  ].filter(Boolean).join("\n");
}

function staffNotification(order) {
  const values = orderEmailValues(order);
  const lines = [
    `Order: ${values.orderNumber}`,
    "Status: Awaiting payment",
    `Payment method: ${values.paymentMethod}`,
    "Research-use acknowledgement: Yes (required and checked server-side)",
    "",
    "CUSTOMER",
    values.customerName,
    values.customerEmail,
    values.customerPhone,
    "",
    "SHIPPING ADDRESS",
    values.shippingAddress,
    `${values.shippingCity}, ${values.shippingState} ${values.shippingZip}`,
    "",
    "ITEMS",
    values.orderItems,
    "",
    `Subtotal: ${values.orderSubtotal}`,
    values.discountCode ? `Discount code: ${values.discountCode}` : "",
    values.discountAmount ? `Discount: ${values.discountAmount}` : "",
    `Shipping: ${values.shipping}`,
    `Total: ${values.orderTotal}`,
  ].filter(Boolean);
  const text = lines.join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5"><h1 style="font-size:20px">New order ${escapeHtml(values.orderNumber)}</h1><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre></body></html>`;
  return { html, text };
}

async function deliver(message, { apiKey, fetchImpl }) {
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify(message.payload),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (response.ok) return true;
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`create-order: Resend rejected ${message.label} (${response.status}): ${detail}`);
  } catch (error) {
    console.error(`create-order: ${message.label} delivery failed:`, error);
  }
  return false;
}

export async function sendOrderCreatedEmails(order, {
  apiKey = getEnv("RESEND_API_KEY") || "",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey || typeof fetchImpl !== "function") {
    console.error("create-order: RESEND_API_KEY or email transport is unavailable");
    return { receiptSent: false, staffNotificationSent: false };
  }

  let receiptHtml;
  try {
    receiptHtml = renderOrderReceipt(order);
  } catch (error) {
    console.error("create-order: customer receipt template failed:", error);
    return { receiptSent: false, staffNotificationSent: false };
  }
  const staff = staffNotification(order);
  const customerMessage = {
    label: "customer receipt",
    idempotencyKey: `order-receipt-v1/${order.id}`,
    payload: {
      from: SENDER,
      to: [order.customer_email],
      reply_to: STAFF_NOTIFICATION_EMAIL,
      subject: `Tier One order ${order.order_number} received`,
      html: receiptHtml,
      text: customerReceiptText(order),
    },
  };
  const staffMessage = {
    label: "staff order notification",
    idempotencyKey: `order-staff-notification-v1/${order.id}`,
    payload: {
      from: SENDER,
      to: [STAFF_NOTIFICATION_EMAIL],
      reply_to: order.customer_email,
      subject: `New order ${order.order_number} - awaiting payment`,
      html: staff.html,
      text: staff.text,
    },
  };

  const [receiptSent, staffNotificationSent] = await Promise.all([
    deliver(customerMessage, { apiKey, fetchImpl }),
    deliver(staffMessage, { apiKey, fetchImpl }),
  ]);
  return { receiptSent, staffNotificationSent };
}
