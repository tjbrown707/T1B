import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRODUCTS } from "../src/data/catalog.js";
import {
  DEFAULT_PARCEL,
  OPENING_INVENTORY_QUANTITY,
  canPrintFulfillment,
  inventoryDashboardTotals,
  inventoryProductTotals,
  lotAvailable,
} from "../src/data/inventory.js";
import { validateInventoryOperation } from "../netlify/functions/admin-inventory.js";
import { sanitiseRates, validateParcel } from "../netlify/functions/admin-shipping.js";
import { workflowRpc } from "../netlify/functions/admin-orders.js";

const migration = readFileSync(
  "supabase/migrations/20260811120000_inventory_fulfillment_foundation.sql",
  "utf8",
);

test("opening inventory is active at 50 for every catalog product", () => {
  assert.equal(OPENING_INVENTORY_QUANTITY, 50);
  assert.match(migration, /'OPENING_BALANCE',[\s\S]*?\n\s*50,/);
  assert.match(migration, /is_provisional,[\s\S]*?\n\s*50,[\s\S]*?\n\s*50,/);
  for (const product of PRODUCTS) {
    assert.match(migration, new RegExp(`\\('${product.id.replaceAll("-", "\\-")}',`));
  }
});

test("inventory arithmetic keeps reserved stock unavailable", () => {
  const product = {
    reorder_point: 5,
    lots: [
      { on_hand: 50, reserved: 7, is_provisional: true },
      { on_hand: 10, reserved: 2, is_provisional: false },
    ],
  };
  assert.equal(lotAvailable(product.lots[0]), 43);
  assert.deepEqual(inventoryProductTotals(product), {
    onHand: 60,
    reserved: 9,
    available: 51,
    provisional: true,
  });
  assert.deepEqual(inventoryDashboardTotals([product]), {
    products: 1,
    onHand: 60,
    reserved: 9,
    available: 51,
    lowStock: 0,
    provisionalProducts: 1,
  });
});

test("fulfillment stays blocked until payment, commitment, and real lot ids", () => {
  const base = {
    payment_status: "PAID",
    allocations: [{ state: "COMMITTED", lot: { is_provisional: false, lot_number: "LOT-26-A" } }],
  };
  assert.equal(canPrintFulfillment(base), true);
  assert.equal(canPrintFulfillment({ ...base, payment_status: "AWAITING_PAYMENT" }), false);
  assert.equal(canPrintFulfillment({ ...base, allocations: [] }), false);
  assert.equal(canPrintFulfillment({ ...base, allocations: [{ ...base.allocations[0], state: "RESERVED" }] }), false);
  assert.equal(canPrintFulfillment({ ...base, allocations: [{ ...base.allocations[0], lot: { is_provisional: true } }] }), false);
});

test("inventory writes reject malformed dates, silent truncation, and unsafe adjustments", () => {
  const lotId = "11111111-1111-4111-8111-111111111111";
  const receive = validateInventoryOperation({
    action: "receive_lot",
    productId: PRODUCTS[0].id,
    lotNumber: "LOT-26-A",
    supplierBatchId: "BATCH-26-A",
    quantity: 25,
    expiresOn: "2026-02-30",
    storageLocation: "Freezer A",
  });
  assert.match(receive.error, /valid expiration date/);
  assert.match(validateInventoryOperation({
    action: "receive_lot",
    productId: PRODUCTS[0].id,
    lotNumber: "x".repeat(81),
    quantity: 1,
  }).error, /real lot number/);
  assert.match(validateInventoryOperation({
    action: "adjust_lot",
    lotId,
    delta: -2,
    reason: "x".repeat(501),
  }).error, /500 characters/);
});

test("staff workflow exposes only explicit state transitions", () => {
  const ids = {
    orderId: "11111111-1111-4111-8111-111111111111",
    actorUserId: "22222222-2222-4222-8222-222222222222",
  };
  assert.equal(workflowRpc("confirm_payment", { ...ids, expectedPaymentStatus: "AWAITING_PAYMENT" }).name, "confirm_order_payment");
  assert.equal(workflowRpc("cancel_unpaid", { ...ids, expectedPaymentStatus: "PAID" }), null);
  assert.equal(workflowRpc("mark_packed", { ...ids, expectedFulfillmentStatus: "PICKED" }).args.p_target_fulfillment_status, "PACKED");
  assert.equal(workflowRpc("delete", ids), null);
});

test("operational tables are server-only and database changes are atomic", () => {
  for (const table of [
    "inventory_products",
    "inventory_lots",
    "inventory_reservations",
    "inventory_movements",
    "inventory_events",
    "order_events",
    "order_shipments",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.match(migration, /perform public\.reserve_inventory_for_order\(inserted_order\.id, inserted_order\.items\)/);
  assert.match(migration, /for update/g);
  assert.match(migration, /complete_shippo_label_purchase/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete|all) on table public\.inventory_lots to authenticated/i);
});

test("parcel defaults match the owner's package and shipping inputs are bounded", () => {
  assert.deepEqual(DEFAULT_PARCEL, {
    length: 9,
    width: 4.25,
    height: 0.5,
    weight: 1.9,
    distanceUnit: "in",
    massUnit: "oz",
  });
  assert.deepEqual(validateParcel(DEFAULT_PARCEL).data, DEFAULT_PARCEL);
  assert.match(validateParcel({ ...DEFAULT_PARCEL, weight: 16.1 }).error, /between 0.1 and 16 ounces/);
  assert.match(validateParcel({ ...DEFAULT_PARCEL, height: 0 }).error, /valid package dimensions/);
});

test("Shippo rates are reduced to safe fields and sorted by price", () => {
  const rates = sanitiseRates([
    { object_id: "a".repeat(24), amount: "9.50", provider: "Carrier B", currency: "USD", servicelevel: { name: "Priority", token: "priority" } },
    { object_id: "b".repeat(24), amount: "4.20", provider: "Carrier A", currency: "USD", servicelevel: { name: "Ground", token: "ground" } },
    { object_id: "bad", amount: "0.01" },
  ]);
  assert.deepEqual(rates.map(rate => rate.amount), [4.2, 9.5]);
  assert.equal(rates[0].provider, "Carrier A");
  assert.equal("account_id" in rates[0], false);
});
