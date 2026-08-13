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
  inventoryRetailValue,
  lotAvailable,
} from "../src/data/inventory.js";
import { validateInventoryOperation } from "../netlify/functions/admin-inventory.js";
import { sanitiseRates, validateParcel } from "../netlify/functions/admin-shipping.js";
import { parsePaymentAmount, workflowRpc } from "../netlify/functions/admin-orders.js";

const migration = readFileSync(
  "supabase/migrations/20260811120000_inventory_fulfillment_foundation.sql",
  "utf8",
);
const localHandoffMigration = readFileSync(
  "supabase/migrations/20260812051446_local_handoff_and_inventory_value.sql",
  "utf8",
);
const paymentAmountMigration = readFileSync(
  "supabase/migrations/20260813051208_record_payment_amount_received.sql",
  "utf8",
);
const precountedOrdersMigration = readFileSync(
  "supabase/migrations/20260813052015_protect_precounted_legacy_orders.sql",
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
  assert.equal(inventoryRetailValue([
    { product_id: "a", lots: [{ on_hand: 4 }] },
    { product_id: "b", lots: [{ on_hand: 3 }] },
  ], [
    { id: "a", price: 25 },
    { id: "b", price: 40 },
  ]), 220);
});

test("fulfillment stays blocked until payment, commitment, and real lot ids", () => {
  const base = {
    payment_status: "PAID",
    allocations: [{ state: "COMMITTED", lot: { is_provisional: false, lot_number: "LOT-26-A" } }],
  };
  assert.equal(canPrintFulfillment(base), true);
  assert.equal(canPrintFulfillment({ ...base, payment_status: "AWAITING_PAYMENT" }), false);
  assert.equal(canPrintFulfillment({ ...base, fulfillment_method: "LOCAL_HANDOFF" }), false);
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
  const localConfirmation = workflowRpc("confirm_payment", {
    ...ids,
    expectedPaymentStatus: "AWAITING_PAYMENT",
    fulfillmentMethod: "LOCAL_HANDOFF",
    paymentReceivedVia: "Cash",
    paymentAmountReceived: "25.50",
  });
  assert.equal(localConfirmation.name, "confirm_order_payment");
  assert.equal(localConfirmation.args.p_fulfillment_method, "LOCAL_HANDOFF");
  assert.equal(localConfirmation.args.p_payment_received_via, "Cash");
  assert.equal(localConfirmation.args.p_payment_amount_received, 25.5);
  const correction = workflowRpc("update_payment_amount", {
    ...ids,
    expectedPaymentStatus: "PAID",
    expectedPaymentAmount: "25.50",
    paymentAmountReceived: "20.00",
  });
  assert.equal(correction.name, "update_order_payment_amount");
  assert.equal(correction.args.p_expected_payment_amount, 25.5);
  assert.equal(correction.args.p_payment_amount_received, 20);
  assert.equal(workflowRpc("cancel_unpaid", { ...ids, expectedPaymentStatus: "PAID" }), null);
  assert.equal(workflowRpc("mark_packed", { ...ids, expectedFulfillmentStatus: "PICKED" }).args.p_target_fulfillment_status, "PACKED");
  assert.equal(workflowRpc("mark_handed_off", { ...ids, expectedFulfillmentStatus: "READY_TO_PICK" }).args.p_target_fulfillment_status, "DELIVERED");
  assert.equal(workflowRpc("delete", ids), null);
});

test("payment amounts accept exact cents and reject malformed values", () => {
  assert.equal(parsePaymentAmount("0"), 0);
  assert.equal(parsePaymentAmount("19.95"), 19.95);
  assert.equal(parsePaymentAmount("19.999"), null);
  assert.equal(parsePaymentAmount("-1"), null);
  assert.equal(parsePaymentAmount(""), null);
  assert.equal(workflowRpc("confirm_payment", {
    orderId: "11111111-1111-4111-8111-111111111111",
    actorUserId: "22222222-2222-4222-8222-222222222222",
    expectedPaymentStatus: "AWAITING_PAYMENT",
    fulfillmentMethod: "SHIP",
    paymentReceivedVia: "Cash",
    paymentAmountReceived: "not money",
  }), null);
});

test("local handoff is persisted and shipping is blocked in the database", () => {
  assert.match(localHandoffMigration, /fulfillment_method text not null default 'SHIP'/);
  assert.match(localHandoffMigration, /payment_received_via text/);
  assert.match(localHandoffMigration, /LOCAL_HANDOFF_COMPLETED/);
  assert.match(localHandoffMigration, /create trigger order_shipments_block_local_handoff/);
  assert.match(localHandoffMigration, /local_handoff_does_not_ship/);
  assert.match(localHandoffMigration, /revoke execute on function public\.confirm_order_payment\(uuid, text, text, text, uuid\)/);
  assert.match(paymentAmountMigration, /payment_amount_received numeric\(10, 2\)/);
  assert.match(paymentAmountMigration, /PAYMENT_AMOUNT_CORRECTED/);
  assert.match(paymentAmountMigration, /revoke execute on function public\.update_order_payment_amount\(uuid, numeric, numeric, uuid\)/);
  assert.match(precountedOrdersMigration, /inventory_accounting_mode text not null default 'TRACKED'/);
  assert.match(precountedOrdersMigration, /2026-08-11 00:00:00 America\/Phoenix/);
  assert.match(precountedOrdersMigration, /selected_order\.inventory_accounting_mode = 'TRACKED'/);
  assert.match(precountedOrdersMigration, /'inventory_changed', selected_order\.inventory_accounting_mode = 'TRACKED'/);
  assert.doesNotMatch(precountedOrdersMigration, /legacy-precounted-restore:/);
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
