import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  ORDER_STATUS_VALUES,
  canDeleteOrder,
  hasOrderManagerRole,
  isOrderStatus,
} from "../src/data/order-management.js";
import {
  decodeCursor,
  encodeCursor,
  parseLimit,
  sanitiseSearch,
} from "../netlify/functions/admin-orders.js";

test("the order console accepts only the shared status vocabulary", () => {
  for (const status of ORDER_STATUS_VALUES) assert.equal(isOrderStatus(status), true);
  assert.equal(isOrderStatus("FREE PRODUCT"), false);
  assert.equal(isOrderStatus("paid"), false);
});

test("order-manager authorization trusts app metadata, never customer metadata", () => {
  assert.equal(hasOrderManagerRole({ app_metadata: { role: "admin" } }), true);
  assert.equal(hasOrderManagerRole({ app_metadata: { role: "order_manager" } }), true);
  assert.equal(hasOrderManagerRole({ user_metadata: { role: "admin" } }), false);
  assert.equal(hasOrderManagerRole({ app_metadata: { role: "customer" } }), false);
});

test("permanent deletion is limited to already-cancelled orders", () => {
  assert.equal(canDeleteOrder("CANCELLED"), true);
  for (const status of ORDER_STATUS_VALUES.filter(status => status !== "CANCELLED")) {
    assert.equal(canDeleteOrder(status), false);
  }
  assert.equal(canDeleteOrder("cancelled"), false);
});

test("pagination cursors round-trip and reject malformed ids", () => {
  const order = {
    id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-08-10T12:34:56.000Z",
  };
  assert.deepEqual(decodeCursor(encodeCursor(order)), {
    id: order.id,
    createdAt: order.created_at,
  });
  assert.equal(decodeCursor(Buffer.from('{"id":"not-a-uuid"}').toString("base64url")), null);
});

test("search and page-size inputs are bounded before reaching PostgREST", () => {
  assert.equal(sanitiseSearch("  Smith),status.eq.PAID  "), "Smithstatus.eq.PAID");
  assert.equal(sanitiseSearch("buyer+ops@example.com"), "buyer+ops@example.com");
  assert.equal(parseLimit("1"), 10);
  assert.equal(parseLimit("500"), 100);
  assert.equal(parseLimit("nope"), 50);
});
