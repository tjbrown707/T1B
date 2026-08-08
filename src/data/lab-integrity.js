// Reconciliation between what a vial is sold as and what its analytical
// summary says was in the vial.
//
// Lifted out of site_1.jsx so that build-time tooling (sitemap generation,
// prerendering, catalog/lab integrity checks) can import the same values the
// app renders. Keep this file free of React and of any browser API — it is
// imported by plain Node scripts during the build.
//
// WHY THIS EXISTS
// ---------------
// Seven published summaries described a different vial size than the product
// they were attached to — a 10 mg product showing a 5 mg report, and so on.
// That is the single most damaging thing a testing-led storefront can get
// wrong, so the guard here is deliberately not a hand-written list of the
// seven. A list is a snapshot: it goes stale the moment a lot is re-tested, a
// dose is added, or a report is corrected, and it goes stale silently.
//
// Instead the quantities are compared on every load. A summary is publishable
// only if its labeled content equals the dose being sold. Correct the data and
// it publishes itself; break the data and it withholds itself.

import { PRODUCTS } from "./catalog.js";
import { LAB_RESULTS } from "./lab-results.js";

// Accepts the forms that appear in the catalog and in the reports:
//   "10 mg"  "5/5 mg"  "5000 IU"  "10.00 mg/vial"  "5,000 IU/vial"
// A blend written "5/5 mg" is two components in one vial, so the vial holds
// their sum — that is what a labeled-content figure measures.
export function parseVialQuantity(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/,/g, "").replace(/\/vial\b/i, "").trim();
  const match = cleaned.match(/^([\d.]+(?:\s*\/\s*[\d.]+)*)\s*(mg|mcg|iu)$/i);
  if (!match) return null;
  const parts = match[1].split("/").map(part => Number(part.trim()));
  if (parts.some(part => !Number.isFinite(part))) return null;
  return {
    value: parts.reduce((sum, part) => sum + part, 0),
    unit: match[2].toLowerCase(),
  };
}

export function labeledQuantityOf(labResult) {
  const row = labResult?.tests?.find(t => /^labeled\b.*\bcontent$/i.test(t.test || ""));
  return row ? parseVialQuantity(row.specification) : null;
}

// Fails closed: anything we cannot line up in comparable units is treated as
// unverified and withheld rather than published on the strength of a guess.
export function labResultMatchesDose(labResult, dose) {
  const labeled = labeledQuantityOf(labResult);
  const sold = parseVialQuantity(dose);
  if (!labeled || !sold) return false;
  if (labeled.unit !== sold.unit) return false;
  return Math.abs(labeled.value - sold.value) < 0.005;
}

function lookupRaw(productName, dose) {
  const doseKey = dose ? `${productName} ${dose}` : productName;
  if (LAB_RESULTS[doseKey]) return { key: doseKey, result: LAB_RESULTS[doseKey] };
  if (LAB_RESULTS[productName]) return { key: productName, result: LAB_RESULTS[productName] };
  return null;
}

// The only accessor the UI should use. Returns null both when no summary
// exists and when the summary does not describe the vial being sold.
export function getLabResults(productName, dose) {
  const found = lookupRaw(productName, dose);
  if (!found) return null;
  return labResultMatchesDose(found.result, dose) ? found.result : null;
}

// True when a summary exists but is being withheld, so the page can say so
// honestly instead of just showing nothing.
export function isLabResultWithheld(productName, dose) {
  const found = lookupRaw(productName, dose);
  return !!found && !labResultMatchesDose(found.result, dose);
}

// Used by the build check and by the tests.
export function withheldLabResults() {
  return PRODUCTS
    .filter(p => isLabResultWithheld(p.name, p.dose))
    .map(p => {
      const found = lookupRaw(p.name, p.dose);
      return {
        id: p.id,
        product: `${p.name} ${p.dose}`,
        labKey: found ? found.key : null,
        sold: parseVialQuantity(p.dose),
        labeled: found ? labeledQuantityOf(found.result) : null,
      };
    });
}
