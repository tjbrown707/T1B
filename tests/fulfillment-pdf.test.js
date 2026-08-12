import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import {
  assertOrderPrintable,
  buildFulfillmentPdf,
} from "../netlify/functions/_shared/fulfillment-pdf.js";

function printableOrder() {
  return {
    order_number: "T1B-260811-123456",
    payment_status: "PAID",
    payment_confirmed_at: "2026-08-11T17:00:00.000Z",
    created_at: "2026-08-11T16:45:00.000Z",
    payment_method: "Venmo",
    customer_name: "Research Customer",
    ship_address: "123 Lab Road",
    ship_city: "Phoenix",
    ship_state: "AZ",
    ship_zip: "85001",
    subtotal: 100,
    discount_amount: 10,
    shipping: 0,
    total: 90,
    items: [{ id: "bpc157-5", name: "BPC-157", dose: "5 mg", qty: 2, lineTotal: 100 }],
    allocations: [{
      productId: "bpc157-5",
      quantity: 2,
      state: "COMMITTED",
      lot: { lot_number: "LOT-26-A", is_provisional: false, storage_location: "Freezer A / Bin 2" },
    }],
  };
}

test("the fulfillment PDF contains a pick ticket and packing slip", async () => {
  const bytes = await buildFulfillmentPdf(printableOrder());
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.length > 2_000);
});

test("PDF generation fails closed for unpaid, uncommitted, or provisional orders", async () => {
  const order = printableOrder();
  assert.equal(assertOrderPrintable({ ...order, payment_status: "AWAITING_PAYMENT" }), "Confirm payment before printing fulfillment documents.");
  assert.equal(assertOrderPrintable({ ...order, fulfillment_method: "LOCAL_HANDOFF" }), "Local handoff orders do not create a fulfillment packet.");
  assert.match(assertOrderPrintable({ ...order, allocations: [{ ...order.allocations[0], state: "RESERVED" }] }), /not been committed/);
  assert.match(assertOrderPrintable({ ...order, allocations: [{ ...order.allocations[0], lot: { is_provisional: true } }] }), /real lot number/);
  await assert.rejects(() => buildFulfillmentPdf({ ...order, allocations: [] }), /no inventory allocation/);
});
