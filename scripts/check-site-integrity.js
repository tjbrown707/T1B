#!/usr/bin/env node

// Build-time guard for the relationships that are easy to break silently.
//
// Everything here imports the real modules rather than parsing source text, so
// the check cannot drift from what the app actually does. The one exception is
// the route-coverage check, which does read site_1.jsx — it has to, because its
// whole job is to catch a <Route> that exists in the app but was never added to
// the route table. That one is deliberately a belt-and-braces check: since
// unmatched URLs now return a real 404, a route missing from the table would be
// a page that 404s in production while working perfectly in development.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PRODUCTS } from "../src/data/catalog.js";
import { withheldLabResults, getLabResults } from "../src/data/lab-integrity.js";
import {
  STATIC_ROUTES,
  allRoutes,
  sitemapRoutes,
  canonicalUrl,
  publishedArticleMeta,
  todayISO,
} from "../src/data/routes.js";
import { ARTICLE_META } from "../src/data/articles.js";

const failures = [];
const fail = (message) => failures.push(message);

const DIST = "dist";
const hasDist = existsSync(join(DIST, "index.html"));

// ── 1. Every route the app can render must be in the route table ────────────
const source = readFileSync("site_1.jsx", "utf8");
const declared = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]);
if (declared.length === 0) {
  fail("Could not find any <Route path=...> in site_1.jsx — the route-coverage check is not working.");
}

// Routes handled outside the route table, with the reason each one is exempt.
const EXEMPT = new Map([
  ["*", "the catch-all, served by 404.html"],
  ["/checkout", "redirected to /cart by public/_redirects"],
  ["/product/:id", "expanded per product"],
  ["/research/:slug", "expanded per published article"],
]);

const tablePaths = new Set(STATIC_ROUTES.map(r => r.path));
for (const path of declared) {
  if (EXEMPT.has(path) || tablePaths.has(path)) continue;
  fail(`Route "${path}" is rendered by the app but missing from src/data/routes.js — it would 404 in production.`);
}

// ── 2. No analytical summary may be shown against a mismatched quantity ─────
const withheld = withheldLabResults();
for (const entry of withheld) {
  if (getLabResults(PRODUCTS.find(p => p.id === entry.id).name, PRODUCTS.find(p => p.id === entry.id).dose)) {
    fail(`Lab summary for ${entry.product} does not match its dose but is still being published.`);
  }
}

// ── 3. The sitemap must contain every indexable route and nothing else ──────
const today = todayISO();
let sitemap = "";
try { sitemap = readFileSync("public/sitemap.xml", "utf8"); }
catch { fail("public/sitemap.xml is missing — run `npm run sitemap`."); }

if (sitemap) {
  const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  for (const route of sitemapRoutes(today)) {
    if (!listed.has(canonicalUrl(route.path))) {
      fail(`Sitemap is stale: ${route.path} is indexable but not listed. Run \`npm run sitemap\`.`);
    }
  }
  for (const route of allRoutes(today)) {
    if (route.noindex && listed.has(canonicalUrl(route.path))) {
      fail(`Sitemap lists ${route.path}, which is marked noindex.`);
    }
  }
  // A queued article must never be advertised to Google before it exists.
  const publishedSlugs = new Set(publishedArticleMeta(today).map(a => a.slug));
  for (const article of ARTICLE_META) {
    if (publishedSlugs.has(article.slug)) continue;
    if (listed.has(canonicalUrl(`/research/${article.slug}`))) {
      fail(`Sitemap lists /research/${article.slug}, which is not published until ${article.date}.`);
    }
  }
  if (listed.has(canonicalUrl("/cart"))) fail("Sitemap must not contain /cart.");
}

// ── 4. Prerender output must exist for every route ──────────────────────────
if (hasDist) {
  for (const route of allRoutes(today)) {
    const file = route.path === "/" ? "index.html" : `${route.path.replace(/^\//, "")}/index.html`;
    if (!existsSync(join(DIST, file))) fail(`Prerendered page missing: dist/${file}`);
  }
  if (!existsSync(join(DIST, "404.html"))) fail("dist/404.html is missing — unknown URLs would not return a 404.");

  // Structured data must describe the page it is on. If a single document
  // carries every product, it describes none of them.
  const home = readFileSync(join(DIST, "index.html"), "utf8");
  const productMentions = PRODUCTS.filter(p => home.includes(`"sku":"${p.id}"`)).length;
  if (productMentions > 1) {
    fail(`The homepage carries Product schema for ${productMentions} products; emit Product only on product pages.`);
  }

  // The prerendered head must not still be the homepage's on a deep route.
  const sample = join(DIST, "product", PRODUCTS[0].id, "index.html");
  if (existsSync(sample)) {
    const html = readFileSync(sample, "utf8");
    if (!html.includes(`<title>${PRODUCTS[0].name} ${PRODUCTS[0].dose}`)) {
      fail(`dist/product/${PRODUCTS[0].id}/index.html does not carry its own <title>.`);
    }
    if (!html.includes(`href="/products"`)) {
      fail(`dist/product/${PRODUCTS[0].id}/index.html has no crawlable link back to the catalog.`);
    }
  }
} else {
  console.log("check-site-integrity: dist/ not built yet — skipping prerender checks.");
}

if (failures.length > 0) {
  console.error("\n  SITE INTEGRITY CHECK FAILED\n  " + "─".repeat(52));
  failures.forEach(message => console.error(`  • ${message}`));
  console.error("");
  process.exit(1);
}

console.log(
  `check-site-integrity: ${declared.length} routes covered, ` +
  `${PRODUCTS.length} products, ${withheld.length} lab summaries withheld, ` +
  `${sitemapRoutes(today).length} URLs in sitemap`
);
