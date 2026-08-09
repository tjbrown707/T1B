// Order arithmetic — the single definition of what an order costs.
//
// This logic existed twice in site_1.jsx (`tieredPrice` in the cart popup and
// `getItemPrice` in the checkout) and was about to exist a third time inside
// the Netlify function that prices orders server-side. Three copies of a
// pricing rule is three chances for the price a customer is shown, the price
// the owner is told to collect, and the price recorded in the database to
// disagree with each other.
//
// Keep this file free of React and of any browser API — it is imported by the
// browser bundle, by netlify/functions/create-order.js, and by the tests.

import { PRODUCTS } from "./catalog.js";
import { catalogPrices, isSaleActive, applySale } from "./pricing.js";

export const FREE_SHIPPING_THRESHOLD = 200;
export const FLAT_SHIPPING = 10;

// Codes that waive shipping rather than discounting the order. Shared so the
// server classifies a code the same way the cart did.
export const SHIPPING_DISCOUNT_CODES = ["SHIP4FREE"];
export const isShippingDiscountCode = (code) => SHIPPING_DISCOUNT_CODES.includes(code);

// Tiered bulk pricing:
//   1-4  list price
//   5-9  bulk price
//   10-24 bulk price less 5%
//   25+   bulk price less 10%
// A sitewide sale, if running, applies on top of whichever tier is reached.
export function lineUnitPrice(item) {
  // Resolved from the catalog by id — never from the stored cart item, which
  // lives in localStorage and is editable by the customer.
  const { price, bulk } = catalogPrices(item);
  const qty = Number(item?.qty) || 0;
  let base;
  if (qty >= 25) base = Math.round(bulk * 0.90 * 100) / 100;
  else if (qty >= 10) base = Math.round(bulk * 0.95 * 100) / 100;
  else if (qty >= 5) base = bulk;
  else base = price;
  return isSaleActive() ? applySale(base) : base;
}

export function lineTotal(item) {
  return Math.round(lineUnitPrice(item) * (Number(item?.qty) || 0) * 100) / 100;
}

const round2 = (n) => Math.round(n * 100) / 100;

// `discount` is the validated discount object ({ type: "percent"|"amount", value })
// or null. `freeShipping` is true when a shipping code has been validated.
export function orderTotals(items, { discount = null, freeShipping = false } = {}) {
  const lines = (Array.isArray(items) ? items : []).map(item => ({
    id: item.id,
    qty: Number(item?.qty) || 0,
    unitPrice: lineUnitPrice(item),
    lineTotal: lineTotal(item),
  }));

  const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));

  const discountAmount = discount
    ? round2(discount.type === "percent"
      ? Math.min(subtotal, subtotal * (discount.value / 100))
      : Math.min(subtotal, discount.value))
    : 0;

  const subtotalAfterDiscount = Math.max(0, round2(subtotal - discountAmount));

  const shipping = lines.length === 0
    ? 0
    : freeShipping
      ? 0
      : (subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING);

  return {
    lines,
    subtotal,
    discountAmount,
    subtotalAfterDiscount,
    shipping,
    total: round2(subtotalAfterDiscount + shipping),
  };
}

// Structured line items for the order record, with the catalog's own name and
// dose rather than whatever the cart claimed they were.
export function orderLineItems(items) {
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const product = PRODUCTS.find(p => p.id === item?.id);
    if (!product) return [];
    const qty = Number(item.qty) || 0;
    return [{
      id: product.id,
      name: product.name,
      dose: product.dose,
      qty,
      unitPrice: lineUnitPrice(item),
      lineTotal: lineTotal(item),
      bulk: qty >= 5,
    }];
  });
}
