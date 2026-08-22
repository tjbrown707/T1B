import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS } from "../src/data/catalog.js";
import { SITEWIDE_SALE } from "../src/data/pricing.js";
import {
  lineUnitPrice,
  orderTotals,
  orderLineItems,
  isShippingDiscountCode,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING,
} from "../src/data/order-totals.js";

const product = PRODUCTS[0];
const at = (qty) => lineUnitPrice({ id: product.id, qty });

function withSale(overrides, fn) {
  const original = { ...SITEWIDE_SALE };
  Object.assign(SITEWIDE_SALE, overrides);
  try { fn(); } finally { Object.assign(SITEWIDE_SALE, original); }
}

// 1-4 list · 5-9 bulk · 10-24 bulk-5% · 25+ bulk-10%
test("bulk tiers change at exactly the documented quantities", () => {
  assert.equal(at(1), product.price);
  assert.equal(at(4), product.price, "4 is still list price");
  assert.equal(at(5), product.bulk, "5 is the first bulk quantity");
  assert.equal(at(9), product.bulk);
  assert.equal(at(10), Math.round(product.bulk * 0.95 * 100) / 100, "10 unlocks bulk -5%");
  assert.equal(at(24), Math.round(product.bulk * 0.95 * 100) / 100);
  assert.equal(at(25), Math.round(product.bulk * 0.90 * 100) / 100, "25 unlocks bulk -10%");
});

test("the CJC-1295 / Ipamorelin blend matches Tesamorelin's pricing structure", () => {
  const cjcIpamorelin = PRODUCTS.find(({ id }) => id === "cjc-ipa");
  const tesamorelin = PRODUCTS.find(({ id }) => id === "tesamorelin");

  for (const qty of [1, 5, 10, 25]) {
    assert.equal(
      lineUnitPrice({ id: cjcIpamorelin.id, qty }),
      lineUnitPrice({ id: tesamorelin.id, qty }),
      `unit prices should match at ${qty} vial${qty === 1 ? "" : "s"}`
    );
  }
});

test("unit price never rises as quantity rises", () => {
  let previous = Infinity;
  for (let qty = 1; qty <= 30; qty++) {
    const price = at(qty);
    assert.ok(price <= previous, `unit price rose at qty ${qty}`);
    previous = price;
  }
});

test("a sale applies on top of whichever bulk tier was reached", () => {
  withSale({ active: true, percentOff: 30, endDate: null }, () => {
    assert.equal(at(1), Math.round(product.price * 0.7));
    assert.equal(at(5), Math.round(product.bulk * 0.7));
  });
});

test("prices come from the catalog, so a tampered cart line cannot lower them", () => {
  const tampered = { id: product.id, qty: 1, price: 0.01, bulk: 0.01 };
  assert.equal(lineUnitPrice(tampered), product.price);
  const { subtotal, total } = orderTotals([tampered]);
  assert.equal(subtotal, product.price);
  assert.equal(total, product.price + FLAT_SHIPPING);
});

test("an unknown product contributes nothing rather than throwing", () => {
  const { subtotal, lines } = orderTotals([{ id: "ghost", qty: 3 }]);
  assert.equal(subtotal, 0);
  assert.equal(lines.length, 1);
  assert.equal(orderLineItems([{ id: "ghost", qty: 3 }]).length, 0, "no line item for an unknown id");
});

test("shipping is flat until the free-shipping threshold, then free", () => {
  const cheap = orderTotals([{ id: product.id, qty: 1 }]);
  assert.equal(cheap.shipping, FLAT_SHIPPING);

  // Enough quantity to clear the threshold.
  let qty = 1;
  while (orderTotals([{ id: product.id, qty }]).subtotalAfterDiscount < FREE_SHIPPING_THRESHOLD) qty++;
  const big = orderTotals([{ id: product.id, qty }]);
  assert.ok(big.subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD);
  assert.equal(big.shipping, 0);
});

test("an empty order costs nothing and ships nothing", () => {
  const empty = orderTotals([]);
  assert.deepEqual(
    { subtotal: empty.subtotal, shipping: empty.shipping, total: empty.total },
    { subtotal: 0, shipping: 0, total: 0 }
  );
});

test("a percentage discount comes off the subtotal", () => {
  const { subtotal, discountAmount, total, shipping } =
    orderTotals([{ id: product.id, qty: 2 }], { discount: { type: "percent", value: 10 } });
  assert.equal(discountAmount, Math.round(subtotal * 0.1 * 100) / 100);
  assert.equal(total, Math.round((subtotal - discountAmount + shipping) * 100) / 100);
});

test("a discount can never exceed the subtotal or make a total negative", () => {
  for (const discount of [{ type: "fixed", value: 100000 }, { type: "percent", value: 500 }]) {
    const t = orderTotals([{ id: product.id, qty: 1 }], { discount });
    assert.equal(t.discountAmount, t.subtotal, "discount is capped at the subtotal");
    assert.equal(t.subtotalAfterDiscount, 0);
    assert.ok(t.total >= 0);
  }
});

// The database enforces these three; the arithmetic has to satisfy them or the
// insert is rejected and the order is lost.
test("totals satisfy the database CHECK constraints", () => {
  const cases = [
    [[{ id: product.id, qty: 1 }], {}],
    [[{ id: product.id, qty: 30 }], {}],
    [[{ id: product.id, qty: 2 }], { discount: { type: "percent", value: 25 } }],
    [[{ id: product.id, qty: 2 }], { discount: { type: "fixed", value: 5 }, freeShipping: true }],
    [[], {}],
  ];
  for (const [items, opts] of cases) {
    const t = orderTotals(items, opts);
    assert.ok(t.subtotal >= 0 && t.discountAmount >= 0 && t.shipping >= 0 && t.total >= 0,
      "orders_amounts_nonneg");
    assert.ok(t.discountAmount <= t.subtotal, "orders_discount_sane");
    assert.ok(Math.abs(t.total - (t.subtotal - t.discountAmount + t.shipping)) < 0.01,
      "orders_total_matches");
  }
});

test("line items are rebuilt from the catalog, not from the request", () => {
  const [line] = orderLineItems([{ id: product.id, qty: 6, name: "Free Stuff", dose: "9999 mg" }]);
  assert.equal(line.name, product.name);
  assert.equal(line.dose, product.dose);
  assert.equal(line.bulk, true, "6 units is a bulk line");
  assert.equal(line.lineTotal, Math.round(product.bulk * 6 * 100) / 100);
});

test("shipping codes are recognised the same way everywhere", () => {
  assert.equal(isShippingDiscountCode("SHIP4FREE"), true);
  assert.equal(isShippingDiscountCode("WELCOME10"), false);
});

test("a free-shipping code waives postage without discounting the order", () => {
  const t = orderTotals([{ id: product.id, qty: 1 }], { freeShipping: true });
  assert.equal(t.shipping, 0);
  assert.equal(t.discountAmount, 0);
  assert.equal(t.total, t.subtotal);
});
