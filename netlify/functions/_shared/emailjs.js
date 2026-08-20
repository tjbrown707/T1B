import { getEnv } from "./http.js";

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";
const SEND_TIMEOUT_MS = 8000;

function requiredEnv() {
  const serviceId = getEnv("EMAILJS_SERVICE_ID");
  const templateId = getEnv("EMAILJS_TEMPLATE_ID");
  const publicKey = getEnv("EMAILJS_PUBLIC_KEY");
  const privateKey = getEnv("EMAILJS_PRIVATE_KEY");
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    return null;
  }
  return { serviceId, templateId, publicKey, privateKey };
}

export function orderReceiptParams({ customer, orderNumber, itemsText, totals, discountCode, paymentMethod }) {
  return {
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    orderNumber,
    orderItems: itemsText,
    orderSubtotal: `$${totals.subtotal.toFixed(2)}`,
    discountCode: discountCode || "",
    discountAmount: totals.discountAmount > 0 ? `-$${totals.discountAmount.toFixed(2)}` : "",
    shipping: totals.shipping === 0 ? "FREE" : `$${totals.shipping.toFixed(2)}`,
    paymentMethod,
    orderTotal: `$${totals.total.toFixed(2)}`,
    shippingAddress: customer.address,
    shippingCity: customer.city,
    shippingState: customer.state,
    shippingZip: customer.zip,
  };
}

// Sends the existing EmailJS order-confirmation template from the server.
// Fails closed when the private key (or any other EmailJS env var) is missing.
// Errors never include template params, addresses, or upstream response bodies.
export async function sendOrderReceipt(params, fetchImpl = fetch) {
  const config = requiredEnv();
  if (!config) {
    console.error("emailjs: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and EMAILJS_PRIVATE_KEY must all be set");
    return { ok: false, error: "Order email is not configured." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl(EMAILJS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        accessToken: config.privateKey,
        template_params: params,
      }),
    });
    if (!response.ok) {
      console.error("emailjs: send failed with status", response.status);
      return { ok: false, error: "The confirmation email could not be sent." };
    }
    return { ok: true };
  } catch {
    console.error("emailjs: send failed");
    return { ok: false, error: "The confirmation email could not be sent." };
  } finally {
    clearTimeout(timer);
  }
}
