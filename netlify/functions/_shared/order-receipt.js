import { readFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "./http.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FROM = "Tier One BioSystems <noreply@tierone.bio>";
const DEFAULT_REPLY_TO = "sales@tierone.bio";
const TEMPLATE_VERSION = 1;
const TEMPLATE_FILE = "order-receipt-v1.html";

let cachedTemplate = "";

export function orderReceiptParams({ customer, orderNumber, itemsText, totals, discountCode, paymentMethod }) {
  return {
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    orderNumber,
    orderItems: itemsText,
    orderSubtotal: `$${Number(totals.subtotal).toFixed(2)}`,
    discountCode: discountCode || "",
    discountAmount: Number(totals.discountAmount) > 0 ? `-$${Number(totals.discountAmount).toFixed(2)}` : "",
    shipping: Number(totals.shipping) === 0 ? "FREE" : `$${Number(totals.shipping).toFixed(2)}`,
    paymentMethod,
    orderTotal: `$${Number(totals.total).toFixed(2)}`,
    shippingAddress: customer.address,
    shippingCity: customer.city,
    shippingState: customer.state,
    shippingZip: customer.zip,
  };
}

export function receiptFromAddress(getEnvImpl = getEnv) {
  return getEnvImpl("RESEND_FROM_ADDRESS") || DEFAULT_FROM;
}

export function resendApiKey(getEnvImpl = getEnv) {
  return getEnvImpl("RESEND_API_KEY") || "";
}

export async function deliverOrderReceipt({
  supabase,
  orderId,
  params,
  fetchImpl = fetch,
  apiKey = resendApiKey(),
  fromAddress = receiptFromAddress(),
}) {
  const queued = await enqueueOrderReceipt({ supabase, orderId, params });
  if (!queued) {
    return { ok: false, error: "The confirmation email could not be queued." };
  }
  if (queued.status === "SENT") {
    return { ok: true, alreadySent: true, providerMessageId: queued.provider_message_id || "" };
  }

  return sendQueuedOrderReceipt({
    supabase,
    deliveryId: queued.id,
    fetchImpl,
    apiKey,
    fromAddress,
  });
}

export async function enqueueOrderReceipt({ supabase, orderId, params }) {
  let result;
  try {
    result = await supabase.rpc("enqueue_order_receipt", {
      p_order_id: orderId,
      p_recipient_email: params.customerEmail,
      p_customer_name: params.customerName,
      p_order_number: params.orderNumber,
      p_items_text: params.orderItems,
      p_order_subtotal: params.orderSubtotal,
      p_discount_code: params.discountCode || "",
      p_discount_amount: params.discountAmount || "",
      p_shipping: params.shipping,
      p_payment_method: params.paymentMethod,
      p_order_total: params.orderTotal,
      p_shipping_address: params.shippingAddress,
      p_shipping_city: params.shippingCity,
      p_shipping_state: params.shippingState,
      p_shipping_zip: params.shippingZip,
      p_customer_phone: params.customerPhone,
    });
  } catch (error) {
    console.error("order-receipt: enqueue request failed:", error);
    return null;
  }
  if (result.error) {
    console.error("order-receipt: enqueue failed:", result.error);
    return null;
  }
  return firstRow(result.data);
}

export async function sendQueuedOrderReceipt({
  supabase,
  deliveryId = null,
  fetchImpl = fetch,
  apiKey = resendApiKey(),
  fromAddress = receiptFromAddress(),
}) {
  let claimResult;
  try {
    claimResult = await supabase.rpc("claim_order_receipt", {
      p_delivery_id: deliveryId,
    });
  } catch (error) {
    console.error("order-receipt: claim request failed:", error);
    return { ok: false, error: "The confirmation email could not be sent." };
  }
  if (claimResult.error) {
    console.error("order-receipt: claim failed:", claimResult.error);
    return { ok: false, error: "The confirmation email could not be sent." };
  }

  const delivery = firstRow(claimResult.data);
  if (!delivery) return { ok: false, unchanged: true, error: "The confirmation email could not be sent." };
  if (delivery.status === "SENT") {
    return { ok: true, alreadySent: true, providerMessageId: delivery.provider_message_id || "" };
  }
  if (delivery.status === "NEEDS_REVIEW") {
    return { ok: false, error: "The confirmation email could not be sent." };
  }

  let sent;
  try {
    sent = await sendOrderReceiptDelivery(delivery, { fetchImpl, apiKey, fromAddress });
  } catch (sendError) {
    const failure = normaliseDeliveryError(sendError);
    try {
      await supabase.rpc("fail_order_receipt", {
        p_delivery_id: delivery.id,
        p_claim_token: delivery.claim_token,
        p_error: failure.message,
        p_retryable: failure.retryable,
      });
    } catch (failError) {
      console.error("order-receipt: failure-state request failed:", failError);
    }
    console.error("order-receipt: send failed:", failure.message);
    return { ok: false, error: "The confirmation email could not be sent." };
  }

  try {
    const completeResult = await supabase.rpc("complete_order_receipt", {
      p_delivery_id: delivery.id,
      p_claim_token: delivery.claim_token,
      p_provider_message_id: sent.providerMessageId,
    });
    if (completeResult.error) {
      console.error("order-receipt: provider accepted but completion failed:", completeResult.error);
    }
  } catch (completeError) {
    console.error("order-receipt: provider accepted but completion request failed:", completeError);
  }

  return { ok: true, providerMessageId: sent.providerMessageId };
}

export async function drainOrderReceiptQueue({
  supabase,
  limit = 2,
  fetchImpl = fetch,
  apiKey = resendApiKey(),
  fromAddress = receiptFromAddress(),
} = {}) {
  const results = [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 1, 1), 10);
  for (let index = 0; index < boundedLimit; index += 1) {
    const result = await sendQueuedOrderReceipt({
      supabase,
      fetchImpl,
      apiKey,
      fromAddress,
    });
    if (result.unchanged) break;
    results.push(result);
  }
  return results;
}

export async function sendOrderReceiptDelivery(delivery, {
  fetchImpl = fetch,
  apiKey = resendApiKey(),
  fromAddress = receiptFromAddress(),
} = {}) {
  if (!apiKey) {
    throw new OrderReceiptDeliveryError("RESEND_API_KEY is not configured.", true);
  }
  if (typeof fetchImpl !== "function") {
    throw new OrderReceiptDeliveryError("Email transport is unavailable.", true);
  }

  const message = renderOrderReceiptEmail(delivery, { fromAddress });
  let response;
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OrderReceiptDeliveryError("Resend could not be reached.", true, error);
  }

  const raw = await response.text().catch(() => "");
  const payload = parseJson(raw);
  if (!response.ok) {
    const retryable = response.status === 408
      || response.status === 429
      || response.status >= 500;
    throw new OrderReceiptDeliveryError(
      `Resend returned HTTP ${response.status}`,
      retryable,
    );
  }

  const providerMessageId = plainText(payload?.id || "", 160);
  if (!providerMessageId) {
    throw new OrderReceiptDeliveryError("Resend returned no message id.", true);
  }
  return { providerMessageId, message };
}

export function renderOrderReceiptEmail(delivery, { fromAddress = DEFAULT_FROM } = {}) {
  const values = normaliseDelivery(delivery);
  const template = loadTemplate();
  const discountBlock = values.discountCode
    ? [
      row("SUBTOTAL", escapeHtml(values.orderSubtotal)),
      row("Discount Code", escapeHtml(values.discountCode), "#22c55e"),
      row("Discount", escapeHtml(values.discountAmount), "#22c55e"),
    ].join("")
    : "";
  const html = renderTemplate(template, {
    CUSTOMER_NAME: escapeHtml(values.customerName),
    ORDER_NUMBER: escapeHtml(values.orderNumber),
    ORDER_ITEMS: escapeHtml(values.orderItems).replace(/\n/g, "<br>"),
    DISCOUNT_BLOCK: discountBlock,
    SHIPPING: escapeHtml(values.shipping),
    ORDER_TOTAL: escapeHtml(values.orderTotal),
    SHIPPING_ADDRESS: escapeHtml(values.shippingAddress),
    SHIPPING_CITY: escapeHtml(values.shippingCity),
    SHIPPING_STATE: escapeHtml(values.shippingState),
    SHIPPING_ZIP: escapeHtml(values.shippingZip),
    CUSTOMER_PHONE: escapeHtml(values.customerPhone),
    PAYMENT_METHOD: escapeHtml(values.paymentMethod),
  });
  if (/\{\{[A-Z_]+\}\}/.test(html)) {
    throw new OrderReceiptDeliveryError("The order email template has unresolved fields.", false);
  }

  const text = [
    "TIER ONE BIOSYSTEMS",
    "",
    "ORDER CONFIRMED",
    "",
    `Thank you, ${values.customerName}.`,
    "",
    `Order number: ${values.orderNumber}`,
    "",
    values.orderItems,
    values.discountCode ? `Discount code: ${values.discountCode}` : "",
    values.discountAmount ? `Discount: ${values.discountAmount}` : "",
    `Shipping: ${values.shipping}`,
    `Total: ${values.orderTotal}`,
    "",
    "Shipping to:",
    values.customerName,
    values.shippingAddress,
    `${values.shippingCity}, ${values.shippingState} ${values.shippingZip}`,
    values.customerPhone,
    "",
    `Send ${values.orderTotal} via ${values.paymentMethod} and include ${values.orderNumber} in the note.`,
    "",
    "Questions? sales@tierone.bio",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");

  return {
    from: fromAddress || DEFAULT_FROM,
    replyTo: DEFAULT_REPLY_TO,
    to: values.recipientEmail,
    subject: `Order ${values.orderNumber} received`,
    html,
    text,
    idempotencyKey: values.idempotencyKey,
  };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class OrderReceiptDeliveryError extends Error {
  constructor(message, retryable, cause) {
    super(message, { cause });
    this.name = "OrderReceiptDeliveryError";
    this.retryable = Boolean(retryable);
  }
}

function normaliseDelivery(delivery) {
  const recipientEmail = plainText(delivery?.recipient_email, 320);
  if (!EMAIL_PATTERN.test(recipientEmail)) {
    throw new OrderReceiptDeliveryError("The queued recipient email is invalid.", false);
  }
  const idempotencyKey = plainText(delivery?.idempotency_key, 256);
  if (!idempotencyKey.startsWith(`order-receipt/v${TEMPLATE_VERSION}/`)) {
    throw new OrderReceiptDeliveryError("The queued email key does not match its template version.", false);
  }
  return {
    recipientEmail,
    customerName: requiredText(delivery?.customer_name, 160, "customer name"),
    orderNumber: requiredText(delivery?.order_number, 80, "order number"),
    orderItems: requiredText(delivery?.items_text, 4000, "order items"),
    orderSubtotal: requiredText(delivery?.order_subtotal, 40, "subtotal"),
    discountCode: plainText(delivery?.discount_code, 64),
    discountAmount: plainText(delivery?.discount_amount, 40),
    shipping: requiredText(delivery?.shipping, 40, "shipping"),
    paymentMethod: requiredText(delivery?.payment_method, 40, "payment method"),
    orderTotal: requiredText(delivery?.order_total, 40, "total"),
    shippingAddress: requiredText(delivery?.shipping_address, 200, "shipping address"),
    shippingCity: requiredText(delivery?.shipping_city, 100, "city"),
    shippingState: requiredText(delivery?.shipping_state, 100, "state"),
    shippingZip: requiredText(delivery?.shipping_zip, 20, "zip"),
    customerPhone: requiredText(delivery?.customer_phone, 40, "phone"),
    idempotencyKey,
  };
}

function requiredText(value, maxLength, label) {
  const text = plainText(value, maxLength);
  if (!text) throw new OrderReceiptDeliveryError(`The queued email has no ${label}.`, false);
  return text;
}

function plainText(value, maxLength) {
  const withoutControls = Array.from(String(value ?? ""), character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const candidates = [
    path.join(process.cwd(), "email-templates", TEMPLATE_FILE),
    path.join(process.cwd(), "..", "email-templates", TEMPLATE_FILE),
    path.resolve("email-templates", TEMPLATE_FILE),
  ];
  for (const candidate of candidates) {
    try {
      cachedTemplate = readFileSync(candidate, "utf8");
      return cachedTemplate;
    } catch {
      // Try the next Netlify/local runtime path.
    }
  }
  throw new OrderReceiptDeliveryError(`${TEMPLATE_FILE} was not found in the function bundle.`, false);
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

function row(label, value, color = "#cccccc") {
  return `<tr>
                  <td style="padding:6px 16px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#666666;text-transform:uppercase;">${label}</td>
                        <td align="right" style="font-family:Arial,sans-serif;font-size:14px;color:${color};">${value}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return null;
  }
}

function normaliseDeliveryError(error) {
  if (error instanceof OrderReceiptDeliveryError) return error;
  return new OrderReceiptDeliveryError("Email delivery failed.", true, error);
}
