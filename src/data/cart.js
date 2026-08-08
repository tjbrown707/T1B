// Cart normalisation.
//
// Keep this file free of React and of any browser API — it is imported by
// plain Node scripts and by the tests.
//
// The cart is persisted to localStorage, which means every field in it is
// customer-editable. The existing rule in this codebase is "never trust the
// price on a cart item" — but price is not the only field that gets rendered.
// `name` and `dose` go into the order email and the Netlify Forms notification
// the owner fulfils from, so a tampered cart could describe one product and
// charge for another.
//
// So rather than sanitising fields one at a time, every line is rebuilt from
// the catalog by id. Only the id and the quantity survive the trip through
// storage; everything else is re-read from PRODUCTS.

import { PRODUCTS } from "./catalog.js";

// A per-line ceiling. High enough never to block a genuine bulk order, low
// enough that a tampered quantity can't produce an absurd total.
export const MAX_CART_QUANTITY = 99;

export function clampQuantity(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.floor(n), MAX_CART_QUANTITY));
}

export function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const product = PRODUCTS.find(p => p.id === entry.id);
    if (!product) continue; // unknown, renamed or discontinued product id
    const qty = clampQuantity(entry.qty);
    if (qty < 1) continue;  // zero, negative, fractional, NaN, "3"→3 is fine
    const running = byId.get(product.id);
    byId.set(product.id, {
      ...product,
      qty: clampQuantity((running ? running.qty : 0) + qty),
    });
  }
  return [...byId.values()];
}

export function readStoredCart(storage) {
  try {
    const saved = storage.getItem("t1b-cart");
    return saved ? sanitizeCart(JSON.parse(saved)) : [];
  } catch {
    // Corrupt JSON, or storage blocked entirely (private mode, cookie policy).
    return [];
  }
}
