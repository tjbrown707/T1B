import test from "node:test";
import assert from "node:assert/strict";
import { initialLotQuantities, validateLotQuantities, canAssignOrderLots } from "../src/data/lot-assignment.js";
import { canPrintFulfillment } from "../src/data/inventory.js";
import { nextFulfillmentAction } from "../src/data/order-management.js";
import { assertOrderPrintable } from "../netlify/functions/_shared/fulfillment-pdf.js";
import { workflowRpc, workflowError } from "../netlify/functions/admin-orders.js";
import { prepareFulfillmentLots, loadLotChoices } from "../netlify/functions/_shared/lot-assignment.js";
const old = "11111111-1111-4111-8111-111111111111";
const newer = "22222222-2222-4222-8222-222222222222";
const products = [{ productId: "glp3rt-10", quantity: 3, lots: [
  { id: old, lotNumber: "OLD", assigned: 0, capacity: 10 },
  { id: newer, lotNumber: "NEW", assigned: 3, capacity: 20 },
] }];
const order = { payment_status: "PAID", fulfillment_status: "READY_TO_PICK", fulfillment_method: "SHIP", inventory_accounting_mode: "TRACKED", lot_selection_required: true, lot_choices: products, allocations: [{ state: "COMMITTED", lot: { lot_number: "NEW" } }] };
test("multi-lot selection starts blank, with no implicit confirmation of checkout's choice", () => {
  assert.deepEqual(initialLotQuantities(products), { [old]: "0", [newer]: "0" });
  assert.deepEqual(initialLotQuantities(products, true), { [old]: "0", [newer]: "3" });
  assert.deepEqual(initialLotQuantities([{ ...products[0], lots: [products[0].lots[1]] }]), { [newer]: "3" });
});
test("lot picker accepts one lot or splits but requires exactly the ordered quantity", () => {
  assert.deepEqual(validateLotQuantities(products, { [old]: "3", [newer]: "0" }).assignments, [{ lotId: old, quantity: 3 }]);
  assert.deepEqual(validateLotQuantities(products, { [old]: "1", [newer]: "2" }).assignments, [{ lotId: old, quantity: 1 }, { lotId: newer, quantity: 2 }]);
  for (const q of [{ [old]: "2", [newer]: "0" }, { [old]: "11", [newer]: "0" }, { [old]: "1.5", [newer]: "1.5" }, { [old]: "-1", [newer]: "4" }, { [old]: "", [newer]: "3" }]) assert.ok(validateLotQuantities(products, q).error);
  const bad = structuredClone(products); bad[0].lots[0].isProvisional = true;
  assert.ok(validateLotQuantities(bad, { [old]: "3", [newer]: "0" }).error);
  bad[0].lots[0].isProvisional = false; bad[0].lots[0].expiresOn = "2020-01-01";
  assert.ok(validateLotQuantities(bad, { [old]: "3", [newer]: "0" }).error);
});
test("unconfirmed lots block picking, packing slips and local handoff, but permit unpaid order copies", () => {
  assert.equal(canPrintFulfillment(order), false);
  assert.equal(nextFulfillmentAction(order), null);
  assert.ok(assertOrderPrintable(order));
  assert.equal(nextFulfillmentAction({ ...order, fulfillment_method: "LOCAL_HANDOFF", packingSlipPrintRecorded: true, trackingEmail: { fulfillment_method: "LOCAL_HANDOFF", template_version: 2 } }), null);
  assert.equal(canPrintFulfillment({ ...order, payment_status: "AWAITING_PAYMENT", items: [{ id: "glp3rt-10", qty: 3 }] }), true);
  assert.equal(canAssignOrderLots(order), true);
  for (const patch of [{ payment_status: "AWAITING_PAYMENT" }, { fulfillment_status: "PICKED" }, { lots_locked_at: "2026-10-04" }, { packingSlipPrintRecorded: true }, { backorder_pending: true }, { inventory_accounting_mode: "PRECOUNTED_LEGACY" }]) assert.equal(canAssignOrderLots({ ...order, ...patch }), false);
});
test("server validates assignment payload and forwards only quantities, lot IDs, version and staff identity", () => {
  const input = { orderId: old, actorUserId: newer, expectedLotAssignmentVersion: 0, assignments: [{ lotId: old, quantity: 3 }] };
  assert.deepEqual(workflowRpc("assign_lots", input), { name: "assign_order_lots", args: { p_order_id: old, p_actor_user_id: newer, p_expected_version: 0, p_assignments: input.assignments } });
  for (const patch of [{ expectedLotAssignmentVersion: undefined }, { expectedLotAssignmentVersion: -1 }, { assignments: [] }, { assignments: [{ lotId: "bad", quantity: 1 }] }, { assignments: [{ lotId: old, quantity: 1.5 }] }, { assignments: [{ lotId: old, quantity: 0 }] }, { assignments: [{ lotId: old, quantity: 1 }, { lotId: old, quantity: 2 }] }]) assert.equal(workflowRpc("assign_lots", { ...input, ...patch }), null);
});
test("document preparation requires a verified server snapshot and gives actionable lot errors", async () => {
  let args;
  const result = await prepareFulfillmentLots({ rpc: async (name, input) => { args = { name, input }; return { data: order }; } }, old);
  assert.deepEqual(args, { name: "prepare_order_lots_for_fulfillment", input: { p_order_id: old } });
  assert.equal(result.order, order);
  assert.ok((await prepareFulfillmentLots({ rpc: async () => ({ error: { message: "manual_lot_assignment_required" } }) }, old)).error.includes("Assign"));
  assert.ok((await prepareFulfillmentLots({ rpc: async () => ({ data: null }) }, old)).error);
  assert.equal((await loadLotChoices({ rpc: async () => ({ data: [{ order_id: old, lot_selection_required: true, lot_choices: products }] }) }, [old])).get(old).lot_selection_required, true);
  await assert.rejects(loadLotChoices({ rpc: async () => ({ error: new Error("offline") }) }, [old]));
  for (const message of ["manual_lot_assignment_required", "lot_assignment_status_conflict", "lot_assignment_locked", "lot_assignment_insufficient_stock"]) assert.equal(workflowError({ message }, "assign_lots").status, 409);
});
