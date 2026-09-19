import test from "node:test";
import assert from "node:assert/strict";
import { updateOrderWorkflow } from "../netlify/functions/admin-orders.js";
import { printFulfillment } from "../netlify/functions/_shared/print-fulfillment.js";

const id = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222" };
const config = { fulfillmentConfigured: true, fulfillmentPrinterId: 42, apiKey: "test-key" };
function fixture(t, options = {}) {
  const order = { id, order_number: "T1B-260918-123456", payment_status: "AWAITING_PAYMENT", created_at: new Date().toISOString(), fulfillment_method: "SHIP", items: [{ id: "test", name: "Test product", qty: 1 }], customer_name: "Test Customer", ...options.order };
  const events = [], jobs = [], rpcs = [];
  const supabase = {
    from(table) {
      let eventType, insert;
      return {
        select() { return this; }, eq(key, value) { if (key === "event_type") eventType = value; return this; },
        in() { return this; }, order() { return this; }, maybeSingle() { return this; },
        insert(value) { insert = value; return this; },
        then(resolve, reject) {
          if (insert) { if (!options.auditError) events.push(insert); return Promise.resolve({ error: options.auditError ? new Error("audit offline") : null }).then(resolve, reject); }
          const data = table === "orders" ? order : table === "order_events" ? events.filter(e => e.event_type === eventType) : table === "inventory_reservations" ? [{ product_id: "test", state: "COMMITTED", quantity: 1, inventory_lots: { lot_number: "LOT-1", is_provisional: false } }] : [];
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
    },
    async rpc(name, args) {
      rpcs.push(name);
      if (name === "confirm_order_payment") { order.payment_status = "PAID"; return { data: order }; }
      if (name === "record_order_print_submission") { events.push({ event_type: "FULFILLMENT_PACKET_PRINTED", details: { printnode_job_id: args.p_printnode_job_id } }); return { data: { readiness: "WAITING_FOR_LABEL" } }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const previous = globalThis.Netlify;
  globalThis.Netlify = { env: { get: key => ({ PRINTNODE_API_KEY: "test-key", PRINTNODE_FULFILLMENT_PRINTER_ID: "42" })[key] } };
  t.after(() => { globalThis.Netlify = previous; });
  t.mock.method(globalThis, "fetch", async (url, request) => {
    if (url.endsWith("/printers/42")) return Response.json([{ id: 42, state: options.offline ? "offline" : "online", computer: { state: "connected" } }]);
    assert.equal(url, "https://api.printnode.com/printjobs");
    jobs.push(request);
    if (options.printError) throw new Error("unavailable");
    return new Response(String(100 + jobs.length), { status: 201 });
  });
  const print = (automatic = true) => printFulfillment({ supabase, user }, id, config, { automatic });
  return { print, jobs, events, rpcs, order, supabase };
}

for (const backorder_pending of [false, true]) test(`order arrival prints before payment, backorder=${backorder_pending}, replay does not duplicate`, async t => {
  const f = fixture(t, { order: { backorder_pending } });
  assert.equal((await f.print()).body.printed, true);
  assert.equal((await f.print()).body.alreadyPrinted, true);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].headers["X-Idempotency-Key"], `order-packing-slip/${id}`);
  assert.equal(f.events[0].event_type, "ORDER_PACKING_SLIP_PRINTED");
  assert.equal(f.events[0].details.automatic, true);
  assert.equal(f.rpcs.length, 0, "order copy must not queue fulfillment email or mutate inventory");
  assert.equal(f.order.payment_status, "AWAITING_PAYMENT");
});

test("manual reprint works before payment and after payment retains fulfillment audit/email path", async t => {
  const f = fixture(t);
  await f.print();
  assert.equal((await f.print(false)).body.printed, true);
  assert.equal(f.jobs[1].headers["X-Idempotency-Key"], undefined);
  f.order.payment_status = "PAID";
  assert.equal((await f.print(false)).body.printed, true);
  assert.deepEqual(f.rpcs, ["record_order_print_submission"]);
});

test("confirming payment never creates a duplicate print", async t => {
  const f = fixture(t);
  await f.print();
  const response = await updateOrderWorkflow(f.supabase, user, new Request("https://test/admin-orders", { method: "PATCH", body: JSON.stringify({ orderId: id, action: "confirm_payment", expectedPaymentStatus: "AWAITING_PAYMENT", paymentAmountReceived: 30 }) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.payment_status, "PAID");
  assert.equal(f.jobs.length, 1);
});

for (const [name, options] of Object.entries({ offline: { offline: true }, failed: { printError: true }, expired: { order: { created_at: "2020-01-01" } }, cancelled: { order: { status: "CANCELLED" } } })) test(`${name} order-arrival print fails without a fulfillment event`, async t => {
  const f = fixture(t, options);
  assert.equal((await f.print()).body.printed, false);
  assert.equal(f.events.length, 0);
  assert.equal(f.rpcs.length, 0);
});

test("missing configuration fails without network calls", async t => {
  const f = fixture(t);
  const result = await printFulfillment({ supabase: f.supabase, user }, id, {}, { automatic: true });
  assert.equal(result.status, 503);
  assert.equal(f.jobs.length, 0);
});

test("missing print audit retries with the same PrintNode idempotency key", async t => {
  const f = fixture(t, { auditError: true });
  assert.ok((await f.print()).body.warning);
  await f.print();
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[0].headers["X-Idempotency-Key"], f.jobs[1].headers["X-Idempotency-Key"]);
});
