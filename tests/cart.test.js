import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS } from "../src/data/catalog.js";
import { sanitizeCart, clampQuantity, readStoredCart, MAX_CART_QUANTITY } from "../src/data/cart.js";

const real = PRODUCTS[0];

test("a well-formed cart survives untouched", () => {
  const result = sanitizeCart([{ id: real.id, qty: 2 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, real.id);
  assert.equal(result[0].qty, 2);
});

test("every line is rebuilt from the catalog, so tampered fields cannot survive", () => {
  const result = sanitizeCart([{
    id: real.id,
    qty: 1,
    price: 0.01,
    bulk: 0.01,
    name: "Free Stuff",
    dose: "9999 mg",
  }]);
  assert.equal(result[0].price, real.price, "price comes from the catalog");
  assert.equal(result[0].name, real.name, "name comes from the catalog");
  assert.equal(result[0].dose, real.dose, "dose comes from the catalog");
});

test("unknown product ids are dropped", () => {
  assert.deepEqual(sanitizeCart([{ id: "not-a-product", qty: 1 }]), []);
});

test("quantities that cannot mean a real number of vials are dropped", () => {
  for (const qty of [0, -3, NaN, "abc", null, undefined, {}]) {
    assert.deepEqual(sanitizeCart([{ id: real.id, qty }]), [], `qty ${String(qty)} should be rejected`);
  }
});

test("a fractional quantity is floored rather than discarded", () => {
  // You cannot buy 1.5 vials, but silently emptying someone's cart over a
  // corrupt value is worse than rounding it down. Flooring can only ever
  // reduce the quantity, so it is safe to be forgiving here.
  const result = sanitizeCart([{ id: real.id, qty: 1.5 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].qty, 1);
  // ...but a fraction below one vial is not an order at all.
  assert.deepEqual(sanitizeCart([{ id: real.id, qty: 0.4 }]), []);
});

test("Infinity is capped, not treated as a valid huge order", () => {
  const result = sanitizeCart([{ id: real.id, qty: Infinity }]);
  assert.deepEqual(result, [], "Infinity is not a finite quantity");
});

test("numeric strings are accepted, because JSON round-trips can produce them", () => {
  const result = sanitizeCart([{ id: real.id, qty: "3" }]);
  assert.equal(result[0].qty, 3);
});

test("absurd quantities are capped rather than trusted", () => {
  const result = sanitizeCart([{ id: real.id, qty: 10_000_000 }]);
  assert.equal(result[0].qty, MAX_CART_QUANTITY);
});

test("duplicate lines for one product are merged and still capped", () => {
  const result = sanitizeCart([
    { id: real.id, qty: 60 },
    { id: real.id, qty: 60 },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].qty, MAX_CART_QUANTITY);
});

test("garbage input yields an empty cart instead of throwing", () => {
  for (const input of [null, undefined, "not an array", 42, {}]) {
    assert.deepEqual(sanitizeCart(input), []);
  }
  assert.deepEqual(sanitizeCart([null, undefined, "x", 7]), []);
});

test("clampQuantity floors, bounds and never returns NaN", () => {
  assert.equal(clampQuantity(3.9), 3);
  assert.equal(clampQuantity(-5), 0);
  assert.equal(clampQuantity("7"), 7);
  assert.equal(clampQuantity("nope"), 0);
  assert.equal(clampQuantity(1e9), MAX_CART_QUANTITY);
});

test("corrupt or unavailable storage yields an empty cart", () => {
  assert.deepEqual(readStoredCart({ getItem: () => "{not json" }), []);
  assert.deepEqual(readStoredCart({ getItem: () => { throw new Error("blocked"); } }), []);
  assert.deepEqual(readStoredCart({ getItem: () => null }), []);
});

test("a stored cart is sanitized on the way in", () => {
  const stored = JSON.stringify([
    { id: real.id, qty: 2, price: 0 },
    { id: "ghost", qty: 5 },
  ]);
  const result = readStoredCart({ getItem: () => stored });
  assert.equal(result.length, 1);
  assert.equal(result[0].price, real.price);
});
