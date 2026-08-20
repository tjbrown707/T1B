import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
    assert.doesNotMatch(product.image, /-v\d+\./, `${product.id} image has a temporary versioned filename`);
    assert.ok(existsSync(join("public", product.image.slice(1))), `${product.id} image file is missing`);
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

test("article hero images exist", () => {
  for (const article of ARTICLE_META) {
    assert.match(article.heroImage, /^\/[\w.-]+\.(jpg|png|webp|avif)$/, `${article.slug} hero image looks wrong`);
    assert.ok(existsSync(join("public", article.heroImage.slice(1))), `${article.slug} hero image file is missing`);
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

// Library cards, prerendered HTML, and search snippets all read title / excerpt
// / meta from ARTICLE_META. Keep those in pathway and model-system language.
test("article listing copy is not framed as consumer wellness", () => {
  const banned = [
    /\bweight management\b/i,
    /\bsupplementation\b/i,
    /\brecovery\b/i,
    /\btissue repair\b/i,
    /\bnootropic\b/i,
    /\bstack\b/i,
    /\bexercise mimetic\b/i,
    /\bmetabolic health\b/i,
  ];
  for (const article of ARTICLE_META) {
    const listing = [
      article.title,
      article.excerpt,
      article.metaTitle,
      article.metaDescription,
      ...(article.tags || []),
    ].join(" ");
    for (const pattern of banned) {
      assert.ok(!pattern.test(listing), `${article.slug} listing copy matches ${pattern}: "${listing}"`);
    }
  }
});

test("required research-library titles use pathway language", () => {
  const bySlug = Object.fromEntries(ARTICLE_META.map(a => [a.slug, a]));
  const expected = {
    "nad-plus-supplementation-research": "NAD+ in Cellular Models: Mechanisms and Current Research",
    "selank-semax-russian-nootropic-peptides": "Selank and Semax: BDNF and Cytokine Modulation Research",
    "mots-c-mitochondrial-peptide-research": "MOTS-c: Mitochondrial Peptide and AMPK Signaling Research",
    "tissue-repair-peptide-blends-research": "Combined Peptide Studies: BPC-157, GHK-Cu, and TB-500",
    "bpc-157-vs-tb-500-tissue-repair": "BPC-157 vs TB-500: Angiogenesis and Actin-Regulation Research",
    "cjc-1295-ipamorelin-growth-hormone-stack": "CJC-1295 and Ipamorelin: Dual-Receptor GHRH and Ghrelin-Mimetic Research",
    "retatrutide-vs-tirzepatide-vs-semaglutide": "Retatrutide vs Tirzepatide vs Semaglutide: A Research Comparison",
    "tesamorelin-growth-hormone-research": "GHRH Analog Research: Tesamorelin Mechanism and Findings",
  };
  for (const [slug, title] of Object.entries(expected)) {
    assert.equal(bySlug[slug]?.title, title, `${slug} title drifted`);
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
