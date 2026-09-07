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
  RESEARCH_LIBRARY_ENABLED,
  todayISO,
} from "../src/data/routes.js";
import { ARTICLE_META } from "../src/data/articles.js";
import { securityTxtProblems } from "../src/data/security-txt.js";

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
  const listedImages = new Set([...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(m => m[1]));
  for (const route of sitemapRoutes(today)) {
    if (!listed.has(canonicalUrl(route.path))) {
      fail(`Sitemap is stale: ${route.path} is indexable but not listed. Run \`npm run sitemap\`.`);
    }
    if (route.image) {
      const imageUrl = route.image.startsWith("http") ? route.image : canonicalUrl(route.image);
      if (!listedImages.has(imageUrl)) {
        fail(`Sitemap is missing the image for ${route.path}. Run \`npm run sitemap\`.`);
      }
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
  if (!RESEARCH_LIBRARY_ENABLED) {
    for (const url of listed) {
      if (/\/research(?:\/|$)/.test(new URL(url).pathname)) {
        fail(`Sitemap lists hidden research URL ${url}. Run \`npm run sitemap\`.`);
      }
    }
  }
}

if (/emailjs\.send|@emailjs\/browser/.test(source)) {
  fail("site_1.jsx must not call EmailJS from the browser.");
}
if (!RESEARCH_LIBRARY_ENABLED) {
  const welcomeEmail = readFileSync("email-templates/welcome-discount.html", "utf8");
  if (/href="[^"]*(?:#research|\/research(?:[/?#"]|$))/i.test(welcomeEmail)) {
    fail("The welcome email still links to the hidden research library.");
  }
}

// ── 4. Prerender output must exist for every route ──────────────────────────
if (hasDist) {
  if (!RESEARCH_LIBRARY_ENABLED) {
    if (existsSync(join(DIST, "research.html")) || existsSync(join(DIST, "research"))) {
      fail("Hidden research pages were still prerendered into dist/.");
    }
  }
  for (const route of allRoutes(today)) {
    const file = route.path === "/" ? "index.html" : `${route.path.replace(/^\//, "")}.html`;
    const target = join(DIST, file);
    if (!existsSync(target)) {
      fail(`Prerendered page missing: dist/${file}`);
      continue;
    }
    const html = readFileSync(target, "utf8");
    if (!RESEARCH_LIBRARY_ENABLED && /href=["']\/research(?:[/"'#?]|$)/i.test(html)) {
      fail(`dist/${file} links to the hidden research library.`);
    }
    if (route.staffOnly) {
      if (!route.noindex || !html.includes('<meta name="robots" content="noindex, nofollow" />')) {
        fail(`dist/${file} must not be indexed.`);
      }
      if (!html.includes('<div id="root"></div>') || /prerender-fallback|<h1\b|<nav\b|<meta (?:property="og:|name="twitter:)|application\/ld\+json/.test(html)) {
        fail(`dist/${file} must be an empty staff application shell, not a public page snapshot.`);
      }
      if (!/<script\b[^>]*\bsrc="\/assets\//.test(html)) {
        fail(`dist/${file} is missing the application script.`);
      }
    }
  }
  const notFoundPage = join(DIST, "404.html");
  if (!existsSync(notFoundPage)) {
    fail("dist/404.html is missing — unknown URLs would not return a 404.");
  } else if (!RESEARCH_LIBRARY_ENABLED
      && /href=["']\/research(?:[/"'#?]|$)/i.test(readFileSync(notFoundPage, "utf8"))) {
    fail("dist/404.html links to the hidden research library.");
  }

  const securityTxt = join(DIST, ".well-known", "security.txt");
  if (!existsSync(securityTxt)) {
    fail("dist/.well-known/security.txt is missing.");
  } else {
    const text = readFileSync(securityTxt, "utf8");
    for (const problem of securityTxtProblems(text)) fail(problem);
  }

  // The prerender fallback stylesheet must never target #root. React clears
  // #root's children on mount but leaves the element itself, so a rule on
  // #root stays in force over the live application — which is how a
  // "max-width: 960px" meant for the no-JS fallback ended up clamping the
  // real site and breaking the full-bleed hero. The app's own stylesheet is
  // injected at runtime, so anything matching here came from the prerenderer.
  for (const route of allRoutes(today).slice(0, 5)) {
    const file = route.path === "/" ? "index.html" : `${route.path.replace(/^\//, "")}.html`;
    const target = join(DIST, file);
    if (!existsSync(target)) continue;
    if (/#root\s*\{/.test(readFileSync(target, "utf8"))) {
      fail(`dist/${file} ships a stylesheet rule targeting #root; scope it to the fallback wrapper instead.`);
    }
  }

  // Structured data must describe the page it is on. If a single document
  // carries every product, it describes none of them.
  const home = readFileSync(join(DIST, "index.html"), "utf8");
  const productMentions = PRODUCTS.filter(p => home.includes(`"sku":"${p.id}"`)).length;
  if (productMentions > 1) {
    fail(`The homepage carries Product schema for ${productMentions} products; emit Product only on product pages.`);
  }

  // The prerendered head must not still be the homepage's on a deep route.
  const sample = join(DIST, "product", `${PRODUCTS[0].id}.html`);
  if (existsSync(sample)) {
    const html = readFileSync(sample, "utf8");
    if (!html.includes(`<title>${PRODUCTS[0].name} ${PRODUCTS[0].dose}`)) {
      fail(`dist/product/${PRODUCTS[0].id}.html does not carry its own <title>.`);
    }
    if (!html.includes(`href="/products"`)) {
      fail(`dist/product/${PRODUCTS[0].id}.html has no crawlable link back to the catalog.`);
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
