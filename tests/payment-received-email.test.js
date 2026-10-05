import test from "node:test";
import assert from "node:assert/strict";
import { updateOrderWorkflow } from "../netlify/functions/admin-orders.js";
import { paymentReceivedIdempotencyKey, paymentVariance, renderStaffPaymentReceivedNotification } from "../netlify/functions/_shared/payment-received-email.js";
import { sendQueuedStaffPaymentEmail, drainStaffPaymentEmailQueue } from "../netlify/functions/_shared/staff-payment-email-queue.js";
import { paymentQueueFixture } from "./helpers/staff-payment-email.js";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
function sampleOrder(overrides = {}) {
  return { id: ORDER_ID, order_number: "T1B-TEST", total: 180, payment_amount_received: 72,
    customer_name: "Research Friend", customer_email: "friend@example.com", payment_received_via: "Zelle",
    payment_confirmed_at: "2026-10-04T12:00:00.000Z", updated_at: "2026-10-04T12:00:00.000Z", ...overrides };
}
function transport() {
  const calls = [], saved = new Map();
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    const key = options.headers["Idempotency-Key"];
    calls.push({ key, body: JSON.parse(options.body), raw: options.body });
    if (saved.has(key) && saved.get(key) !== options.body) return Response.json({ name: "invalid_idempotent_request" }, { status: 409 });
    saved.set(key, options.body);
    return Response.json({ id: "mock-message" });
  };
  return { calls, fetchImpl };
}
function send(queue, options = {}) {
  return sendQueuedStaffPaymentEmail({ supabase: { rpc: queue.rpc }, apiKey: "mock-key", ...options });
}

test("staff notice identifies received amount, total, variance, customer and previous amount", () => {
  const rendered = renderStaffPaymentReceivedNotification(sampleOrder(), { noticeId: EVENT_ID, kind: "updated", previousAmount: 64 });
  assert.equal(rendered.subject, "Order T1B-TEST amount received updated - $72.00 received (total $180.00)");
  assert.match(rendered.text, /Previous amount received: \$64\.00/);
  assert.match(rendered.text, /Difference: -\$108\.00 \(short \/ staff discount\)/);
  assert.match(rendered.text, /Research Friend\nfriend@example.com/);
  assert.match(rendered.text, /Zelle/);
  assert.match(rendered.text, /2026-10-04 12:00:00 UTC/);
  assert.match(rendered.html, /Open Admin Orders/);
  assert.equal(paymentVariance(180, 180).kind, "full");
  assert.equal(paymentVariance(200, 180).kind, "over");
});

test("staff email escapes untrusted customer and payment text", () => {
  const rendered = renderStaffPaymentReceivedNotification(sampleOrder({ customer_name: '<img src=x onerror="alert(1)">', payment_received_via: "<script>x</script>" }), { noticeId: EVENT_ID });
  assert.doesNotMatch(rendered.html, /<script>|<img/);
  assert.match(rendered.html, /&lt;img/);
});

test("each audit event has its own key; missing event ids fail closed", () => {
  assert.equal(paymentReceivedIdempotencyKey(EVENT_ID), `staff-payment/v1/${EVENT_ID}`);
  assert.throws(() => paymentReceivedIdempotencyKey(undefined));
  assert.throws(() => renderStaffPaymentReceivedNotification(sampleOrder()));
});

test("72 → 64 → 72 sends three distinct notices, including the final correction", async () => {
  const queue = paymentQueueFixture(), provider = transport();
  for (const [amount, kind, previous] of [[72, "confirmed", null], [64, "updated", 72], [72, "updated", 64]]) {
    queue.enqueue(sampleOrder({ payment_amount_received: amount }), kind, previous);
    assert.equal((await send(queue, { fetchImpl: provider.fetchImpl })).state, "SENT");
  }
  assert.equal(new Set(provider.calls.map(call => call.key)).size, 3);
  assert.match(provider.calls[2].body.text, /Previous amount received: \$64\.00/);
  assert.equal(provider.calls[2].body.to[0], "sales@tierone.bio");
  assert.equal(provider.calls[2].body.reply_to, "friend@example.com");
  assert.equal((await send(queue, { fetchImpl: provider.fetchImpl })).state, "UNCHANGED");
  assert.equal(provider.calls.length, 3);
});

test("provider outage retries the frozen payload even after deployment and order changes", async () => {
  const queue = paymentQueueFixture(), provider = transport();
  const order = sampleOrder(), row = queue.enqueue(order);
  let first;
  const failed = await send(queue, { fromAddress: "Old <noreply@tierone.bio>", fetchImpl: async (_url, options) => { first = options; return new Response("down", { status: 503 }); } });
  assert.equal(failed.state, "QUEUED");
  assert.equal(row.status, "ERROR");
  order.payment_amount_received = 1;
  order.customer_name = "Changed";
  const retried = await send(queue, { fromAddress: "New <noreply@tierone.bio>", fetchImpl: provider.fetchImpl });
  assert.equal(retried.state, "SENT");
  assert.equal(provider.calls[0].raw, first.body);
  assert.equal(provider.calls[0].key, first.headers["Idempotency-Key"]);
  assert.match(provider.calls[0].body.text, /Amount received: \$72\.00/);
});

for (const [status, name, expected] of [[429, "rate_limit", "QUEUED"], [409, "concurrent_idempotent_requests", "QUEUED"], [409, "invalid_idempotent_request", "NEEDS_REVIEW"], [401, "invalid_key", "NEEDS_REVIEW"]]) {
  test(`HTTP ${status} ${name} is classified as ${expected}`, async () => {
    const queue = paymentQueueFixture(); queue.enqueue(sampleOrder());
    assert.equal((await send(queue, { fetchImpl: async () => Response.json({ name }, { status }) })).state, expected);
  });
}

test("missing key, network errors and ambiguous provider responses keep the notice recoverable", async () => {
  for (const options of [{ apiKey: "", fetchImpl: async () => { throw new Error("must not send"); } }, { fetchImpl: async () => { throw new Error("timeout"); } }, { fetchImpl: async () => Response.json({}) }]) {
    const queue = paymentQueueFixture(); queue.enqueue(sampleOrder());
    assert.equal((await send(queue, options)).state, "QUEUED");
    assert.equal(queue.rows[0].status, "ERROR");
  }
});

test("claim and prepare failures cannot issue an unrecorded email", async () => {
  for (const rpcError of ["claim_staff_payment_email", "prepare_staff_payment_email"]) {
    const queue = paymentQueueFixture({ rpcError }); queue.enqueue(sampleOrder());
    const provider = transport();
    assert.equal((await send(queue, { fetchImpl: provider.fetchImpl })).state, "QUEUED");
    assert.equal(provider.calls.length, 0);
  }
});

test("accepted sends with an unconfirmed database completion recover with the same payload", async () => {
  const queue = paymentQueueFixture({ rpcError: "complete_staff_payment_email" }), provider = transport();
  const row = queue.enqueue(sampleOrder());
  assert.equal((await send(queue, { fetchImpl: provider.fetchImpl })).state, "QUEUED");
  assert.equal(row.status, "SENDING");
  // PostgreSQL verifies the lease-expiry recovery; simulate the next claim here.
  row.status = "ERROR";
  await send(queue, { fetchImpl: provider.fetchImpl });
  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[0].key, provider.calls[1].key);
  assert.equal(provider.calls[0].raw, provider.calls[1].raw);
});

test("scheduled drain stops on outages and bounds successful sends", async () => {
  const queue = paymentQueueFixture();
  queue.enqueue(sampleOrder()); queue.enqueue(sampleOrder()); queue.enqueue(sampleOrder());
  const options = { supabase: { rpc: queue.rpc }, apiKey: "mock", limit: 2 };
  assert.equal((await drainStaffPaymentEmailQueue({ ...options, fetchImpl: async () => new Response(null, { status: 503 }) })).length, 1);
  const provider = transport();
  assert.equal((await drainStaffPaymentEmailQueue({ ...options, fetchImpl: provider.fetchImpl })).length, 2);
  assert.equal(provider.calls.length, 2);
});

function workflowFixture(t, { emailError = false, paymentError = false, queueError = false } = {}) {
  const order = { ...sampleOrder(), payment_status: "AWAITING_PAYMENT", payment_amount_received: null,
    fulfillment_status: "ON_HOLD", backorder_pending: true, inventory_accounting_mode: "TRACKED", fulfillment_method: "SHIP" };
  const queue = paymentQueueFixture({ rpcError: queueError ? "claim_staff_payment_email" : undefined });
  const provider = transport();
  const supabase = {
    from(table) { return { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, maybeSingle() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: table === "orders" ? order : table === "staff_payment_email_outbox" ? queue.rows : [] }).then(resolve, reject); } }; },
    async rpc(name, args) {
      if (name.includes("staff_payment_email")) return queue.rpc(name, args);
      if (name === "get_order_lot_choices") return { data: [] };
      if (paymentError) return { error: { message: "status_conflict" } };
      const previous = order.payment_amount_received;
      const kind = name === "confirm_order_payment" ? "confirmed" : "updated";
      const changed = order.payment_status !== "PAID" || previous !== args.p_payment_amount_received;
      order.payment_status = "PAID";
      order.payment_amount_received = args.p_payment_amount_received;
      if (changed) queue.enqueue(order, kind, previous);
      return { data: { ...order } };
    },
  };
  const previous = globalThis.Netlify;
  globalThis.Netlify = { env: { get: key => key === "RESEND_API_KEY" ? "mock-key" : undefined } };
  t.after(() => { globalThis.Netlify = previous; });
  t.mock.method(globalThis, "fetch", emailError ? async () => new Response(null, { status: 503 }) : provider.fetchImpl);
  const workflow = async (action = "confirm_payment", amount = 72) => {
    const response = await updateOrderWorkflow(supabase, { id: EVENT_ID }, new Request("https://test/admin-orders", { method: "PATCH", body: JSON.stringify({ orderId: ORDER_ID, action,
      expectedPaymentStatus: action === "confirm_payment" ? "AWAITING_PAYMENT" : "PAID", paymentAmountReceived: amount, expectedPaymentAmount: order.payment_amount_received ?? 0 }) }));
    return { status: response.status, ...await response.json() };
  };
  return { workflow, queue, provider };
}

test("actual workflow sends confirmation and repeated-value corrections; no-op edits/retries do not send", async t => {
  const f = workflowFixture(t);
  for (const [action, amount] of [["confirm_payment", 72], ["update_payment_amount", 64], ["update_payment_amount", 72]]) {
    const result = await f.workflow(action, amount);
    assert.equal(result.status, 200);
    assert.equal(result.order.payment_amount_received, amount);
    assert.equal(result.paymentEmail.state, "SENT");
    assert.equal(result.order.paymentEmails.at(-1).status, "SENT");
  }
  await f.workflow("update_payment_amount", 72);
  await f.workflow("confirm_payment", 72);
  assert.equal(f.queue.rows.length, 3);
  assert.equal(f.provider.calls.length, 3);
});

test("email/provider or queue failures preserve payment and surface a separate warning", async t => {
  for (const options of [{ emailError: true }, { queueError: true }]) {
    const f = workflowFixture(t, options), result = await f.workflow();
    assert.equal(result.status, 200);
    assert.equal(result.order.payment_status, "PAID");
    assert.equal(result.order.payment_amount_received, 72);
    assert.equal(result.paymentEmail.state, "QUEUED");
    assert.match(result.paymentEmail.warning, /Payment is saved/);
  }
});

test("payment conflicts do not queue or send", async t => {
  const f = workflowFixture(t, { paymentError: true });
  assert.equal((await f.workflow()).status, 409);
  assert.equal(f.queue.rows.length, 0);
  assert.equal(f.provider.calls.length, 0);
});
