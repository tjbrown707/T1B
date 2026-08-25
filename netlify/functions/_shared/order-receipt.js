import { getEnv } from "./http.js";
import {
  customerReceiptTextValues,
  orderEmailValues,
  renderOrderReceiptValues,
} from "./order-created-email.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FROM = "Tier One BioSystems <noreply@tierone.bio>";
const DEFAULT_REPLY_TO = "sales@tierone.bio";
const TEMPLATE_VERSION = 1;

export function receiptFromAddress(getEnvImpl = getEnv) {
  return getEnvImpl("RESEND_FROM_ADDRESS") || DEFAULT_FROM;
}

export function resendApiKey(getEnvImpl = getEnv) {
  return getEnvImpl("RESEND_API_KEY") || "";
}

export async function deliverOrderReceipt({
  supabase,
  orderId,
  fetchImpl = globalThis.fetch,
  apiKey = resendApiKey(),
  fromAddress = receiptFromAddress(),
}) {
  const queued = await enqueueOrderReceipt({ supabase, orderId });
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

export async function enqueueOrderReceipt({ supabase, orderId }) {
  let result;
  try {
    result = await supabase.rpc("enqueue_order_receipt", {
      p_order_id: orderId,
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
  fetchImpl = globalThis.fetch,
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
  if (!delivery) {
    return { ok: false, unchanged: true, error: "The confirmation email could not be sent." };
  }
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
      const failResult = await supabase.rpc("fail_order_receipt", {
        p_delivery_id: delivery.id,
        p_claim_token: delivery.claim_token,
        p_error: failure.message,
        p_retryable: failure.retryable,
      });
      if (failResult.error) {
        console.error("order-receipt: failure state could not be saved:", failResult.error);
      }
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
  fetchImpl = globalThis.fetch,
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
  fetchImpl = globalThis.fetch,
  apiKey = resendApiKey(),
  fromAddress = receiptFromAddress(),
} = {}) {
  if (!apiKey) {
    throw new OrderReceiptDeliveryError("RESEND_API_KEY is not configured.", true);
  }
  if (typeof fetchImpl !== "function") {
    throw new OrderReceiptDeliveryError("Email transport is unavailable.", true);
  }

  let message;
  try {
    message = renderOrderReceiptEmail(delivery, { fromAddress });
  } catch (error) {
    if (error instanceof OrderReceiptDeliveryError) throw error;
    throw new OrderReceiptDeliveryError("The order email template could not be rendered.", false, error);
  }
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
  return {
    from: fromAddress || DEFAULT_FROM,
    replyTo: DEFAULT_REPLY_TO,
    to: values.customerEmail,
    subject: `Tier One order ${values.orderNumber} received`,
    html: renderOrderReceiptValues(values),
    text: customerReceiptTextValues(values),
    idempotencyKey: values.idempotencyKey,
  };
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

  const values = orderEmailValues({
    customer_name: requiredText(delivery?.customer_name, 160, "customer name"),
    customer_email: recipientEmail,
    customer_phone: requiredText(delivery?.customer_phone, 40, "phone"),
    order_number: requiredText(delivery?.order_number, 80, "order number"),
    items_text: requiredMultiline(delivery?.items_text, 4000, "order items"),
    subtotal: requiredMoney(delivery?.subtotal, "subtotal"),
    discount_code: plainText(delivery?.discount_code, 64),
    discount_amount: requiredMoney(delivery?.discount_amount, "discount amount"),
    shipping: requiredMoney(delivery?.shipping, "shipping"),
    payment_method: requiredText(delivery?.payment_method, 40, "payment method"),
    total: requiredMoney(delivery?.total, "total"),
    ship_address: requiredText(delivery?.shipping_address, 200, "shipping address"),
    ship_city: requiredText(delivery?.shipping_city, 100, "city"),
    ship_state: requiredText(delivery?.shipping_state, 100, "state"),
    ship_zip: requiredText(delivery?.shipping_zip, 20, "zip"),
  });
  return { ...values, idempotencyKey };
}

function requiredMoney(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new OrderReceiptDeliveryError(`The queued email has an invalid ${label}.`, false);
  }
  return amount;
}

function requiredText(value, maxLength, label) {
  const text = plainText(value, maxLength);
  if (!text) throw new OrderReceiptDeliveryError(`The queued email has no ${label}.`, false);
  return text;
}

function requiredMultiline(value, maxLength, label) {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => plainText(line, maxLength))
    .join("\n")
    .trim()
    .slice(0, maxLength);
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
