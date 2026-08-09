import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS } from "../src/data/catalog.js";
import { ARTICLE_META } from "../src/data/articles.js";

test("product ids are unique", () => {
  const ids = PRODUCTS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every product has the fields the storefront and schema depend on", () => {
  for (const product of PRODUCTS) {
    for (const field of ["id", "name", "dose", "image", "category", "research", "purity"]) {
      assert.ok(product[field], `${product.id} is missing ${field}`);
    }
    assert.equal(typeof product.price, "number", `${product.id} price must be a number`);
    assert.equal(typeof product.bulk, "number", `${product.id} bulk must be a number`);
    assert.ok(product.price > 0, `${product.id} price must be positive`);
    assert.ok(product.bulk <= product.price, `${product.id} bulk price is not a discount`);
  }
});

test("product images are site-relative paths", () => {
  for (const product of PRODUCTS) {
    assert.match(product.image, /^\/[\w.-]+\.(jpg|png|webp|avif)$/, `${product.id} image looks wrong`);
  }
});

// The audit flagged outcome-oriented category names ("Weight Management") as
// part of the human-use impression the site gives. Categories are now stated in
// mechanism terms, and this keeps them that way.
test("categories are not stated as consumer outcomes", () => {
  const banned = [/weight/i, /longevity/i, /recovery/i, /tanning/i, /anti-?ag/i, /fat loss/i];
  for (const product of PRODUCTS) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(product.category), `${product.id} category "${product.category}" matches ${pattern}`);
    }
  }
});

test("storage guidance reads as a laboratory protocol, not domestic advice", () => {
  const domestic = [/home freezer/i, /refrigerator\)/i, /°F/, /\bkitchen\b/i];
  for (const product of PRODUCTS) {
    if (!product.storage) continue;
    for (const pattern of domestic) {
      assert.ok(!pattern.test(product.storage), `${product.id} storage matches ${pattern}: "${product.storage}"`);
    }
  }
});

// The storage strings were rewritten one profile at a time rather than
// collapsed into a single sentence, because the compounds genuinely differ —
// HCG is refrigerated rather than frozen, and stability windows run from
// "immediately" to 6 weeks. Flattening them would have stated some incorrectly.
test("storage guidance keeps its per-compound differences", () => {
  const distinct = new Set(PRODUCTS.map(p => p.storage).filter(Boolean));
  assert.ok(distinct.size >= 5, `expected several storage profiles, found ${distinct.size}`);
  const hcg = PRODUCTS.find(p => p.id === "hcg");
  assert.match(hcg.storage, /2–8°C/, "HCG is refrigerated, not frozen");
  assert.ok(!/-18°C or below in a controlled laboratory freezer/.test(hcg.storage),
    "HCG must not have been flattened into the frozen-storage wording");
});

// Product prose should name the variable that was measured, not the outcome a
// buyer might want for themselves.
test("product prose makes no consumer-outcome claim", () => {
  const banned = [/body composition/i, /weight management/i, /fat loss/i, /slim/i, /anti-?ag(e|ing)/i];
  for (const product of PRODUCTS) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(product.research || ""), `${product.id} research prose matches ${pattern}`);
    }
  }
});

test("article slugs are unique and URL-safe", () => {
  const slugs = ARTICLE_META.map(a => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${slug} is not URL-safe`);
  }
});

test("every article carries the metadata its page and schema need", () => {
  for (const article of ARTICLE_META) {
    for (const field of ["slug", "title", "excerpt", "date", "heroImage", "metaDescription"]) {
      assert.ok(article[field], `${article.slug} is missing ${field}`);
    }
    assert.match(article.date, /^\d{4}-\d{2}-\d{2}$/, `${article.slug} has a non-ISO date`);
  }
});

test("article references point somewhere resolvable", () => {
  for (const article of ARTICLE_META) {
    for (const reference of article.references || []) {
      assert.ok(reference.title, `${article.slug} has a reference with no title`);
      if (reference.url) {
        assert.match(reference.url, /^https:\/\//, `${article.slug} reference "${reference.title}" is not https`);
      }
    }
  }
});

test("related product ids on articles all exist", () => {
  const ids = new Set(PRODUCTS.map(p => p.id));
  for (const article of ARTICLE_META) {
    for (const id of article.relatedProductIds || []) {
      assert.ok(ids.has(id), `${article.slug} points at unknown product "${id}"`);
    }
  }
});
