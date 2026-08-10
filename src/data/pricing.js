// Sale configuration and canonical price resolution.
//
// Lifted out of site_1.jsx so that build-time tooling (sitemap generation,
// prerendering, catalog/lab integrity checks) can import the same values the
// app renders. Keep this file free of React and of any browser API — it is
// imported by plain Node scripts during the build.

import { PRODUCTS } from "./catalog.js";

// ─── Sitewide Sale ───────────────────────────────────────────────────────────
// Flip `active` to false to end the sale. Adjust `endDate` for the banner.
//
// `endDate` is enforced, not decorative: once it passes, the sale switches off
// on its own. Previously `active` was the only thing consulted, so a sale left
// switched on kept discounting every order and kept discount codes hidden long
// after the banner said it had ended.
export const SITEWIDE_SALE = {
  active: false,
  percentOff: 30,
  headline: "4TH OF JULY SALE — 30% OFF SITEWIDE",
  endDate: "2026-07-05",
};

// `today` is injectable so tests can check both sides of the expiry boundary
// without touching the system clock.
export function isSaleActive(today = new Date()) {
  if (!SITEWIDE_SALE || !SITEWIDE_SALE.active) return false;
  if (!SITEWIDE_SALE.endDate) return true;
  // The sale runs through the whole of its final day in the shop's own terms.
  const endOfSale = new Date(`${SITEWIDE_SALE.endDate}T23:59:59`);
  if (Number.isNaN(endOfSale.getTime())) return false;
  return today <= endOfSale;
}

export function applySale(price) {
  if (!isSaleActive() || typeof price !== "number") return price;
  return Math.round(price * (100 - SITEWIDE_SALE.percentOff) / 100);
}

// Canonical price lookup. NEVER trust price/bulk stored on a cart item — the
// cart lives in localStorage and can be edited by the customer. Always resolve
// the authoritative figures from the PRODUCTS catalog by product id.
export function catalogPrices(item) {
  const p = PRODUCTS.find(x => x.id === item?.id);
  return { price: p ? p.price : 0, bulk: p ? p.bulk : 0 };
}

export function formatSaleEndDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch { return iso; }
}
