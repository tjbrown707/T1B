import test from "node:test";
import assert from "node:assert/strict";

import {
  config,
  releaseExpiredReservations,
} from "../netlify/functions/release-stale-unpaid-orders.js";

function mockSupabase(orders, rpcResults) {
  const filters = [];
  const calls = [];
  const query = {
    select(value) { filters.push(["select", value]); return this; },
    eq(column, value) { filters.push(["eq", column, value]); return this; },
    not(column, operator, value) { filters.push(["not", column, operator, value]); return this; },
    lte(column, value) { filters.push(["lte", column, value]); return this; },
    order(column, options) { filters.push(["order", column, options]); return this; },
    async limit(value) { filters.push(["limit", value]); return { data: orders, error: null }; },
  };
  return {
    filters,
    calls,
    client: {
      from(table) { filters.push(["from", table]); return query; },
      async rpc(name, args) {
        calls.push({ name, args });
        return rpcResults.shift() || { data: {}, error: null };
      },
    },
  };
}

test("the hourly release job cancels only rows selected by their durable expiry", async () => {
  const orders = [
    { id: "1", order_number: "T1B-1" },
    { id: "2", order_number: "T1B-2" },
    { id: "3", order_number: "T1B-3" },
  ];
  const mock = mockSupabase(orders, [
    { data: {}, error: null },
    { data: null, error: { message: "paid_order_requires_refund" } },
    { data: null, error: { message: "inventory_counter_mismatch" } },
  ]);
  const previousError = console.error;
  console.error = () => {};
  try {
    const summary = await releaseExpiredReservations({
      supabase: mock.client,
      now: new Date("2026-08-25T12:00:00.000Z"),
    });
    assert.deepEqual(summary, { examined: 3, released: 1, skipped: 1, failed: 1 });
  } finally {
    console.error = previousError;
  }
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls.every(call => call.name === "cancel_unpaid_order"));
  assert.ok(mock.calls.every(call => call.args.p_expected_payment_status === "AWAITING_PAYMENT"));
  assert.ok(mock.calls.every(call => call.args.p_actor_user_id === null));
  assert.deepEqual(
    mock.filters.find(filter => filter[0] === "lte"),
    ["lte", "reservation_expires_at", "2026-08-25T12:00:00.000Z"],
  );
  assert.equal(config.schedule, "17 * * * *");
});
