import { readFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "./http.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_TIMEOUT_MS = 8000;
const MESSAGE_VERSIONS = new Map([[1, Object.freeze({
  templateFile: "order-processed-v1.html",
  fromAddress: "Tier One BioSystems <noreply@tierone.bio>",
  replyTo: "sales@tierone.bio",
  render: renderOrderProcessedMessageV1,
})]]);

const cachedTemplates = new Map();

export async function recordOrderPrintSubmission({
  supabase,
  orderId,
  eventType,
  actorUserId,
  jobId,
  automatic = false,
  deferDelivery = false,
  sendOptions,
}) {
  let rpcResult;
  let lastRpcError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      rpcResult = await supabase.rpc("record_order_print_submission", {
        p_order_id: orderId,
        p_event_type: eventType,
        p_actor_user_id: actorUserId,
        p_printnode_job_id: jobId,
        p_automatic: automatic,
      });
      lastRpcError = rpcResult?.error || null;
    } catch (rpcError) {
      lastRpcError = rpcError;
      rpcResult = null;
    }
    if (rpcResult && !rpcResult.error) break;
    if (attempt === 1) {
      console.warn("order-processed-email: retrying idempotent print audit/outbox request");
    }
  }
  const { data, error } = rpcResult || {};
  if (error) {
    console.error("order-processed-email: print audit/outbox RPC failed:", error);
    return {
      state: "NEEDS_REVIEW",
      sent: false,
      warning: "Printing succeeded, but the customer email could not be queued.",
    };
  }
  if (!rpcResult) {
    console.error("order-processed-email: print audit/outbox request failed:", lastRpcError);
    return {
      state: "NEEDS_REVIEW",
      sent: false,
      warning: "Printing succeeded, but the customer email could not be queued.",
    };
  }

  const recorded = firstRow(data);
  if (!recorded?.delivery_id) {
    return {
      state: recorded?.readiness || "WAITING",
      sent: false,
    };
  }
  if (recorded.delivery_status === "SENT") {
    return { state: "SENT", sent: true, alreadySent: true };
  }
  if (deferDelivery) {
    return {
      state: recorded.delivery_status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "QUEUED",
      sent: false,
    };
  }

  const attempted = await sendQueuedOrderProcessedEmail({
    supabase,
    deliveryId: recorded.delivery_id,
    ...sendOptions,
  });
  if (attempted.state === "UNCHANGED") {
    return {
      state: recorded.delivery_status || recorded.readiness || "QUEUED",
      sent: false,
    };
  }
  return attempted;
}

export async function sendQueuedOrderProcessedEmail({
  supabase,
  deliveryId = null,
  fetchImpl = globalThis.fetch,
  apiKey = getEnv("RESEND_API_KEY") || "",
}) {
  let claimResult;
  try {
    claimResult = await supabase.rpc("claim_order_processed_email", {
      p_delivery_id: deliveryId,
    });
  } catch (claimError) {
    console.error("order-processed-email: claim request failed:", claimError);
    return {
      state: "NEEDS_REVIEW",
      sent: false,
      warning: "The tracking email needs staff attention.",
    };
  }
  const { data, error } = claimResult;
  if (error) {
    console.error("order-processed-email: claim failed:", error);
    return {
      state: "NEEDS_REVIEW",
      sent: false,
      warning: "The tracking email needs staff attention.",
    };
  }

  const delivery = firstRow(data);
  if (!delivery) return { state: "UNCHANGED", sent: false };
  if (delivery.status === "NEEDS_REVIEW") {
    return {
      state: "NEEDS_REVIEW",
      sent: false,
      warning: "The tracking email needs staff attention.",
    };
  }

  let sent;
  try {
    sent = await sendOrderProcessedDelivery(delivery, { fetchImpl, apiKey });
  } catch (sendError) {
    const failure = normaliseDeliveryError(sendError);
    let failureResult;
    try {
      failureResult = await supabase.rpc("fail_order_processed_email", {
        p_delivery_id: delivery.id,
        p_claim_token: delivery.claim_token,
        p_error: failure.message,
        p_retryable: failure.retryable,
      });
    } catch (failRequestError) {
      console.error("order-processed-email: failure-state request failed:", failRequestError);
      return {
        state: "NEEDS_REVIEW",
        sent: false,
        warning: "The tracking email needs staff attention.",
      };
    }
    const { data: failedData, error: failError } = failureResult;
    if (failError) {
      console.error("order-processed-email: failure state could not be saved:", failError);
      return {
        state: "NEEDS_REVIEW",
        sent: false,
        warning: "The tracking email needs staff attention.",
      };
    }
    const failed = firstRow(failedData);
    const state = failed?.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "RETRYING";
    console.error(`order-processed-email: send failed (${state}):`, failure.message);
    return {
      state,
      sent: false,
      warning: state === "RETRYING"
        ? "The tracking email is queued for an automatic retry."
        : "The tracking email needs staff attention.",
    };
  }

  let completeResult;
  try {
    completeResult = await supabase.rpc("complete_order_processed_email", {
      p_delivery_id: delivery.id,
      p_claim_token: delivery.claim_token,
      p_provider_message_id: sent.providerMessageId,
    });
  } catch (completeRequestError) {
    console.error(
      "order-processed-email: provider accepted but completion request failed:",
      completeRequestError,
    );
    return {
      state: "RETRYING",
      sent: false,
      warning: "The tracking email is being reconciled automatically.",
    };
  }
  if (completeResult.error) {
    console.error("order-processed-email: provider accepted but completion failed:", completeResult.error);
    return {
      state: "RETRYING",
      sent: false,
      warning: "The tracking email is being reconciled automatically.",
    };
  }
  return {
    state: "SENT",
    sent: true,
    providerMessageId: sent.providerMessageId,
  };
}

export async function drainOrderProcessedEmailQueue({
  supabase,
  limit = 2,
  fetchImpl = globalThis.fetch,
  apiKey = getEnv("RESEND_API_KEY") || "",
}) {
  const results = [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 1, 1), 10);
  for (let index = 0; index < boundedLimit; index += 1) {
    const result = await sendQueuedOrderProcessedEmail({
      supabase,
      fetchImpl,
      apiKey,
    });
    if (result.state === "UNCHANGED") break;
    results.push(result);
  }
  return results;
}

export async function sendOrderProcessedDelivery(delivery, {
  fetchImpl = globalThis.fetch,
  apiKey = getEnv("RESEND_API_KEY") || "",
} = {}) {
  if (!apiKey) {
    throw new OrderEmailDeliveryError("RESEND_API_KEY is not configured.", true);
  }
  if (typeof fetchImpl !== "function") {
    throw new OrderEmailDeliveryError("Email transport is unavailable.", true);
  }

  const message = renderOrderProcessedEmail(delivery);
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
    throw new OrderEmailDeliveryError("Resend could not be reached.", true, error);
  }

  const raw = await response.text().catch(() => "");
  const payload = parseJson(raw);
  if (!response.ok) {
    const providerType = plainText(payload?.name || payload?.type || "", 80);
    const detail = plainText(payload?.message || raw || `HTTP ${response.status}`, 300);
    const retryable = response.status === 408
      || response.status === 429
      || response.status >= 500
      || (response.status === 409 && providerType === "concurrent_idempotent_requests");
    throw new OrderEmailDeliveryError(
      `Resend returned HTTP ${response.status}: ${detail}`,
      retryable,
    );
  }

  const providerMessageId = plainText(payload?.id || "", 160);
  if (!providerMessageId) {
    throw new OrderEmailDeliveryError("Resend returned no message id.", true);
  }
  return { providerMessageId, message };
}

export function renderOrderProcessedEmail(delivery, template = null) {
  const values = normaliseDelivery(delivery);
  const version = MESSAGE_VERSIONS.get(values.templateVersion);
  const selectedTemplate = template || loadTemplate(values.templateVersion);
  const content = version.render(values, selectedTemplate);
  return {
    from: version.fromAddress,
    replyTo: version.replyTo,
    to: values.recipientEmail,
    idempotencyKey: values.idempotencyKey,
    ...content,
  };
}

// Version 1 is an immutable provider-payload renderer: HTML, text, subject,
// sender, and reply-to must all move to a new version together.
function renderOrderProcessedMessageV1(values, selectedTemplate) {
  const trackingButton = values.trackingUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="#c41e2a" style="background-color:#c41e2a;"><a href="${escapeHtml(values.trackingUrl)}" target="_blank" style="display:inline-block;padding:15px 44px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;color:#ffffff;text-transform:uppercase;text-decoration:none;">Track Package</a></td></tr></table>`
    : "";
  const carrierLine = values.serviceName
    ? `${values.carrier} - ${values.serviceName}`
    : values.carrier;
  const html = renderTemplate(selectedTemplate, {
    PREHEADER: escapeHtml(`Your order is prepared for shipment. Tracking number: ${values.trackingNumber}.`),
    CUSTOMER_NAME: escapeHtml(values.customerName),
    ORDER_NUMBER: escapeHtml(values.orderNumber),
    CARRIER: escapeHtml(carrierLine),
    TRACKING_NUMBER: escapeHtml(values.trackingNumber),
    TRACKING_BUTTON: trackingButton,
  });
  if (/\{\{[A-Z_]+\}\}/.test(html)) {
    throw new OrderEmailDeliveryError("The order email template has unresolved fields.", false);
  }

  const trackingText = values.trackingUrl
    ? `\nTrack your package:\n${values.trackingUrl}\n`
    : "";
  const text = [
    "TIER ONE BIOSYSTEMS",
    "",
    "ORDER PROCESSED",
    "",
    `Hi ${values.customerName},`,
    "",
    `We've processed order ${values.orderNumber} and prepared it for ${values.carrier} pickup.`,
    "",
    `Carrier: ${carrierLine}`,
    `Tracking number: ${values.trackingNumber}`,
    trackingText,
    `Tracking updates may not appear until ${values.carrier} receives and scans the package.`,
    "",
    "Questions about your order? Reply to this email or contact sales@tierone.bio.",
    "",
    "Tier One BioSystems",
    "All products are sold for research and laboratory use only.",
    "Not for human consumption. Not a drug, food, or cosmetic.",
  ].join("\n").replace(/\n{3,}/g, "\n\n");

  return {
    subject: `Order ${values.orderNumber} processed - tracking is ready`,
    html,
    text,
  };
}

export function safeTrackingUrl(value) {
  const text = plainText(value, 2000);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normaliseDelivery(delivery) {
  const templateVersion = Number(delivery?.template_version);
  if (!Number.isInteger(templateVersion) || !MESSAGE_VERSIONS.has(templateVersion)) {
    throw new OrderEmailDeliveryError("The queued email has an unsupported template version.", false);
  }
  const recipientEmail = plainText(delivery?.recipient_email, 320);
  if (!EMAIL_PATTERN.test(recipientEmail)) {
    throw new OrderEmailDeliveryError("The queued recipient email is invalid.", false);
  }
  const idempotencyKey = plainText(delivery?.idempotency_key, 256);
  if (!idempotencyKey) {
    throw new OrderEmailDeliveryError("The queued email has no idempotency key.", false);
  }
  if (!idempotencyKey.startsWith(`order-processed/v${templateVersion}/`)) {
    throw new OrderEmailDeliveryError("The queued email key does not match its template version.", false);
  }
  return {
    templateVersion,
    recipientEmail,
    customerName: plainText(delivery?.customer_name, 160) || "there",
    orderNumber: requiredText(delivery?.order_number, 80, "order number"),
    carrier: requiredText(delivery?.carrier, 80, "carrier"),
    serviceName: plainText(delivery?.service_name, 120),
    trackingNumber: requiredText(delivery?.tracking_number, 160, "tracking number"),
    trackingUrl: safeTrackingUrl(delivery?.tracking_url),
    idempotencyKey,
  };
}

function requiredText(value, maxLength, label) {
  const text = plainText(value, maxLength);
  if (!text) throw new OrderEmailDeliveryError(`The queued email has no ${label}.`, false);
  return text;
}

function plainText(value, maxLength) {
  const withoutControls = Array.from(String(value ?? ""), character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  return withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function loadTemplate(templateVersion) {
  if (cachedTemplates.has(templateVersion)) return cachedTemplates.get(templateVersion);
  const version = MESSAGE_VERSIONS.get(templateVersion);
  if (!version) {
    throw new OrderEmailDeliveryError("The order email template version is unsupported.", false);
  }
  const fileName = version.templateFile;
  const candidates = [
    path.join(process.cwd(), "email-templates", fileName),
    path.join(process.cwd(), "..", "email-templates", fileName),
    path.resolve("email-templates", fileName),
  ];
  for (const candidate of candidates) {
    try {
      const template = readFileSync(candidate, "utf8");
      cachedTemplates.set(templateVersion, template);
      return template;
    } catch {
      // Try the next Netlify/local runtime path.
    }
  }
  throw new OrderEmailDeliveryError(
    `${fileName} was not found in the function bundle.`,
    false,
  );
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
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
  if (error instanceof OrderEmailDeliveryError) return error;
  return new OrderEmailDeliveryError("Email delivery failed.", true, error);
}

export class OrderEmailDeliveryError extends Error {
  constructor(message, retryable, cause) {
    super(message, { cause });
    this.name = "OrderEmailDeliveryError";
    this.retryable = Boolean(retryable);
  }
}
