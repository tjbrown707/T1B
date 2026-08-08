import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRODUCTS } from "../src/data/catalog.js";
import { ARTICLE_META } from "../src/data/articles.js";
import {
  STATIC_ROUTES,
  allRoutes,
  sitemapRoutes,
  routeMeta,
  canonicalUrl,
  isPublished,
  publishedArticleMeta,
} from "../src/data/routes.js";
import { productGraph, articleGraph } from "../src/data/structured-data.js";

test("no two routes claim the same path", () => {
  const paths = allRoutes().map(r => r.path);
  assert.equal(new Set(paths).size, paths.length);
});

test("every route has a title (or is the homepage) and a description", () => {
  for (const route of allRoutes()) {
    assert.ok(route.description, `${route.path} has no description`);
    if (route.path !== "/") assert.ok(route.title, `${route.path} has no title`);
  }
});

test("every product has its own URL", () => {
  const paths = new Set(allRoutes().map(r => r.path));
  for (const product of PRODUCTS) {
    assert.ok(paths.has(`/product/${product.id}`), `${product.id} has no route`);
  }
});

test("transactional pages are served but never indexed", () => {
  for (const path of ["/cart", "/login", "/signup", "/account"]) {
    assert.equal(routeMeta(path).noindex, true, `${path} should be noindex`);
  }
});

test("the sitemap contains no noindex page", () => {
  for (const route of sitemapRoutes()) {
    assert.notEqual(route.noindex, true, `${route.path} is noindex but in the sitemap`);
  }
});

test("the sitemap contains every indexable route and every product", () => {
  const listed = new Set(sitemapRoutes().map(r => r.path));
  assert.ok(listed.has("/"));
  for (const product of PRODUCTS) {
    assert.ok(listed.has(`/product/${product.id}`), `${product.id} missing from the sitemap`);
  }
});

// A queued article is in the bundle but must not be advertised to Google, or
// the crawler is invited to index a page that renders as Not Found.
test("articles queued for a future date are excluded everywhere", () => {
  const future = "2020-01-01"; // pretend "today" is before every article
  const published = publishedArticleMeta(future);
  assert.equal(published.length, 0, "nothing should be published relative to 2020");
  const paths = new Set(allRoutes(future).map(r => r.path));
  for (const article of ARTICLE_META) {
    assert.equal(paths.has(`/research/${article.slug}`), false, `${article.slug} leaked`);
  }
});

test("an article with no date is treated as published", () => {
  assert.equal(isPublished({ title: "x" }), true);
});

test("canonical URLs are absolute and have no trailing slash except the root", () => {
  assert.equal(canonicalUrl("/"), "https://www.tierone.bio/");
  assert.equal(canonicalUrl("/products"), "https://www.tierone.bio/products");
  assert.equal(canonicalUrl("/products/"), "https://www.tierone.bio/products");
});

test("every route the app renders is registered in the route table", () => {
  // Mirrors the build-time guard: with real 404s, a route that exists in the
  // app but not here would work in dev and 404 in production.
  const source = readFileSync("site_1.jsx", "utf8");
  const declared = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]);
  const exempt = new Set(["*", "/checkout", "/product/:id", "/research/:slug"]);
  const known = new Set(STATIC_ROUTES.map(r => r.path));
  assert.ok(declared.length > 0, "no routes found — the check is broken");
  for (const path of declared) {
    if (exempt.has(path)) continue;
    assert.ok(known.has(path), `route ${path} is missing from src/data/routes.js`);
  }
});

test("product schema describes one product and claims no stock it cannot back up", () => {
  const graph = productGraph(PRODUCTS[0])["@graph"];
  const products = graph.filter(node => node["@type"] === "Product");
  assert.equal(products.length, 1);
  assert.equal(products[0].offers.availability, undefined, "must not assert InStock");
  assert.equal(products[0].offers.priceValidUntil, undefined, "must not assert a validity date");
  assert.ok(graph.some(node => node["@type"] === "BreadcrumbList"));
});

test("article schema carries a headline, a date and a breadcrumb trail", () => {
  const article = publishedArticleMeta()[0];
  const graph = articleGraph(article)["@graph"];
  const node = graph.find(n => n["@type"] === "Article");
  assert.equal(node.headline, article.title);
  assert.equal(node.datePublished, article.date);
  assert.ok(graph.some(n => n["@type"] === "BreadcrumbList"));
});
