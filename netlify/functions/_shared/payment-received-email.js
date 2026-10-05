import {
  escapeHtml,
  STAFF_ADMIN_URL,
} from "./order-created-email.js";

const IDEMPOTENCY_PREFIX = "staff-payment/v1";

const KIND_COPY = {
  confirmed: {
    badge: "PAID",
    heading: "Order marked paid",
    subjectVerb: "marked paid",
    preview: "Amount received recorded against the order total.",
  },
  updated: {
    badge: "AMOUNT UPDATED",
    heading: "Amount received updated",
    subjectVerb: "amount received updated",
    preview: "Amount received was corrected against the order total.",
  },
};

export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("Payment email contains an invalid amount.");
  return `$${amount.toFixed(2)}`;
}

export function paymentAmountCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function paymentVariance(received, total) {
  const receivedCents = paymentAmountCents(received);
  const totalCents = paymentAmountCents(total);
  if (receivedCents === null || totalCents === null) {
    throw new Error("Payment email contains an invalid amount.");
  }
  const cents = receivedCents - totalCents;
  const amount = cents / 100;
  if (cents === 0) {
    return { cents, amount, signedMoney: formatMoney(0), kind: "full", label: "paid in full" };
  }
  if (cents < 0) {
    return {
      cents,
      amount,
      signedMoney: `-${formatMoney(Math.abs(amount))}`,
      kind: "short",
      label: "short / staff discount",
    };
  }
  return {
    cents,
    amount,
    signedMoney: `+${formatMoney(amount)}`,
    kind: "over",
    label: "overpaid",
  };
}

export function formatRecordedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function paymentReceivedKind(kind) {
  return kind === "updated" ? "updated" : "confirmed";
}

export function paymentReceivedIdempotencyKey(noticeId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(noticeId || "")) {
    throw new Error("Payment email is missing its saved notice id.");
  }
  return `${IDEMPOTENCY_PREFIX}/${noticeId}`;
}

export function paymentReceivedEmailValues(order, { kind, previousAmount, noticeId } = {}) {
  const copy = KIND_COPY[paymentReceivedKind(kind)];
  const received = formatMoney(order.payment_amount_received);
  const total = formatMoney(order.total);
  const variance = paymentVariance(order.payment_amount_received, order.total);
  const recordedAt = formatRecordedAt(
    paymentReceivedKind(kind) === "updated"
      ? (order.updated_at || order.payment_confirmed_at)
      : (order.payment_confirmed_at || order.updated_at),
  );
  const previous = previousAmount === undefined || previousAmount === null
    ? ""
    : formatMoney(previousAmount);
  return {
    kind: paymentReceivedKind(kind),
    badge: copy.badge,
    heading: copy.heading,
    preview: copy.preview,
    orderNumber: order.order_number || "",
    customerName: order.customer_name || "Research Customer",
    customerEmail: order.customer_email || "",
    paymentMethod: order.payment_received_via || order.payment_method || "",
    orderTotal: total,
    amountReceived: received,
    previousAmount: previous,
    difference: `${variance.signedMoney} (${variance.label})`,
    varianceKind: variance.kind,
    recordedAt,
    subject: `Order ${order.order_number || ""} ${copy.subjectVerb} - ${received} received (total ${total})`,
    idempotencyKey: paymentReceivedIdempotencyKey(noticeId),
  };
}

export function renderStaffPaymentReceivedNotification(order, options = {}) {
  const values = paymentReceivedEmailValues(order, options);
  const text = [
    values.heading.toUpperCase(),
    `${values.orderNumber} · ${values.amountReceived} received · total ${values.orderTotal}`,
    "",
    "PAYMENT",
    `Order total: ${values.orderTotal}`,
    values.previousAmount ? `Previous amount received: ${values.previousAmount}` : null,
    `Amount received: ${values.amountReceived}`,
    `Difference: ${values.difference}`,
    `Payment method: ${values.paymentMethod}`,
    values.recordedAt ? `Recorded: ${values.recordedAt}` : null,
    "",
    "CUSTOMER",
    values.customerName,
    values.customerEmail,
    "",
    `Open Admin Orders: ${STAFF_ADMIN_URL}`,
    "Reply to this email to contact the customer.",
  ].filter(line => line !== null).join("\n");

  const safe = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const varianceBackground = values.varianceKind === "short"
    ? { background: "#fff6e5", border: "#f0d7a3", color: "#745100" }
    : values.varianceKind === "over"
      ? { background: "#eef5fb", border: "#c5d8ec", color: "#1d4f7a" }
      : { background: "#eef7ea", border: "#cce4c2", color: "#316b20" };
  const previousRow = values.previousAmount ? `
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Previous amount received</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:14px;">${safe.previousAmount}</td>
                </tr>` : "";
  const recordedRow = values.recordedAt ? `
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Recorded</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:14px;">${safe.recordedAt}</td>
                </tr>` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safe.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f1f3f5;color:#17191c;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safe.amountReceived} received on ${safe.orderNumber} (total ${safe.orderTotal}). ${safe.difference}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f3f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dfe3e7;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:22px 24px 18px;background:#0c0d0f;border-bottom:3px solid #c62b36;">
              <div style="margin:0 0 14px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1.8px;">TIER ONE BIOSYSTEMS</div>
              <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff2cc;color:#745100;font-size:11px;font-weight:800;letter-spacing:.8px;">${safe.badge}</div>
              <h1 style="margin:14px 0 4px;color:#ffffff;font-size:24px;line-height:1.2;">${safe.heading} ${safe.orderNumber}</h1>
              <p style="margin:0;color:#b9bec5;font-size:14px;">${safe.paymentMethod} · ${safe.difference}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8f9;border:1px solid #e4e7ea;border-radius:8px;">
                <tr>
                  <td style="padding:18px 20px 6px;color:#60656d;font-size:12px;font-weight:700;letter-spacing:1px;">AMOUNT RECEIVED</td>
                  <td align="right" style="padding:18px 20px 6px;color:#17191c;font-size:26px;font-weight:800;">${safe.amountReceived}</td>
                </tr>
                <tr>
                  <td style="padding:0 20px 16px;color:#8f949c;font-size:13px;">Order total ${safe.orderTotal}</td>
                  <td align="right" style="padding:0 20px 16px;color:#60656d;font-size:13px;font-weight:700;">${safe.difference}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 2px;">
              <h2 style="margin:0 0 8px;color:#60656d;font-size:12px;letter-spacing:1.2px;">PAYMENT</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Order total</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:14px;">${safe.orderTotal}</td>
                </tr>${previousRow}
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Amount received</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:15px;font-weight:700;">${safe.amountReceived}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0 5px;border-top:1px solid #e4e7ea;color:#17191c;font-size:15px;font-weight:700;">Difference</td>
                  <td align="right" style="padding:10px 0 5px;border-top:1px solid #e4e7ea;color:#17191c;font-size:15px;font-weight:800;">${safe.difference}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#8f949c;font-size:14px;">Payment method</td>
                  <td align="right" style="padding:5px 0;color:#17191c;font-size:14px;">${safe.paymentMethod}</td>
                </tr>${recordedRow}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:14px 0 0;background:${varianceBackground.background};border:1px solid ${varianceBackground.border};border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;color:${varianceBackground.color};font-size:13px;font-weight:700;">${safe.difference}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 4px;">
              <h2 style="margin:0 0 8px;color:#60656d;font-size:12px;letter-spacing:1.2px;">CUSTOMER</h2>
              <p style="margin:0;color:#17191c;font-size:15px;font-weight:700;line-height:1.55;">${safe.customerName}</p>
              <p style="margin:2px 0 0;color:#60656d;font-size:14px;line-height:1.55;word-break:break-word;">
                <a href="mailto:${safe.customerEmail}" style="color:#b82430;text-decoration:none;">${safe.customerEmail}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px;">
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
  return { html, text, subject: values.subject, idempotencyKey: values.idempotencyKey, values };
}
