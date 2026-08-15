import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";

import {
  assertOrderPrintable,
  buildFulfillmentPdf,
  buildPackingRows,
  isAllocationlessLegacyLocalHandoff,
  packingRowLayout,
} from "../netlify/functions/_shared/fulfillment-pdf.js";

function printableOrder() {
  return {
    order_number: "T1B-260811-123456",
    payment_status: "PAID",
    fulfillment_method: "SHIP",
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

test("a normal order produces one branded packing slip page", async () => {
  const bytes = await buildFulfillmentPdf(printableOrder());
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.length > 2_000);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), "Tier One packing slip - T1B-260811-123456");
  assert.equal(document.getAuthor(), "Tier One BioSystems");
  assert.deepEqual(document.getPage(0).getSize(), { width: 612, height: 792 });
  const resources = document.getPage(0).node.Resources();
  const images = resources.lookup(PDFName.of("XObject"), PDFDict);
  assert.ok(images.keys().length > 0, "the horizontal logo should be embedded");
  assert.match(readFileSync("netlify.toml", "utf8"), /public\/logo-wide\.png/);
});

test("the packing rows preserve split lots, locations, and allocated quantities", () => {
  const order = printableOrder();
  const rows = buildPackingRows({
    ...order,
    allocations: [
      {
        ...order.allocations[0],
        quantity: 1,
        lot: { lot_number: "LOT-26-A", is_provisional: false, storage_location: "Freezer A / Bin 2" },
      },
      {
        ...order.allocations[0],
        quantity: 1,
        lot: { lot_number: "LOT-26-B", is_provisional: false, storage_location: "Freezer B / Bin 4" },
      },
    ],
  });
  assert.deepEqual(rows.map(row => ({
    lotNumber: row.lotNumber,
    storageLocation: row.storageLocation,
    quantity: row.quantity,
  })), [
    { lotNumber: "LOT-26-A", storageLocation: "Freezer A / Bin 2", quantity: 1 },
    { lotNumber: "LOT-26-B", storageLocation: "Freezer B / Bin 4", quantity: 1 },
  ]);
});

test("long picking fields wrap without clipping or crossing into adjacent rows", async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lotNumber = `LOT-${"X".repeat(76)}`;
  const storageLocation = `Ultra Cold Freezer Storage Location ${"B".repeat(90)}`.slice(0, 120);
  const layout = packingRowLayout(font, {
    item: "BPC-157 laboratory reference material 5 mg",
    lotNumber,
    storageLocation,
  });
  const withoutSpaces = value => value.replace(/\s/g, "");
  assert.equal(withoutSpaces(layout.lotLines.join("")), withoutSpaces(lotNumber));
  assert.equal(withoutSpaces(layout.locationLines.join("")), withoutSpaces(storageLocation));
  assert.ok(layout.lotLines.length > 2);
  assert.ok(layout.locationLines.length > 2);
  for (const line of layout.lotLines) {
    assert.ok(font.widthOfTextAtSize(line, 8) <= 78);
  }
  for (const line of layout.locationLines) {
    assert.ok(font.widthOfTextAtSize(line, 8) <= 150);
  }
  assert.equal(
    layout.height,
    Math.max(layout.itemLines.length, layout.lotLines.length, layout.locationLines.length) * 11 + 12,
  );
});

test("packing slip keeps item checkboxes and only the packed-by footer line", () => {
  const source = readFileSync("netlify/functions/_shared/fulfillment-pdf.js", "utf8");
  assert.match(source, /x: 51,[\s\S]*?width: 12,[\s\S]*?height: 12/);
  assert.match(source, /Packed by: ______________________________/);
  assert.doesNotMatch(source, /FINAL CHECKS|Package sealed|Packing slip included|Verified by:/);
});

test("local handoff produces the same branded one-page packing slip", async () => {
  const order = { ...printableOrder(), fulfillment_method: "LOCAL_HANDOFF" };
  assert.equal(assertOrderPrintable(order), "");
  const document = await PDFDocument.load(await buildFulfillmentPdf(order));
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), "Tier One packing slip - T1B-260811-123456");
});

test("pre-counted local handoff without allocations prints honest original-item rows", async () => {
  const order = {
    ...printableOrder(),
    fulfillment_method: "LOCAL_HANDOFF",
    inventory_accounting_mode: "PRECOUNTED_LEGACY",
    allocations: [],
  };
  assert.equal(isAllocationlessLegacyLocalHandoff(order), true);
  assert.equal(assertOrderPrintable(order), "");
  assert.deepEqual(buildPackingRows(order).map(row => ({
    item: row.item,
    lotNumber: row.lotNumber,
    storageLocation: row.storageLocation,
    quantity: row.quantity,
  })), [{
    item: "BPC-157 5 mg",
    lotNumber: "Not recorded (legacy)",
    storageLocation: "-",
    quantity: 2,
  }]);
  const document = await PDFDocument.load(await buildFulfillmentPdf(order));
  assert.equal(document.getPageCount(), 1);
  const source = readFileSync("netlify/functions/_shared/fulfillment-pdf.js", "utf8");
  assert.match(source, /inventory was pre-counted before lot tracking/);

  assert.match(assertOrderPrintable({ ...order, fulfillment_method: "SHIP" }), /no inventory allocation/);
  assert.match(assertOrderPrintable({ ...order, inventory_accounting_mode: "TRACKED" }), /no inventory allocation/);
  assert.match(assertOrderPrintable({ ...order, payment_status: "AWAITING_PAYMENT" }), /Confirm payment/);
  assert.match(assertOrderPrintable({
    ...order,
    allocations: [{
      productId: "bpc157-5",
      quantity: 2,
      state: "RESERVED",
      lot: { lot_number: "LOT-26-A", is_provisional: false },
    }],
  }), /not been committed/);
});

test("PDF generation fails closed for unpaid, uncommitted, or provisional orders", async () => {
  const order = printableOrder();
  assert.equal(assertOrderPrintable({ ...order, payment_status: "AWAITING_PAYMENT" }), "Confirm payment before printing the packing slip.");
  assert.match(assertOrderPrintable({ ...order, allocations: [{ ...order.allocations[0], state: "RESERVED" }] }), /not been committed/);
  assert.match(assertOrderPrintable({ ...order, allocations: [{ ...order.allocations[0], lot: { is_provisional: true } }] }), /real lot number/);
  await assert.rejects(() => buildFulfillmentPdf({ ...order, allocations: [] }), /no inventory allocation/);
});
