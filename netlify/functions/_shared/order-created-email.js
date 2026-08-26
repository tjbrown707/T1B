import { readFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "./http.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8000;
const STAFF_NOTIFICATION_EMAIL = "sales@tierone.bio";
const SENDER = "Tier One BioSystems <noreply@tierone.bio>";
const STAFF_ADMIN_URL = "https://www.tierone.bio/admin/orders";

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

export function orderEmailValues(order) {
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

export function renderOrderReceiptValues(values, template = loadReceiptTemplate()) {
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

export function renderOrderReceipt(order, template = loadReceiptTemplate()) {
  return renderOrderReceiptValues(orderEmailValues(order), template);
}

export function customerReceiptTextValues(values) {
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

export function customerReceiptText(order) {
  return customerReceiptTextValues(orderEmailValues(order));
}

export function renderStaffOrderNotification(order) {
  const values = orderEmailValues(order);
  const lines = [
    "NEW ORDER — AWAITING PAYMENT",
    `${values.orderNumber} · ${values.orderTotal} · ${values.paymentMethod}`,
    "",
    "ITEMS",
    values.orderItems,
    "",
    "TOTALS",
    `Subtotal: ${values.orderSubtotal}`,
    ...(values.discountCode ? [`Discount (${values.discountCode}): ${values.discountAmount}`] : []),
    `Shipping: ${values.shipping}`,
    `Total due: ${values.orderTotal}`,
    "",
    "CUSTOMER & SHIPPING",
    values.customerName,
    values.customerEmail,
    values.customerPhone,
    values.shippingAddress,
    `${values.shippingCity}, ${values.shippingState} ${values.shippingZip}`,
    "",
    `Payment method: ${values.paymentMethod}`,
    "Research-use acknowledgement: Confirmed",
    "",
    `Open Admin Orders: ${STAFF_ADMIN_URL}`,
    "Reply to this email to contact the customer.",
  ];
  const text = lines.join("\n");
  const safe = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const itemLines = safe.orderItems.replace(/\r?\n/g, "<br>");
  const discountRow = values.discountCode ? `
    <tr>
      <td style="padding:5px 0;color:#8f949c;font-size:14px;">Discount (${safe.discountCode})</td>
      <td align="right" style="padding:5px 0;color:#69b34c;font-size:14px;font-weight:700;">${safe.discountAmount}</td>
    </tr>` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>New order ${safe.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f3f5;color:#17191c;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safe.orderTotal} ${safe.paymentMethod} order awaiting payment.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f3f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dfe3e7;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:22px 24px 18px;background:#0c0d0f;border-bottom:3px solid #c62b36;">
              <div style="margin:0 0 14px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1.8px;">TIER ONE BIOSYSTEMS</div>
              <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff2cc;color:#745100;font-size:11px;font-weight:800;letter-spacing:.8px;">AWAITING PAYMENT</div>
              <h1 style="margin:14px 0 4px;color:#ffffff;font-size:24px;line-height:1.2;">New order ${safe.orderNumber}</h1>
              <p style="margin:0;color:#b9bec5;font-size:14px;">${safe.paymentMethod} · Research use confirmed</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8f9;border:1px solid #e4e7ea;border-radius:8px;">
                <tr>
                  <td style="padding:18px 20px;color:#60656d;font-size:12px;font-weight:700;letter-spacing:1px;">TOTAL DUE</td>
                  <td align="right" style="padding:18px 20px;color:#17191c;font-size:26px;font-weight:800;">${safe.orderTotal}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 2px;">
              <h2 style="margin:0 0 10px;color:#60656d;font-size:12px;letter-spacing:1.2px;">ITEMS</h2>
              <div style="padding:14px 16px;background:#ffffff;border:1px solid #e4e7ea;border-radius:8px;color:#17191c;font-size:15px;line-height:1.55;word-break:break-word;">${itemLines}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 2px;">
              <h2 style="margin:0 0 8px;color:#60656d;font-size:12px;letter-spacing:1.2px;">ORDER TOTALS</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Subtotal</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:14px;">${safe.orderSubtotal}</td>
                </tr>${discountRow}
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Shipping</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:14px;">${safe.shipping}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0 5px;border-top:1px solid #e4e7ea;color:#17191c;font-size:15px;font-weight:700;">Total due</td>
                  <td align="right" style="padding:10px 0 5px;border-top:1px solid #e4e7ea;color:#17191c;font-size:17px;font-weight:800;">${safe.orderTotal}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 4px;">
              <h2 style="margin:0 0 8px;color:#60656d;font-size:12px;letter-spacing:1.2px;">CUSTOMER &amp; SHIPPING</h2>
              <p style="margin:0;color:#17191c;font-size:15px;font-weight:700;line-height:1.55;">${safe.customerName}</p>
              <p style="margin:2px 0 0;color:#60656d;font-size:14px;line-height:1.55;word-break:break-word;">
                <a href="mailto:${safe.customerEmail}" style="color:#b82430;text-decoration:none;">${safe.customerEmail}</a><br>
                <a href="tel:${safe.customerPhone}" style="color:#60656d;text-decoration:none;">${safe.customerPhone}</a><br>
                ${safe.shippingAddress}<br>
                ${safe.shippingCity}, ${safe.shippingState} ${safe.shippingZip}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;background:#eef7ea;border:1px solid #cce4c2;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;color:#316b20;font-size:13px;font-weight:700;">✓ Research-use acknowledgement confirmed server-side</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#c62b36;">
                    <a href="${STAFF_ADMIN_URL}" style="display:inline-block;padding:12px 18px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open Admin Orders</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;color:#8f949c;font-size:12px;line-height:1.5;">Reply to this email to contact the customer directly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

export async function sendStaffOrderCreatedEmail(order, {
  apiKey = getEnv("RESEND_API_KEY") || "",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey || typeof fetchImpl !== "function") {
    console.error("create-order: RESEND_API_KEY or email transport is unavailable");
    return false;
  }

  const staff = renderStaffOrderNotification(order);
  const staffMessage = {
    label: "staff order notification",
    idempotencyKey: `order-staff-notification-v1/${order.id}`,
    payload: {
      from: getEnv("RESEND_FROM_ADDRESS") || SENDER,
      to: [STAFF_NOTIFICATION_EMAIL],
      reply_to: order.customer_email,
      subject: `New order ${order.order_number} - awaiting payment`,
      html: staff.html,
      text: staff.text,
    },
  };

  return deliver(staffMessage, { apiKey, fetchImpl });
}
