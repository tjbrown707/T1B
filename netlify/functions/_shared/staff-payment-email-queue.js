import { getEnv } from "./http.js";
import { STAFF_EMAIL_SENDER, STAFF_NOTIFICATION_EMAIL } from "./order-created-email.js";
import { renderStaffPaymentReceivedNotification } from "./payment-received-email.js";

const firstRow = data => Array.isArray(data) ? data[0] || null : data || null;
const queued = () => ({ state: "QUEUED", sent: false, warning: "Payment is saved. The staff payment email is queued for automatic retry." });
const attention = () => ({ state: "NEEDS_REVIEW", sent: false, warning: "Payment is saved. The staff payment email needs attention; check Admin Orders and the email configuration." });

export async function sendQueuedStaffPaymentEmail({
  supabase, orderId = null, deliveryId = null,
  apiKey = getEnv("RESEND_API_KEY") || "", fetchImpl = globalThis.fetch,
  fromAddress = getEnv("RESEND_FROM_ADDRESS") || STAFF_EMAIL_SENDER,
}) {
  let delivery;
  try {
    const result = await supabase.rpc("claim_staff_payment_email", { p_delivery_id: deliveryId, p_order_id: orderId });
    if (result.error) throw result.error;
    delivery = firstRow(result.data);
  } catch (error) {
    console.error("staff-payment-email: claim failed", error);
    return queued();
  }
  if (!delivery) return { state: "UNCHANGED", sent: false };
  if (delivery.status === "SENT") return { state: "SENT", sent: true, alreadySent: true };
  if (delivery.status === "NEEDS_REVIEW") return attention();

  let providerMessageId;
  try {
    // Persist the exact payload before the first provider call. Later sends use
    // it verbatim, including after a deployment or an amount correction.
    if (!delivery.message_payload) {
      const rendered = renderStaffPaymentReceivedNotification(delivery.order_snapshot, {
        noticeId: delivery.id, kind: delivery.kind, previousAmount: delivery.previous_amount,
      });
      if (rendered.idempotencyKey !== delivery.idempotency_key) throw new PaymentEmailError("Invalid payment email key.", false);
      const result = await supabase.rpc("prepare_staff_payment_email", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claim_token,
        p_payload: { from: fromAddress, to: [STAFF_NOTIFICATION_EMAIL], reply_to: delivery.order_snapshot.customer_email,
          subject: rendered.subject, html: rendered.html, text: rendered.text },
      });
      if (result.error) throw result.error;
      delivery = firstRow(result.data);
      if (!delivery?.message_payload) throw new Error("Payment email payload could not be saved.");
    }
    if (!apiKey || typeof fetchImpl !== "function") throw new PaymentEmailError("Email transport is not configured.", true);
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": delivery.idempotency_key },
      body: JSON.stringify(delivery.message_payload), signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const retryable = [408, 429].includes(response.status) || response.status >= 500
        || (response.status === 409 && payload?.name === "concurrent_idempotent_requests");
      throw new PaymentEmailError(`Email provider returned HTTP ${response.status}.`, retryable);
    }
    providerMessageId = payload?.id;
    if (typeof providerMessageId !== "string" || !providerMessageId.trim() || providerMessageId.length > 160) {
      throw new PaymentEmailError("Email provider returned no message id.", true);
    }
  } catch (error) {
    console.error("staff-payment-email: send failed", error.message);
    // A lost claim stays leased and is recovered by the scheduler. Never send
    // anything unless preparation succeeded and the provider payload is saved.
    if (!delivery?.claim_token) return queued();
    try {
      const result = await supabase.rpc("fail_staff_payment_email", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claim_token,
        p_error: error instanceof PaymentEmailError ? error.message : "Email delivery could not be confirmed.",
        p_retryable: error instanceof PaymentEmailError ? error.retryable : true,
      });
      if (result.error) throw result.error;
      return firstRow(result.data)?.status === "NEEDS_REVIEW" ? attention() : queued();
    } catch (failureError) {
      console.error("staff-payment-email: failure record could not be saved", failureError);
      return queued();
    }
  }

  try {
    const result = await supabase.rpc("complete_staff_payment_email", {
      p_delivery_id: delivery.id, p_claim_token: delivery.claim_token, p_provider_message_id: providerMessageId,
    });
    if (result.error) throw result.error;
    if (firstRow(result.data)?.status !== "SENT") throw new Error("Payment email completion was not confirmed.");
    return { state: "SENT", sent: true };
  } catch (error) {
    console.error("staff-payment-email: provider accepted but completion failed", error);
    return queued();
  }
}

export async function drainStaffPaymentEmailQueue({ limit = 2, ...options }) {
  const results = [];
  for (let index = 0; index < Math.min(Math.max(Number(limit) || 1, 1), 10); index += 1) {
    const result = await sendQueuedStaffPaymentEmail(options);
    if (result.state === "UNCHANGED") break;
    results.push(result);
    // Stop on an unavailable database or provider; do not consume the entire
    // function timeout while other email queues are waiting to be serviced.
    if (result.warning) break;
  }
  return results;
}

export async function loadStaffPaymentEmails(supabase, orderIds) {
  const grouped = new Map();
  if (!orderIds.length) return grouped;
  const { data, error } = await supabase.from("staff_payment_email_outbox")
    .select("id,order_id,kind,payment_amount_received,status,attempt_count,next_attempt_at,sent_at,last_error,created_at")
    .in("order_id", orderIds).order("created_at", { ascending: false });
  if (error) throw new Error("Staff payment email details could not be loaded.");
  for (const delivery of data || []) {
    const list = grouped.get(delivery.order_id) || [];
    list.push(delivery);
    grouped.set(delivery.order_id, list);
  }
  return grouped;
}

class PaymentEmailError extends Error {
  constructor(message, retryable) { super(message); this.retryable = retryable; }
}
