import test from "node:test";
import assert from "node:assert/strict";

import {
  renderOrderReceipt,
  sendOrderCreatedEmails,
} from "../netlify/functions/_shared/order-created-email.js";

function sampleOrder(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    order_number: "T1B-260825-123456",
    items_text: "BPC-157 10mg x2 @ $45.00 = $90.00",
    subtotal: "90.00",
    discount_code: "SAVE10",
    discount_amount: "9.00",
    shipping: "10.00",
    total: "91.00",
    payment_method: "Zelle",
    customer_name: "Research Customer",
    customer_email: "researcher@example.com",
    customer_phone: "555-555-1212",
    ship_address: "123 Lab Road",
    ship_city: "Phoenix",
    ship_state: "AZ",
    ship_zip: "85001",
    ...overrides,
  };
}

test("customer receipt rendering escapes input and handles discount sections", () => {
  const template = "{{customerName}}|{{orderItems}}|{{#discountCode}}{{discountCode}}:{{discountAmount}}{{/discountCode}}";
  const rendered = renderOrderReceipt(sampleOrder({
    customer_name: "<script>alert(1)</script>",
    items_text: "Line one\n<img src=x onerror=alert(1)>",
  }), template);
  assert.doesNotMatch(rendered, /<script>|<img/);
  assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(rendered, /Line one<br>&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(rendered, /SAVE10:-\$9\.00/);

  const withoutDiscount = renderOrderReceipt(sampleOrder({
    discount_code: null,
    discount_amount: 0,
  }), template);
  assert.equal(withoutDiscount.endsWith("|"), true);
  assert.doesNotMatch(withoutDiscount, /SAVE10|\{\{#discountCode\}\}/);
});

test("order creation sends customer and staff messages through Resend with stable idempotency keys", async () => {
  const calls = [];
  const result = await sendOrderCreatedEmails(sampleOrder(), {
    apiKey: "test-resend-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
    },
  });

  assert.deepEqual(result, { receiptSent: true, staffNotificationSent: true });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === "https://api.resend.com/emails"));
  const customer = calls.find(call => call.body.to[0] === "researcher@example.com");
  const staff = calls.find(call => call.body.to[0] === "sales@tierone.bio");
  assert.ok(customer);
  assert.ok(staff);
  assert.equal(customer.options.headers["Idempotency-Key"], "order-receipt-v1/11111111-1111-4111-8111-111111111111");
  assert.equal(staff.options.headers["Idempotency-Key"], "order-staff-notification-v1/11111111-1111-4111-8111-111111111111");
  assert.equal(staff.body.reply_to, "researcher@example.com");
  assert.match(customer.body.html, /T1B-260825-123456/);
  assert.match(staff.body.text, /Research-use acknowledgement: Yes/);
});

test("customer and staff delivery results are reported independently", async () => {
  const previousError = console.error;
  console.error = () => {};
  try {
    const result = await sendOrderCreatedEmails(sampleOrder(), {
      apiKey: "test-resend-key",
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        return body.to[0] === "sales@tierone.bio"
          ? new Response("provider unavailable", { status: 503 })
          : new Response("{}", { status: 200 });
      },
    });
    assert.deepEqual(result, { receiptSent: true, staffNotificationSent: false });
  } finally {
    console.error = previousError;
  }
});
