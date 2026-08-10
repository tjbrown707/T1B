import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS } from "../src/data/catalog.js";
import { SITEWIDE_SALE, isSaleActive, applySale, catalogPrices } from "../src/data/pricing.js";

// The sale object is module state, so each test restores it rather than
// leaving a flipped sale behind for whatever runs next.
function withSale(overrides, fn) {
  const original = { ...SITEWIDE_SALE };
  Object.assign(SITEWIDE_SALE, overrides);
  try { fn(); } finally { Object.assign(SITEWIDE_SALE, original); }
}

test("an inactive sale leaves prices untouched", () => {
  withSale({ active: false }, () => {
    assert.equal(isSaleActive(), false);
    assert.equal(applySale(100), 100);
  });
});

test("an active sale applies the advertised percentage", () => {
  withSale({ active: true, percentOff: 30, endDate: null }, () => {
    assert.equal(isSaleActive(), true);
    assert.equal(applySale(100), 70);
    assert.equal(applySale(55), 39); // 38.5 rounds to 39
  });
});

// This is the bug the audit found: `active` was the only field consulted, so a
// sale left switched on kept discounting long after its banner said it ended.
test("a sale stops on its own once the end date passes", () => {
  withSale({ active: true, percentOff: 30, endDate: "2026-07-05" }, () => {
    assert.equal(isSaleActive(new Date("2026-07-05T23:59:58")), true, "still live on the final day");
    assert.equal(isSaleActive(new Date("2026-07-06T00:00:01")), false, "over the next day");
  });
});

test("a malformed end date fails closed rather than discounting forever", () => {
  withSale({ active: true, percentOff: 30, endDate: "not-a-date" }, () => {
    assert.equal(isSaleActive(), false);
  });
});

test("prices always resolve from the catalog, never from the cart item", () => {
  const real = PRODUCTS[0];
  // A cart item claiming to cost $1 must still price at the catalog figure.
  const tampered = { id: real.id, price: 1, bulk: 1 };
  assert.deepEqual(catalogPrices(tampered), { price: real.price, bulk: real.bulk });
});

test("an unknown product id prices at zero rather than throwing", () => {
  assert.deepEqual(catalogPrices({ id: "does-not-exist" }), { price: 0, bulk: 0 });
  assert.deepEqual(catalogPrices(null), { price: 0, bulk: 0 });
});
