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

test("storage guidance does not describe a domestic kitchen", () => {
  for (const product of PRODUCTS) {
    if (!product.storage) continue;
    assert.ok(!/home freezer/i.test(product.storage), `${product.id} storage still says "home freezer"`);
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
