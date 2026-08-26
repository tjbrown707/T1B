import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";

import {
  assertLocalHandoffLabelPrintable,
  buildLocalHandoffLabelPdf,
  wrapTextLines,
} from "../netlify/functions/_shared/local-handoff-label.js";

function localHandoffOrder() {
  return {
    order_number: "T1B-260823-123456",
    payment_status: "PAID",
    fulfillment_method: "LOCAL_HANDOFF",
    customer_name: "Research Customer",
    customer_email: "research.customer@example.com",
    customer_phone: "(602) 555-0123",
    ship_address: "123 Laboratory Research Boulevard",
    ship_city: "Phoenix",
    ship_state: "AZ",
    ship_zip: "85001",
    created_at: "2026-08-23T18:30:00.000Z",
    items: [
      { id: "bpc157-5", name: "BPC-157", qty: 2 },
      { id: "tb500-10", name: "TB-500", qty: 1 },
    ],
  };
}

test("a paid local handoff order produces one true 4x6 identification label", async () => {
  const bytes = await buildLocalHandoffLabelPdf(localHandoffOrder());
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.length > 2_000);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), "Tier One local handoff label - T1B-260823-123456");
  assert.equal(document.getAuthor(), "Tier One BioSystems");
  assert.deepEqual(document.getPage(0).getSize(), { width: 288, height: 432 });
  const resources = document.getPage(0).node.Resources();
  const images = resources.lookup(PDFName.of("XObject"), PDFDict);
  assert.ok(images.keys().length > 0, "the Tier One logo should be embedded");
});

test("pickup labels fail closed for unpaid or shipped orders", async () => {
  const order = localHandoffOrder();
  assert.equal(assertLocalHandoffLabelPrintable(order), "");
  assert.match(assertLocalHandoffLabelPrintable({ ...order, payment_status: "AWAITING_PAYMENT" }), /Confirm payment/);
  assert.match(assertLocalHandoffLabelPrintable({ ...order, fulfillment_method: "SHIP" }), /only for local handoff/);
  assert.match(assertLocalHandoffLabelPrintable({ ...order, customer_name: "" }), /customer's name/);
  await assert.rejects(() => buildLocalHandoffLabelPdf({ ...order, fulfillment_method: "SHIP" }), /only for local handoff/);
});

test("long customer information wraps within the printable label width", async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const value = `Alexandria ${"Research-Customer-".repeat(14)}`;
  const lines = wrapTextLines(font, value, 248, 11);
  assert.ok(lines.length > 2);
  assert.equal(lines.join("").replace(/\s/g, ""), value.replace(/\s/g, ""));
  for (const line of lines) assert.ok(font.widthOfTextAtSize(line, 11) <= 248);
});

test("the pickup-label routes stay authenticated and separate from Shippo postage", () => {
  const endpoint = readFileSync("netlify/functions/admin-local-handoff-label.js", "utf8");
  const printEndpoint = readFileSync("netlify/functions/admin-print.js", "utf8");
  const site = readFileSync("site_1.jsx", "utf8");
  assert.match(endpoint, /authenticateOrderManager/);
  assert.match(endpoint, /Cache-Control": "private, no-store/);
  assert.doesNotMatch(endpoint, /Shippo|order_shipments/);
  assert.match(printEndpoint, /document === "local_handoff_label"/);
  const localPrint = printEndpoint.slice(
    printEndpoint.indexOf("async function printLocalHandoffLabel"),
    printEndpoint.indexOf("async function printLabel"),
  );
  assert.match(localPrint, /labelPrinterId/);
  assert.match(localPrint, /pdf_base64/);
  assert.doesNotMatch(localPrint, /recordOrderPrintSubmission/);
  assert.match(site, /Open 4×6 Label/);
  assert.match(site, /Print 4×6 Label/);
  assert.match(site, /only for identifying pickup orders/);
});
