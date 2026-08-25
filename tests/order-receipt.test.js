import test from "node:test";
import assert from "node:assert/strict";

import {
  deliverOrderReceipt,
  renderOrderReceiptEmail,
  sendOrderReceiptDelivery,
} from "../netlify/functions/_shared/order-receipt.js";

function receiptDelivery(overrides = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    order_id: "11111111-1111-4111-8111-111111111111",
    status: "SENDING",
    recipient_email: "researcher@example.com",
    customer_name: "Research Customer",
    order_number: "T1B-260825-123456",
    items_text: "BPC-157 10mg x2 @ $45.00 = $90.00",
    subtotal: "90.00",
    discount_code: "SAVE10",
    discount_amount: "9.00",
    shipping: "10.00",
    payment_method: "Zelle",
    total: "91.00",
    shipping_address: "123 Lab Road",
    shipping_city: "Phoenix",
    shipping_state: "AZ",
    shipping_zip: "85001",
    customer_phone: "555-555-1212",
    idempotency_key: "order-receipt/v1/11111111-1111-4111-8111-111111111111",
    claim_token: "claim-1",
    attempt_count: 1,
    ...overrides,
  };
}

test("queued receipts preserve current Zelle copy and escape customer fields", () => {
  const message = renderOrderReceiptEmail(receiptDelivery({
    customer_name: "<script>alert(1)</script>",
    items_text: "Line one\n<img src=x onerror=alert(1)>",
  }));

  assert.equal(message.to, "researcher@example.com");
  assert.equal(message.idempotencyKey, "order-receipt/v1/11111111-1111-4111-8111-111111111111");
  assert.doesNotMatch(message.html, /<script>alert|<img src=x/);
  assert.match(message.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(message.html, /TierOneBio \/ TIER ONE BIO LLC<\/strong> \(Zelle\)/);
  assert.match(message.text, /Payment method: Zelle/);
});

test("Resend receipts fail closed without a server API key", async () => {
  const calls = [];
  await assert.rejects(
    () => sendOrderReceiptDelivery(receiptDelivery(), {
      apiKey: "",
      fetchImpl: (...args) => {
        calls.push(args);
        return Promise.resolve(new Response(JSON.stringify({ id: "re_x" }), { status: 200 }));
      },
    }),
    /RESEND_API_KEY is not configured/,
  );
  assert.equal(calls.length, 0);
});

test("a provider failure stays queued and a later retry sends exactly one receipt", async () => {
  const row = receiptDelivery({ status: "PENDING", claim_token: null, attempt_count: 0 });
  let resendCalls = 0;
  const supabase = {
    async rpc(name, args) {
      if (name === "enqueue_order_receipt") {
        assert.deepEqual(args, { p_order_id: row.order_id });
        return { data: { ...row }, error: null };
      }
      if (name === "claim_order_receipt") {
        if (row.status === "SENT") return { data: [{ ...row }], error: null };
        if (!["PENDING", "ERROR"].includes(row.status)) return { data: [], error: null };
        row.status = "SENDING";
        row.attempt_count += 1;
        row.claim_token = `claim-${row.attempt_count}`;
        return { data: [{ ...row }], error: null };
      }
      if (name === "fail_order_receipt") {
        assert.equal(args.p_claim_token, row.claim_token);
        row.status = args.p_retryable ? "ERROR" : "NEEDS_REVIEW";
        row.claim_token = null;
        return { data: { ...row }, error: null };
      }
      if (name === "complete_order_receipt") {
        assert.equal(args.p_claim_token, row.claim_token);
        row.status = "SENT";
        row.provider_message_id = args.p_provider_message_id;
        row.claim_token = null;
        return { data: { ...row }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };

  const previousError = console.error;
  console.error = () => {};
  try {
    const first = await deliverOrderReceipt({
      supabase,
      orderId: row.order_id,
      apiKey: "re_test_key",
      fetchImpl: async () => {
        resendCalls += 1;
        return new Response("provider down", { status: 503 });
      },
    });
    assert.equal(first.ok, false);
    assert.equal(row.status, "ERROR");

    const second = await deliverOrderReceipt({
      supabase,
      orderId: row.order_id,
      apiKey: "re_test_key",
      fetchImpl: async (_url, options) => {
        resendCalls += 1;
        assert.equal(
          options.headers["Idempotency-Key"],
          "order-receipt/v1/11111111-1111-4111-8111-111111111111",
        );
        return new Response(JSON.stringify({ id: "re_retry_ok" }), { status: 200 });
      },
    });
    assert.equal(second.ok, true);
    assert.equal(row.status, "SENT");

    const third = await deliverOrderReceipt({
      supabase,
      orderId: row.order_id,
      apiKey: "re_test_key",
      fetchImpl: async () => {
        resendCalls += 1;
        return new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 });
      },
    });
    assert.equal(third.ok, true);
    assert.equal(third.alreadySent, true);
    assert.equal(resendCalls, 2);
  } finally {
    console.error = previousError;
  }
});
