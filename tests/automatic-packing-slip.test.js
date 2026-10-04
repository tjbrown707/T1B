import test from "node:test";
import assert from "node:assert/strict";
import { updateOrderWorkflow } from "../netlify/functions/admin-orders.js";
import { printFulfillment } from "../netlify/functions/_shared/print-fulfillment.js";

const id = "11111111-1111-4111-8111-111111111111";
const lotId = "33333333-3333-4333-8333-333333333333";
const user = { id: "22222222-2222-4222-8222-222222222222" };
const config = { fulfillmentConfigured: true, fulfillmentPrinterId: 42, apiKey: "test-key" };
function fixture(t, options = {}) {
  const order = { id, order_number: "T1B-260918-123456", payment_status: "AWAITING_PAYMENT", fulfillment_status: "ON_HOLD", inventory_accounting_mode: "TRACKED", created_at: "2020-01-01", fulfillment_method: "SHIP", items: [{ id: "test", name: "Test product", qty: 1 }], customer_name: "Test Customer", ...options.order };
  const events = options.events || [], jobs = [], rpcs = [];
  let lotsRequired = options.manualLotsRequired === true;
  const supabase = {
    from(table) {
      let eventType, insert;
      return {
        select() { return this; }, eq(key, value) { if (key === "event_type") eventType = value; return this; },
        in() { return this; }, order() { return this; }, maybeSingle() { return this; },
        insert(value) { insert = value; return this; },
        then(resolve, reject) {
          if (insert) { events.push(insert); return Promise.resolve({ error: null }).then(resolve, reject); }
          if (table === "orders" && order.lots_locked_at && options.hydrationError) return Promise.resolve({ error: new Error("reload unavailable") }).then(resolve, reject);
          const data = table === "orders" ? { ...order } : table === "order_events" ? events.filter(e => !eventType || e.event_type === eventType) : table === "inventory_reservations" ? [{ product_id: "test", state: "COMMITTED", quantity: 1, inventory_lots: { lot_number: "LOT-1", is_provisional: options.provisional === true } }] : [];
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
    },
    async rpc(name, args) {
      rpcs.push({ name, args });
      if (name === "get_order_lot_choices" && options.choicesError) return { error: new Error("choices unavailable") };
      if (name === "get_order_lot_choices") return { data: [{ order_id: id, lot_selection_required: lotsRequired, lot_choices: [] }] };
      if (name === "prepare_order_lots_for_fulfillment") {
        if (lotsRequired) return { error: { message: "manual_lot_assignment_required" } };
        order.lots_locked_at ||= new Date().toISOString();
        return { data: { ...order } };
      }
      if (name === "confirm_order_payment") {
        if (options.paymentError) return { error: { message: "status_conflict" } };
        order.payment_status = "PAID";
        order.fulfillment_status = order.backorder_pending ? "ON_HOLD" : "READY_TO_PICK";
        order.payment_confirmed_at ||= new Date().toISOString();
        return { data: { ...order } };
      }
      if (name === "assign_order_lots") { lotsRequired = false; order.lots_confirmed_at = new Date().toISOString(); return { data: { ...order } }; }
      if (name === "allocate_backorder") { order.backorder_pending = false; order.fulfillment_status = "READY_TO_PICK"; return { data: { ...order } }; }
      if (name === "update_order_payment_amount") return { data: { ...order } };
      if (name === "record_order_print_submission") {
        if (options.auditError) return { error: new Error("audit offline") };
        events.push({ order_id: id, event_type: "FULFILLMENT_PACKET_PRINTED", details: { printnode_job_id: args.p_printnode_job_id, automatic: args.p_automatic } });
        return { data: { readiness: "WAITING_FOR_LABEL" } };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const previous = globalThis.Netlify;
  globalThis.Netlify = { env: { get: key => options.unconfigured ? undefined : ({ PRINTNODE_API_KEY: "test-key", PRINTNODE_FULFILLMENT_PRINTER_ID: "42" })[key] } };
  t.after(() => { globalThis.Netlify = previous; });
  t.mock.method(globalThis, "fetch", async (url, request) => {
    if (url.endsWith("/printers/42")) return Response.json([{ id: 42, state: options.offline ? "offline" : "online", computer: { state: "connected" } }]);
    assert.equal(url, "https://api.printnode.com/printjobs");
    jobs.push(request);
    if (options.printError) throw new Error("unavailable");
    return new Response(String(100 + jobs.length), { status: 201 });
  });
  const print = (automatic = true) => printFulfillment({ supabase, user }, id, config, { automatic });
  const workflow = async (action = "confirm_payment", input = {}) => {
    const response = await updateOrderWorkflow(supabase, user, new Request("https://test/admin-orders", { method: "PATCH", body: JSON.stringify({ orderId: id, action, expectedPaymentStatus: action === "confirm_payment" ? "AWAITING_PAYMENT" : "PAID", paymentAmountReceived: 30, expectedPaymentAmount: 30, expectedLotAssignmentVersion: 0, assignments: [{ lotId, quantity: 1 }], ...input }) }));
    return { status: response.status, ...await response.json() };
  };
  return { print, workflow, jobs, events, rpcs, order, supabase };
}

test("confirm payment prints the paid fulfillment slip once, even for an old unpaid order", async t => {
  const f = fixture(t);
  const result = await f.workflow();
  assert.equal(result.status, 200);
  assert.equal(result.order.payment_status, "PAID");
  assert.equal(result.packingSlip.printed, true);
  assert.equal(result.order.lots_locked_at, f.order.lots_locked_at);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].headers["X-Idempotency-Key"], `payment-packing-slip/${id}`);
  assert.equal(f.events[0].event_type, "FULFILLMENT_PACKET_PRINTED");
  assert.equal(f.events[0].details.automatic, true);
  const recorded = f.rpcs.find(r => r.name === "record_order_print_submission");
  assert.equal(recorded.args.p_automatic, true);
  assert.equal(recorded.args.p_event_type, "FULFILLMENT_PACKET_PRINTED");
  f.order.lots_locked_at = "2020-01-01";
  assert.equal((await f.workflow()).packingSlip.alreadyPrinted, true);
  assert.equal(f.jobs.length, 1, "payment retries must not duplicate a durable print");
});

test("an older unpaid copy does not suppress payment printing; manual reprints remain available", async t => {
  const f = fixture(t);
  assert.equal((await f.print(false)).body.printed, true);
  assert.equal(f.events[0].event_type, "ORDER_PACKING_SLIP_PRINTED");
  assert.equal(f.jobs[0].headers["X-Idempotency-Key"], undefined);
  assert.equal((await f.workflow()).packingSlip.printed, true);
  assert.equal(f.jobs.length, 2);
  assert.equal((await f.print(false)).body.printed, true);
  assert.equal(f.jobs.length, 3);
  assert.equal(f.jobs[2].headers["X-Idempotency-Key"], undefined);
});

test("multi-lot payment defers printing until assignment is saved", async t => {
  const f = fixture(t, { manualLotsRequired: true });
  const paid = await f.workflow();
  assert.equal(paid.order.payment_status, "PAID");
  assert.deepEqual(paid.packingSlip, { printed: false, deferred: true, reason: "lots" });
  assert.equal(f.jobs.length, 0);
  assert.equal(f.order.lots_locked_at, undefined);
  const assigned = await f.workflow("assign_lots");
  assert.equal(assigned.packingSlip.printed, true);
  assert.ok(assigned.order.lots_locked_at);
  assert.equal((await f.workflow("assign_lots")).packingSlip.alreadyPrinted, true);
  assert.equal(f.jobs.length, 1);
});

for (const multipleLots of [false, true]) test(`paid backorders print after stock and lot assignment are ready, multipleLots=${multipleLots}`, async t => {
  const f = fixture(t, { manualLotsRequired: multipleLots, order: { backorder_pending: true } });
  assert.equal((await f.workflow()).packingSlip.reason, "backorder");
  assert.equal(f.jobs.length, 0);
  // A backorder can be allocated long after payment without expiring its first print.
  f.order.payment_confirmed_at = "2020-01-01";
  const allocated = await f.workflow("allocate_backorder");
  if (multipleLots) {
    assert.equal(allocated.packingSlip.reason, "lots");
    assert.equal(f.jobs.length, 0);
    assert.equal((await f.workflow("assign_lots")).packingSlip.printed, true);
  } else assert.equal(allocated.packingSlip.printed, true);
  assert.equal(f.jobs.length, 1);
});

for (const [name, options] of Object.entries({ offline: { offline: true }, failed: { printError: true }, unconfigured: { unconfigured: true }, provisional: { provisional: true } })) test(`${name} printer cannot undo payment confirmation`, async t => {
  const f = fixture(t, options);
  const result = await f.workflow();
  assert.equal(result.status, 200);
  assert.equal(result.order.payment_status, "PAID");
  assert.equal(result.packingSlip.printed, false);
  assert.ok(result.packingSlip.error);
  assert.equal(f.events.length, 0);
});

test("payment conflicts and payment-amount corrections never print", async t => {
  const f = fixture(t, { paymentError: true });
  assert.equal((await f.workflow()).status, 409);
  assert.equal(f.jobs.length, 0);
  f.order.payment_status = "PAID";
  assert.equal((await f.workflow("update_payment_amount")).packingSlip, null);
  assert.equal(f.jobs.length, 0);
});

test("automatic unpaid and completed orders refuse new print requests", async t => {
  const f = fixture(t);
  assert.equal((await f.print()).status, 409);
  f.order.payment_status = "PAID";
  f.order.fulfillment_status = "DELIVERED";
  assert.equal((await f.print()).status, 409);
  assert.equal(f.jobs.length, 0);
});

test("missing print audit retries with one stable payment-print key, then expires safely", async t => {
  const f = fixture(t, { auditError: true });
  assert.ok((await f.workflow()).packingSlip.notification.warning);
  assert.ok((await f.workflow()).packingSlip.notification.warning);
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[0].headers["X-Idempotency-Key"], f.jobs[1].headers["X-Idempotency-Key"]);
  const locked = f.order.lots_locked_at;
  assert.ok(locked);
  f.order.lots_locked_at = "2020-01-01";
  const result = await f.workflow();
  assert.equal(result.packingSlip.printed, false);
  assert.match(result.packingSlip.error, /expired/);
  assert.equal(f.jobs.length, 2);
  assert.equal((await f.print(false)).body.printed, true);
});

test("unassigned multi-lot orders never submit PDFs or queue customer email, even on direct print requests", async t => {
  const f = fixture(t, { manualLotsRequired: true, order: { payment_status: "PAID", fulfillment_status: "READY_TO_PICK" } });
  const manual = await f.print(false);
  assert.equal(manual.status, 409);
  assert.match(manual.body.error, /Assign shipment lots/);
  assert.equal((await f.print()).body.reason, "lots");
  assert.equal(f.jobs.length, 0);
  assert.equal(f.events.length, 0);
});


test("choice-loading failures keep payment saved and cannot print an unverified lot assignment", async t => {
  const f = fixture(t, { choicesError: true });
  const result = await f.workflow();
  assert.equal(result.status, 200);
  assert.equal(result.order.payment_status, "PAID");
  assert.equal(result.packingSlip.printed, false);
  assert.ok(result.warning);
  assert.equal(f.jobs.length, 0);
});

test("a post-print reload failure preserves payment and the successful print result", async t => {
  const f = fixture(t, { hydrationError: true });
  const result = await f.workflow();
  assert.equal(result.status, 200);
  assert.equal(result.order.payment_status, "PAID");
  assert.equal(result.packingSlip.printed, true);
  assert.match(result.warning, /Refresh/);
  assert.equal(f.jobs.length, 1);
});
