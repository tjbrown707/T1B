import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS } from "../src/data/catalog.js";
import { LAB_RESULTS } from "../src/data/lab-results.js";
import {
  parseVialQuantity,
  labeledQuantityOf,
  labResultMatchesDose,
  getLabResults,
  isLabResultWithheld,
  withheldLabResults,
} from "../src/data/lab-integrity.js";

test("vial quantities parse in every form the catalog and reports use", () => {
  assert.deepEqual(parseVialQuantity("10 mg"), { value: 10, unit: "mg" });
  assert.deepEqual(parseVialQuantity("10.00 mg/vial"), { value: 10, unit: "mg" });
  assert.deepEqual(parseVialQuantity("5000 IU"), { value: 5000, unit: "iu" });
  assert.deepEqual(parseVialQuantity("5,000 IU/vial"), { value: 5000, unit: "iu" });
});

test("a blend's vial holds the sum of its components", () => {
  // "5/5 mg" is 5 mg of each of two peptides in one vial — a labeled-content
  // figure measures the 10 mg total, not either half.
  assert.deepEqual(parseVialQuantity("5/5 mg"), { value: 10, unit: "mg" });
});

test("unparseable quantities return null rather than a guess", () => {
  for (const input of ["", "a lot", null, undefined, 10, "10 grams", {}]) {
    assert.equal(parseVialQuantity(input), null, `${String(input)} should not parse`);
  }
});

test("mismatched units never count as a match", () => {
  const iuResult = { tests: [{ test: "Labeled Content", specification: "5000 IU/vial" }] };
  assert.equal(labResultMatchesDose(iuResult, "5000 mg"), false);
});

test("a summary with no labeled-content row is withheld, not published", () => {
  const noLabel = { tests: [{ test: "Purity (HPLC)", specification: "≥ 99.0%" }] };
  assert.equal(labeledQuantityOf(noLabel), null);
  assert.equal(labResultMatchesDose(noLabel, "10 mg"), false);
});

// The seven the audit found. Pinned by name so that "fixing" one by deleting
// the check is a visible test change rather than a silent regression.
const KNOWN_MISMATCHES = [
  "Tesamorelin 10 mg",
  "CJC-1295 / Ipamorelin 5/5 mg",
  "Epitalon 10 mg",
  "SS-31 10 mg",
  "Kisspeptin 10 mg",
  "Selank 10 mg",
  "Thymosin Alpha 1 10 mg",
];

test("every summary whose quantity contradicts its product is withheld", () => {
  const withheld = withheldLabResults().map(w => w.product).sort();
  assert.deepEqual(withheld, [...KNOWN_MISMATCHES].sort());
});

test("withheld products expose no lab result to the UI", () => {
  for (const product of PRODUCTS) {
    if (!isLabResultWithheld(product.name, product.dose)) continue;
    assert.equal(
      getLabResults(product.name, product.dose), null,
      `${product.name} ${product.dose} is withheld but getLabResults returned a summary`
    );
  }
});

test("every published summary states the quantity the product is sold as", () => {
  for (const product of PRODUCTS) {
    const result = getLabResults(product.name, product.dose);
    if (!result) continue;
    const labeled = labeledQuantityOf(result);
    const sold = parseVialQuantity(product.dose);
    assert.ok(labeled, `${product.name} has a published summary with no labeled content`);
    assert.equal(labeled.unit, sold.unit);
    assert.ok(
      Math.abs(labeled.value - sold.value) < 0.005,
      `${product.name} ${product.dose} publishes a ${labeled.value}${labeled.unit} summary`
    );
  }
});

test("the gate is derived, so correcting the data republishes without a code change", () => {
  const key = "Tesamorelin";
  const entry = LAB_RESULTS[key];
  const row = entry.tests.find(t => /^labeled\b.*\bcontent$/i.test(t.test));
  const original = row.specification;
  assert.equal(isLabResultWithheld("Tesamorelin", "10 mg"), true);
  try {
    row.specification = "10.00 mg/vial"; // as if the report had been re-checked
    assert.equal(isLabResultWithheld("Tesamorelin", "10 mg"), false);
    assert.ok(getLabResults("Tesamorelin", "10 mg"));
  } finally {
    row.specification = original;
  }
});

test("products carrying no summary at all are not reported as withheld", () => {
  // "Withheld" must mean "we hold one and it does not reconcile", otherwise the
  // page would claim to be re-verifying a document that does not exist.
  for (const product of PRODUCTS) {
    const hasEntry = !!(LAB_RESULTS[`${product.name} ${product.dose}`] || LAB_RESULTS[product.name]);
    if (!hasEntry) {
      assert.equal(isLabResultWithheld(product.name, product.dose), false);
    }
  }
});
