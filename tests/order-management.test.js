import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  ORDER_STATUS_VALUES,
  canCompleteLocalHandoff,
  canDeleteOrder,
  hasOrderManagerRole,
  isLocalHandoff,
  isPrecountedOrder,
  isOrderStatus,
  nextFulfillmentAction,
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

test("orders remain permanent audit records even after cancellation", () => {
  for (const status of ORDER_STATUS_VALUES) assert.equal(canDeleteOrder(status), false);
  assert.equal(canDeleteOrder("cancelled"), false);
});

test("local handoff completion unlocks only after the durable print and email records", () => {
  const order = {
    payment_status: "PAID",
    fulfillment_status: "READY_TO_PICK",
    fulfillment_method: "LOCAL_HANDOFF",
  };
  assert.equal(isLocalHandoff(order), true);
  assert.equal(canCompleteLocalHandoff(order), false);
  assert.equal(nextFulfillmentAction(order), null);

  const ready = {
    ...order,
    packingSlipPrintRecorded: true,
    trackingEmail: { fulfillment_method: "LOCAL_HANDOFF", template_version: 2, status: "PENDING" },
  };
  assert.equal(canCompleteLocalHandoff(ready), true);
  assert.deepEqual(nextFulfillmentAction(ready), {
    action: "mark_handed_off",
    label: "Mark Handed Off",
    target: "DELIVERED",
  });
  assert.equal(canCompleteLocalHandoff({ ...ready, packingSlipPrintRecorded: false }), false);
  assert.equal(canCompleteLocalHandoff({ ...ready, trackingEmail: { ...ready.trackingEmail, template_version: 1 } }), false);
  assert.equal(nextFulfillmentAction({ ...order, fulfillment_method: "SHIP" }).action, "mark_picked");
});
test("pre-counted cutoff orders are identified independently of fulfillment", () => {
  assert.equal(isPrecountedOrder({ inventory_accounting_mode: "PRECOUNTED_LEGACY" }), true);
  assert.equal(isPrecountedOrder({ inventory_accounting_mode: "TRACKED" }), false);
  assert.equal(isPrecountedOrder({}), false);
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
