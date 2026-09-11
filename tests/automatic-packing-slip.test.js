import test from "node:test";
import assert from "node:assert/strict";
import { updateOrderWorkflow } from "../netlify/functions/admin-orders.js";
import { printFulfillment } from "../netlify/functions/_shared/print-fulfillment.js";

const orderId = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222" };
const config = { fulfillmentConfigured: true, fulfillmentPrinterId: 42, apiKey: "test-key" };

function fixture(t, options = {}) {
  const order = {
    id: orderId, order_number: "T1B-260910-123456", payment_status: "AWAITING_PAYMENT",
    payment_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    fulfillment_method: "SHIP", inventory_accounting_mode: "TRACKED",
    items: [{ id: "test", name: "Test product", dose: "5mg", qty: 1 }],
    customer_name: "Test Customer", total: 30, subtotal: 30,
    ...options.order,
  };
  const events = [];
  const jobs = [];
  const rpcCalls = [];
  const supabase = {
    from(table) {
      const builder = {
        select() { return this; }, eq() { return this; }, in() { return this; },
        order() { return this; }, maybeSingle() { return this; },
        then(resolve, reject) {
          if (options.throwLoad && table === "orders") return Promise.reject(new Error("load failed")).then(resolve, reject);
          let data = [];
          if (table === "orders") data = { ...order };
          if (table === "order_events") data = events;
          if (table === "inventory_reservations") data = [{
            order_id: orderId, product_id: "test", quantity: 1, state: "COMMITTED",
            inventory_lots: { lot_number: "LOT-1", is_provisional: Boolean(options.provisional), storage_location: "A1" },
          }];
          return Promise.resolve({ data, error: options.hydrationError && table === "order_shipments" ? new Error("offline") : null }).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === "confirm_order_payment") {
        if (options.paymentError) return { error: { message: "order_payment_status_conflict" } };
        order.payment_status = "PAID";
        return { data: { ...order } };
      }
      if (name === "update_order_payment_amount") return { data: { ...order, payment_amount_received: 30 } };
      if (name === "record_order_print_submission") {
        events.push({ order_id: orderId, details: { printnode_job_id: args.p_printnode_job_id } });
        return { data: { readiness: "WAITING_FOR_LABEL" } };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const previousNetlify = globalThis.Netlify;
  globalThis.Netlify = { env: { get: key => options.unconfigured ? undefined : ({ PRINTNODE_API_KEY: "test-key", PRINTNODE_FULFILLMENT_PRINTER_ID: "42" })[key] } };
  t.after(() => { globalThis.Netlify = previousNetlify; });
  t.mock.method(globalThis, "fetch", async (url, request) => {
    if (url === "https://api.printnode.com/printers/42") {
      return Response.json([{ id: 42, state: options.offline ? "offline" : "online", computer: { state: "connected" } }]);
    }
    assert.equal(url, "https://api.printnode.com/printjobs");
    assert.equal(order.payment_status, "PAID", "payment must be committed before printing");
    jobs.push(request);
    if (options.printError) throw new Error("Printer network unavailable");
    return new Response(String(100 + jobs.length), { status: 201 });
  });
  const confirm = (action = "confirm_payment") => updateOrderWorkflow(supabase, user, new Request("https://test/admin-orders", {
    method: "PATCH", body: JSON.stringify({ orderId, action, expectedPaymentStatus: action === "confirm_payment" ? "AWAITING_PAYMENT" : "PAID", paymentAmountReceived: 30, expectedPaymentAmount: 30 }),
  }));
  return { confirm, jobs, rpcCalls, order, supabase };
}

test("confirm payment automatically prints and records an automatic audit; replay does not reprint", async t => {
  const f = fixture(t);
  const response = await f.confirm();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.order.payment_status, "PAID");
  assert.equal(payload.packingSlip.printed, true);
  assert.equal(payload.order.packingSlipPrintRecorded, true);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].headers["X-Idempotency-Key"], `payment-packing-slip/${orderId}`);
  assert.equal(f.rpcCalls.find(call => call.name === "record_order_print_submission").args.p_automatic, true);
  assert.equal((await (await f.confirm()).json()).packingSlip.alreadyPrinted, true);
  assert.equal(f.jobs.length, 1);
});

test("manual print remains available after an automatic print and has no automatic deduplication key", async t => {
  const f = fixture(t);
  await f.confirm();
  const result = await printFulfillment({ supabase: f.supabase, user }, orderId, config);
  assert.equal(result.body.printed, true);
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[1].headers["X-Idempotency-Key"], undefined);
  assert.equal(f.rpcCalls.at(-1).args.p_automatic, false);
});

for (const [name, options] of Object.entries({
  "printer failure": { printError: true },
  "offline printer": { offline: true },
  "missing printer configuration": { unconfigured: true },
  "provisional lots": { provisional: true },
  "print data load failure": { throwLoad: true },
  "expired retry": { order: { payment_confirmed_at: "2020-01-01T00:00:00Z" } },
})) {
  test(`${name} preserves the confirmed payment and reports a print problem`, async t => {
    const f = fixture(t, options);
    const response = await f.confirm();
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.order.payment_status, "PAID");
    assert.equal(payload.packingSlip.printed, false);
    assert.ok(payload.packingSlip.error);
    assert.equal(f.rpcCalls.filter(call => call.name === "record_order_print_submission").length, 0);
  });
}

test("a failed payment confirmation never prints", async t => {
  const f = fixture(t, { paymentError: true });
  assert.equal((await f.confirm()).status, 409);
  assert.equal(f.jobs.length, 0);
});

test("editing the received amount never prints", async t => {
  const f = fixture(t, { order: { payment_status: "PAID" } });
  assert.equal((await f.confirm("update_payment_amount")).status, 200);
  assert.equal(f.jobs.length, 0);
});

test("a related-record reload failure still returns the saved payment and successful print", async t => {
  const f = fixture(t, { hydrationError: true });
  const response = await f.confirm();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.order.payment_status, "PAID");
  assert.equal(payload.packingSlip.printed, true);
  assert.match(payload.warning, /Refresh/);
});
