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

// The seven quantity mismatches the audit found have been corrected in the
// data, so nothing should be withheld. These figures are stand-ins until the
// Freedom Diagnostics reports arrive; when they are entered, this test is what
// catches a report that has been filed against the wrong product or lot.
test("no summary contradicts the quantity its product is sold as", () => {
  const withheld = withheldLabResults();
  assert.deepEqual(
    withheld.map(w => `${w.product}: report says ${w.labeled?.value}${w.labeled?.unit}`),
    [],
    "a lab summary does not match its product's dose"
  );
});

test("every product has a summary to show", () => {
  const uncovered = PRODUCTS
    .filter(p => !getLabResults(p.name, p.dose))
    .map(p => `${p.name} ${p.dose}`);
  assert.deepEqual(uncovered, []);
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

// The gate is derived from the data on every load rather than from a
// hand-maintained list of known-bad products. That is what makes it survive the
// Freedom Diagnostics reports being pasted in: a report filed against the wrong
// vial size withholds itself, with no code change and nothing to remember.
test("a report that disagrees with its product withholds itself", () => {
  const row = LAB_RESULTS["Tesamorelin"].tests
    .find(t => /^labeled\b.*\bcontent$/i.test(t.test));
  const original = row.specification;
  assert.equal(isLabResultWithheld("Tesamorelin", "10 mg"), false, "starts publishable");
  try {
    row.specification = "5.00 mg/vial"; // as if a 5 mg report were filed here
    assert.equal(isLabResultWithheld("Tesamorelin", "10 mg"), true);
    assert.equal(getLabResults("Tesamorelin", "10 mg"), null);
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
