import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { updateOrderWorkflow } from "../netlify/functions/admin-orders.js";
import {
  STAFF_ADMIN_URL,
  STAFF_NOTIFICATION_EMAIL,
} from "../netlify/functions/_shared/order-created-email.js";
import {
  formatMoney,
  formatRecordedAt,
  paymentAmountCents,
  paymentReceivedEmailValues,
  paymentReceivedIdempotencyKey,
  paymentVariance,
  renderStaffPaymentReceivedNotification,
  sendStaffPaymentReceivedEmail,
} from "../netlify/functions/_shared/payment-received-email.js";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function sampleOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    order_number: "T1B-261002-108767",
    total: "180.00",
    payment_amount_received: "72.00",
    payment_method: "Zelle",
    payment_received_via: "Zelle",
    customer_name: "Research Friend",
    customer_email: "friend@example.com",
    payment_confirmed_at: "2026-10-02T18:04:11.000Z",
    updated_at: "2026-10-02T18:04:11.000Z",
    payment_status: "PAID",
    ...overrides,
  };
}

test("staff payment-received copy names the amount actually received", () => {
  const confirmed = renderStaffPaymentReceivedNotification(sampleOrder(), { kind: "confirmed" });
  assert.equal(
    confirmed.subject,
    "Order T1B-261002-108767 marked paid - $72.00 received (total $180.00)",
  );
  assert.match(confirmed.text, /AMOUNT RECEIVED|Amount received: \$72\.00/);
  assert.match(confirmed.text, /Order total: \$180\.00/);
  assert.match(confirmed.text, /Difference: -\$108\.00 \(short \/ staff discount\)/);
  assert.match(confirmed.text, /Payment method: Zelle/);
  assert.match(confirmed.text, /Research Friend/);
  assert.match(confirmed.text, /friend@example.com/);
  assert.match(confirmed.text, /Recorded: 2026-10-02 18:04:11 UTC/);
  assert.match(confirmed.text, new RegExp(STAFF_ADMIN_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(confirmed.html, /AMOUNT RECEIVED/);
  assert.match(confirmed.html, /\$72\.00/);
  assert.match(confirmed.html, /max-width:620px/);
  assert.match(confirmed.html, /Open Admin Orders/);
  assert.doesNotMatch(confirmed.html, /<pre/);

  const updated = renderStaffPaymentReceivedNotification(sampleOrder({
    payment_amount_received: "80.00",
    updated_at: "2026-10-03T12:00:00.000Z",
  }), { kind: "updated", previousAmount: 72 });
  assert.equal(
    updated.subject,
    "Order T1B-261002-108767 amount received updated - $80.00 received (total $180.00)",
  );
  assert.match(updated.text, /AMOUNT RECEIVED UPDATED|Amount received: \$80\.00/);
  assert.match(updated.text, /Previous amount received: \$72\.00/);
  assert.match(updated.html, /AMOUNT UPDATED/);
});

test("variance labels distinguish discounts, overpayments, and paid-in-full", () => {
  assert.deepEqual(paymentVariance(72, 180), {
    cents: -10800,
    amount: -108,
    signedMoney: "-$108.00",
    kind: "short",
    label: "short / staff discount",
  });
  assert.deepEqual(paymentVariance(200, 180), {
    cents: 2000,
    amount: 20,
    signedMoney: "+$20.00",
    kind: "over",
    label: "overpaid",
  });
  assert.deepEqual(paymentVariance("180.00", 180), {
    cents: 0,
    amount: 0,
    signedMoney: "$0.00",
    kind: "full",
    label: "paid in full",
  });
  assert.equal(formatMoney(72), "$72.00");
  assert.equal(formatRecordedAt("not-a-date"), "");
});

test("staff payment-received email escapes customer input", () => {
  const rendered = renderStaffPaymentReceivedNotification(sampleOrder({
    customer_name: '<img src=x onerror="alert(1)">',
    customer_email: "friend@example.com",
    payment_received_via: '<script>alert(1)</script>',
  }), { kind: "confirmed" });
  assert.doesNotMatch(rendered.html, /<script>|<img/);
  assert.match(rendered.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("payment-received delivery uses the staff inbox and an amount-specific Resend key", async () => {
  const calls = [];
  const result = await sendStaffPaymentReceivedEmail(sampleOrder(), {
    kind: "confirmed",
    apiKey: "test-resend-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
    },
  });

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].body.to[0], STAFF_NOTIFICATION_EMAIL);
  assert.equal(STAFF_NOTIFICATION_EMAIL, "sales@tierone.bio");
  assert.equal(calls[0].body.reply_to, "friend@example.com");
  assert.equal(
    calls[0].options.headers["Idempotency-Key"],
    `order-staff-payment-received-v1/${ORDER_ID}/7200`,
  );
  assert.equal(
    paymentReceivedIdempotencyKey(sampleOrder({ payment_amount_received: 80 })),
    `order-staff-payment-received-v1/${ORDER_ID}/8000`,
  );
  assert.notEqual(
    paymentReceivedIdempotencyKey(sampleOrder()),
    paymentReceivedIdempotencyKey(sampleOrder({ payment_amount_received: 80 })),
  );
  assert.equal(paymentAmountCents("72.00"), 7200);
});

test("retries of the same order and amount reuse one idempotency key", () => {
  const first = paymentReceivedEmailValues(sampleOrder(), { kind: "confirmed" });
  const retry = paymentReceivedEmailValues(sampleOrder(), { kind: "confirmed" });
  const sameAmountEdit = paymentReceivedEmailValues(sampleOrder(), { kind: "updated" });
  const newAmount = paymentReceivedEmailValues(sampleOrder({ payment_amount_received: "64.00" }), { kind: "updated" });
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.equal(first.idempotencyKey, sameAmountEdit.idempotencyKey);
  assert.notEqual(first.idempotencyKey, newAmount.idempotencyKey);
});

test("payment-received delivery failure is reported without throwing", async () => {
  const previousError = console.error;
  console.error = () => {};
  try {
    const rejected = await sendStaffPaymentReceivedEmail(sampleOrder(), {
      kind: "confirmed",
      apiKey: "test-resend-key",
      fetchImpl: async () => new Response("provider unavailable", { status: 503 }),
    });
    assert.equal(rejected, false);

    const exploded = await sendStaffPaymentReceivedEmail(sampleOrder({ payment_amount_received: "nope" }), {
      kind: "confirmed",
      apiKey: "test-resend-key",
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
    });
    assert.equal(exploded, false);
  } finally {
    console.error = previousError;
  }
});

function workflowFixture(t, options = {}) {
  const order = {
    id: ORDER_ID,
    order_number: "T1B-261002-108767",
    payment_status: "AWAITING_PAYMENT",
    fulfillment_status: "ON_HOLD",
    fulfillment_method: "SHIP",
    inventory_accounting_mode: "TRACKED",
    created_at: "2026-10-02T17:00:00.000Z",
    total: 180,
    payment_amount_received: null,
    payment_method: "Zelle",
    customer_name: "Research Friend",
    customer_email: "friend@example.com",
    items: [{ id: "test", name: "Test product", qty: 1 }],
    ...options.order,
  };
  const emails = [];
  const supabase = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        maybeSingle() { return this; },
        then(resolve, reject) {
          const data = table === "orders" ? { ...order } : [];
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
    },
    async rpc(name) {
      if (name === "get_order_lot_choices") {
        return { data: [{ order_id: ORDER_ID, lot_selection_required: false, lot_choices: [] }] };
      }
      if (name === "confirm_order_payment") {
        if (options.paymentError) return { error: { message: "status_conflict" } };
        Object.assign(order, {
          payment_status: "PAID",
          fulfillment_status: "READY_TO_PICK",
          payment_amount_received: 72,
          payment_received_via: "Zelle",
          payment_confirmed_at: "2026-10-02T18:04:11.000Z",
          updated_at: "2026-10-02T18:04:11.000Z",
        });
        return { data: { ...order } };
      }
      if (name === "update_order_payment_amount") {
        Object.assign(order, {
          payment_amount_received: 64,
          updated_at: "2026-10-03T12:00:00.000Z",
        });
        return { data: { ...order } };
      }
      if (name === "assign_order_lots") {
        order.lots_confirmed_at = new Date().toISOString();
        return { data: { ...order } };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const previous = globalThis.Netlify;
  globalThis.Netlify = {
    env: {
      get: key => (options.env || {
        RESEND_API_KEY: "test-resend-key",
      })[key],
    },
  };
  t.after(() => { globalThis.Netlify = previous; });
  t.mock.method(globalThis, "fetch", async (url, request) => {
    if (url === "https://api.resend.com/emails") {
      emails.push({ url, body: JSON.parse(request.body), headers: request.headers });
      if (options.emailError) {
        if (options.emailError === "throw") throw new Error("network down");
        return new Response("provider unavailable", { status: 503 });
      }
      return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const workflow = async (action, input = {}) => {
    const response = await updateOrderWorkflow(supabase, { id: ACTOR_ID }, new Request("https://test/admin-orders", {
      method: "PATCH",
      body: JSON.stringify({
        orderId: ORDER_ID,
        action,
        expectedPaymentStatus: action === "confirm_payment" ? "AWAITING_PAYMENT" : "PAID",
        paymentReceivedVia: "Zelle",
        paymentAmountReceived: action === "update_payment_amount" ? 64 : 72,
        expectedPaymentAmount: 72,
        expectedLotAssignmentVersion: 0,
        assignments: [{ lotId: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
        ...input,
      }),
    }));
    return { status: response.status, ...await response.json() };
  };
  return { workflow, emails, order };
}

test("confirming payment emails sales@tierone.bio with the recorded amount", async t => {
  const previousError = console.error;
  console.error = () => {};
  try {
    const f = workflowFixture(t);
    const result = await f.workflow("confirm_payment");
    assert.equal(result.status, 200);
    assert.equal(result.order.payment_status, "PAID");
    assert.equal(result.order.payment_amount_received, 72);
    assert.equal(f.emails.length, 1);
    assert.equal(f.emails[0].body.to[0], "sales@tierone.bio");
    assert.equal(
      f.emails[0].body.subject,
      "Order T1B-261002-108767 marked paid - $72.00 received (total $180.00)",
    );
    assert.equal(
      f.emails[0].headers["Idempotency-Key"],
      `order-staff-payment-received-v1/${ORDER_ID}/7200`,
    );
    assert.match(f.emails[0].body.text, /-\$108\.00 \(short \/ staff discount\)/);
  } finally {
    console.error = previousError;
  }
});

test("editing the amount received sends a new staff notice for the new amount", async t => {
  const previousError = console.error;
  console.error = () => {};
  try {
    const f = workflowFixture(t, {
      order: {
        payment_status: "PAID",
        payment_amount_received: 72,
        payment_received_via: "Zelle",
        payment_confirmed_at: "2026-10-02T18:04:11.000Z",
      },
    });
    const result = await f.workflow("update_payment_amount");
    assert.equal(result.status, 200);
    assert.equal(result.order.payment_amount_received, 64);
    assert.equal(f.emails.length, 1);
    assert.equal(
      f.emails[0].body.subject,
      "Order T1B-261002-108767 amount received updated - $64.00 received (total $180.00)",
    );
    assert.equal(
      f.emails[0].headers["Idempotency-Key"],
      `order-staff-payment-received-v1/${ORDER_ID}/6400`,
    );
    assert.match(f.emails[0].body.text, /Previous amount received: \$72\.00/);
  } finally {
    console.error = previousError;
  }
});

test("a payment-received email failure cannot undo a saved payment", async t => {
  const previousError = console.error;
  console.error = () => {};
  try {
    for (const emailError of [true, "throw"]) {
      const f = workflowFixture(t, { emailError });
      const result = await f.workflow("confirm_payment");
      assert.equal(result.status, 200);
      assert.equal(result.order.payment_status, "PAID");
      assert.equal(result.order.payment_amount_received, 72);
      assert.equal(result.error, undefined);
    }
  } finally {
    console.error = previousError;
  }
});

test("failed payment confirmations and non-payment actions do not send the amount email", async t => {
  const previousError = console.error;
  console.error = () => {};
  try {
    const conflict = workflowFixture(t, { paymentError: true });
    assert.equal((await conflict.workflow("confirm_payment")).status, 409);
    assert.equal(conflict.emails.length, 0);

    const lots = workflowFixture(t, {
      order: { payment_status: "PAID", payment_amount_received: 72 },
    });
    const assigned = await lots.workflow("assign_lots");
    assert.equal(assigned.status, 200);
    assert.equal(lots.emails.length, 0);
  } finally {
    console.error = previousError;
  }
});

test("admin-orders sends the payment-received notice after a durable payment write", () => {
  const source = readFileSync("netlify/functions/admin-orders.js", "utf8");
  const created = readFileSync("netlify/functions/create-order.js", "utf8");
  assert.match(source, /sendStaffPaymentReceivedEmail\(updated/);
  assert.match(source, /action === "confirm_payment" \|\| action === "update_payment_amount"/);
  assert.match(source, /kind: action === "confirm_payment" \? "confirmed" : "updated"/);
  assert.match(source, /payment-received staff email failed/);
  assert.doesNotMatch(created, /sendStaffPaymentReceivedEmail/);
});
