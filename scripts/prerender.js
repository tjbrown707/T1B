#!/usr/bin/env node

// Writes a real HTML file for every route the site serves.
//
// WHY
// ---
// This is a client-rendered SPA: the server returned the same index.html for
// every URL, so anything that does not execute JavaScript — social-card
// scrapers, link previews in chat apps, and any crawler operating without a
// full renderer — saw the homepage's title and description on all 52 URLs, and
// saw no page content or links at all.
//
// Rather than trying to server-render a 6,800-line component tree that reads
// window, localStorage and sessionStorage at module scope (which would crash in
// Node and is a large, risky refactor), each route gets:
//
//   * a correct <head>: title, description, canonical, OpenGraph, Twitter,
//     robots — all from the same route table the React pages read, so the two
//     cannot drift;
//   * route-appropriate JSON-LD baked into the HTML rather than injected after
//     JavaScript runs;
//   * a real, crawlable body: headings, prose and <a href> links, so every
//     product page is reachable without executing a line of script.
//
// React mounts with createRoot(), which clears #root before its first paint, so
// the snapshot below is what non-JS clients keep and what JS clients never see.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRODUCTS } from "../src/data/catalog.js";
import { SITE_DOMAIN, SITE_NAME, DEFAULT_TITLE, TITLE_SUFFIX, CONTACT_EMAIL } from "../src/data/site.js";
import { applySale } from "../src/data/pricing.js";
import { getLabResults } from "../src/data/lab-integrity.js";
import {
  articleRoutes,
  allRoutes,
  canonicalUrl,
} from "../src/data/routes.js";
import {
  ORGANISATION,
  WEBSITE,
  itemListLd,
  productGraph,
  articleGraph,
} from "../src/data/structured-data.js";

const DIST = "dist";
const SHELL = join(DIST, "index.html");

const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// "</script>" inside JSON would end the block early; escaping "<" prevents it.
//
// data-tier1-ld marks this as the route-level graph. When the app takes over
// and the customer navigates, the client removes any element carrying this
// attribute before injecting the graph for the new route — so a single-page
// navigation can never leave the previous page's schema behind in the head.
const jsonLd = (data) =>
  `<script type="application/ld+json" data-tier1-ld>${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

const absolute = (path) =>
  !path ? `${SITE_DOMAIN}/logo-wide.png` : (path.startsWith("http") ? path : `${SITE_DOMAIN}${path}`);

// ─── Shared page furniture ───────────────────────────────────────────────────
// Present on every prerendered page so that no page is an orphan: a crawler
// landing anywhere can reach the catalog, every policy page and the research
// library through real links.

const NAV = [
  ["/products", "Products"],
  ["/lab-results", "Lab results"],
  ["/research", "Research"],
  ["/calculator", "Reconstitution calculator"],
  ["/testing-standards", "Testing standards"],
  ["/about", "About"],
  ["/faq", "FAQ"],
  ["/contact", "Contact"],
];

const FOOTER = [
  ["/shipping", "Shipping"],
  ["/returns", "Returns"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
];

const linkList = (items) =>
  `<ul>${items.map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ul>`;

// All of the app's styling is injected by JavaScript, so without this the
// snapshot would render as black-on-white default HTML — a white flash before
// React paints, and an ugly page for anyone browsing without scripts.
//
// EVERY rule is scoped to #prerender-fallback, the wrapper React destroys on
// mount. An earlier version styled #root directly, which does NOT go away —
// React clears the element's children but the element and its CSS remain — so
// `#root { max-width: 960px }` silently clamped the whole live site to a
// narrow column and broke the full-bleed hero. Only `html` carries a colour,
// because the app styles `body` and would otherwise be fighting this file.
//
// Nothing is removed or hidden from the document: the fallback remains the
// real page for crawlers and non-JS clients. The two pseudo-elements only give
// the first paint the same age-gate treatment React is about to render, so the
// plain fallback text cannot flash before the app mounts. React clears the
// wrapper and both pseudo-elements atomically when it renders the real page.
const FALLBACK_STYLE = `<style>
  html { background: #0a0a0a; }
  @keyframes release-prerender-gate { to { opacity: 0; visibility: hidden; } }
  #prerender-fallback { max-width: 960px; margin: 0 auto; padding: 24px;
    color: #c9c9c9; font: 16px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif; }
  #prerender-fallback::before { content: ""; position: fixed; inset: 0; z-index: 9997;
    background: rgba(0,0,0,.9); backdrop-filter: blur(10px);
    animation: release-prerender-gate .2s linear 4s forwards; }
  #prerender-fallback::after { content: ""; position: fixed; z-index: 9998;
    top: 50%; left: 50%; transform: translate(-50%,-50%); box-sizing: border-box;
    width: calc(100% - 32px); max-width: 460px; height: min(554px, calc(100vh - 32px));
    border: 1px solid rgba(217,54,66,.38); background: #111316 url('/logo_transparent.png') center 30px / 90px auto no-repeat;
    box-shadow: 0 28px 80px rgba(0,0,0,.62);
    animation: release-prerender-gate .2s linear 4s forwards; }
  #prerender-fallback a { color: #e0e0e0; }
  #prerender-fallback img { display: block; max-width: 100%; height: auto; }
  #prerender-fallback h1, #prerender-fallback h2 { color: #fff; line-height: 1.25; }
  #prerender-fallback header { border-bottom: 1px solid #262626; padding-bottom: 12px; }
  #prerender-fallback footer { border-top: 1px solid #262626; margin-top: 32px; padding-top: 12px; }
  #prerender-fallback nav ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 16px; }
  #prerender-fallback nav[aria-label="Breadcrumb"] ol { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  @media (max-width: 480px) {
    #prerender-fallback::after { height: min(672px, calc(100vh - 24px)); width: calc(100% - 24px); }
  }
</style>`;

function chrome(inner) {
  return `<div id="prerender-fallback"><header><a href="/">${esc(SITE_NAME)}</a><nav aria-label="Primary">${linkList(NAV)}</nav></header>
<main>${inner}</main>
<footer><nav aria-label="Footer">${linkList(FOOTER)}</nav>
<p>Research use only. Not for human or veterinary use. Contact <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p></footer></div>`;
}

const breadcrumb = (trail) => `<nav aria-label="Breadcrumb"><ol>${
  trail.map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")
}</ol></nav>`;

// ─── Body snapshots per route ────────────────────────────────────────────────

function productListing() {
  return `<ul>${PRODUCTS.map(p => {
    const price = applySale(p.price);
    return `<li><a href="/product/${esc(p.id)}">${esc(p.name)} ${esc(p.dose)}</a> — $${esc(price)}</li>`;
  }).join("")}</ul>`;
}

function articleListing(routes) {
  return `<ul>${routes.map(r =>
    `<li><a href="${esc(r.path)}">${esc(r.article.title)}</a>${
      r.article.excerpt ? ` — ${esc(r.article.excerpt)}` : ""
    }</li>`).join("")}</ul>`;
}

function productBody(route) {
  const p = route.product;
  const price = applySale(p.price);
  const lab = getLabResults(p.name, p.dose);
  const related = PRODUCTS.filter(other => other.name === p.name && other.id !== p.id);
  return `${breadcrumb([["/", "Home"], ["/products", "Products"], [route.path, `${p.name} ${p.dose}`]])}
<h1>${esc(p.name)} ${esc(p.dose)}</h1>
<figure><img src="${esc(p.image)}" alt="${esc(route.imageAlt)}" width="${esc(route.imageWidth)}" height="${esc(route.imageHeight)}" /></figure>
<p><strong>$${esc(price)}</strong> — ${esc(p.category)} — purity ${esc(p.purity)}</p>
<p>${esc(p.research)}</p>
${p.sequence ? `<p><strong>Sequence:</strong> ${esc(p.sequence)}</p>` : ""}
${p.storage ? `<p><strong>Storage:</strong> ${esc(p.storage)}</p>` : ""}
${lab
    ? `<p><a href="/lab-results?product=${encodeURIComponent(p.name)}&amp;dose=${encodeURIComponent(p.dose)}">Analytical summary for lot ${esc(lab.lotNumber)}</a></p>`
    : `<p>The analytical summary for this compound is being re-verified against its lot. Request the signed report at <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>`}
${related.length ? `<h2>Other sizes</h2>${linkList(related.map(r => [`/product/${r.id}`, `${r.name} ${r.dose}`]))}` : ""}
<h2>Browse the catalog</h2>${productListing()}`;
}

function articleBody(route) {
  const a = route.article;
  const refs = Array.isArray(a.references) ? a.references : [];
  const relatedIds = Array.isArray(a.relatedProductIds) ? a.relatedProductIds : [];
  const related = PRODUCTS.filter(p => relatedIds.includes(p.id));
  return `${breadcrumb([["/", "Home"], ["/research", "Research"], [route.path, a.title]])}
<article>
<h1>${esc(a.title)}</h1>
<p>${esc(a.excerpt || "")}</p>
<p>By ${esc(a.author || SITE_NAME)}${a.date ? ` — <time datetime="${esc(a.date)}">${esc(a.date)}</time>` : ""}</p>
${refs.length ? `<h2>References</h2><ol>${refs.map(r =>
    `<li>${r.url ? `<a href="${esc(r.url)}" rel="nofollow">${esc(r.title)}</a>` : esc(r.title)}${
      r.journal ? ` — ${esc(r.journal)}` : ""}${r.year ? ` (${esc(r.year)})` : ""}</li>`).join("")}</ol>` : ""}
</article>
${related.length ? `<h2>Related compounds</h2>${linkList(related.map(p => [`/product/${p.id}`, `${p.name} ${p.dose}`]))}` : ""}`;
}

function staticBody(route, articles) {
  const head = `<h1>${esc(route.h1 || route.title || SITE_NAME)}</h1><p>${esc(route.description)}</p>`;
  if (route.path === "/") {
    return `${head}<h2>Research compounds</h2>${productListing()}<h2>Research library</h2>${articleListing(articles)}`;
  }
  if (route.path === "/products") return `${head}${productListing()}`;
  if (route.path === "/research") return `${head}${articleListing(articles)}`;
  if (route.path === "/lab-results") {
    const withSummary = PRODUCTS.filter(p => getLabResults(p.name, p.dose));
    return `${head}${linkList(withSummary.map(p => [`/product/${p.id}`, `${p.name} ${p.dose}`]))}`;
  }
  return head;
}

// ─── JSON-LD per route ───────────────────────────────────────────────────────
// One entity describing the page actually being viewed. The previous build
// injected all 27 Product entities into every route, which describes no page
// correctly and is exactly what Google's structured-data policy forbids.

function structuredData(route, articles) {
  if (route.product) return jsonLd(productGraph(route.product));
  if (route.article) return jsonLd(articleGraph(route.article));

  const graph = [];
  if (route.path === "/products") {
    graph.push(itemListLd("Research compounds", PRODUCTS.map(p => ({
      url: canonicalUrl(`/product/${p.id}`),
      name: `${p.name} ${p.dose}`,
    }))));
  } else if (route.path === "/research") {
    graph.push(itemListLd("Research library", articles.map(r => ({
      url: canonicalUrl(r.path),
      name: r.article.title,
    }))));
  } else if (route.path === "/") {
    graph.push(ORGANISATION, WEBSITE);
  }
  if (!graph.length) return "";
  return jsonLd({ "@context": "https://schema.org", "@graph": graph });
}

// ─── Head assembly ───────────────────────────────────────────────────────────

function headFor(route, articles) {
  const fullTitle = route.title ? `${route.title}${TITLE_SUFFIX}` : DEFAULT_TITLE;
  const canonical = canonicalUrl(route.path);
  const image = absolute(route.image);
  const imageAlt = route.imageAlt || (route.image ? fullTitle : `${SITE_NAME} logo`);
  return [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta name="robots" content="${route.noindex ? "noindex, follow" : "index, follow"}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:type" content="${esc(route.type || "website")}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:alt" content="${esc(imageAlt)}" />`,
    route.imageWidth ? `<meta property="og:image:width" content="${esc(route.imageWidth)}" />` : "",
    route.imageHeight ? `<meta property="og:image:height" content="${esc(route.imageHeight)}" />` : "",
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`,
    structuredData(route, articles),
    FALLBACK_STYLE,
  ].filter(Boolean).join("\n    ");
}

// ─── Render ──────────────────────────────────────────────────────────────────

const shell = readFileSync(SHELL, "utf8");

// Strip the shell's own homepage-specific head so nothing is duplicated. Each
// pattern must match, otherwise index.html has changed shape and the head we
// emit would be silently wrong — so a miss is a hard failure, not a warning.
const STRIP = [
  /\s*<title>[\s\S]*?<\/title>/,
  /\s*<meta name="description"[^>]*>/,
  /\s*<meta name="keywords"[^>]*>/,
  /\s*<meta name="robots"[^>]*>/,
  /\s*<link rel="canonical"[^>]*>/,
  /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
];
const OPTIONAL = new Set(['/\\s*<meta name="keywords"[^>]*>/']);

let baseShell = shell;
for (const pattern of STRIP) {
  if (!pattern.test(baseShell) && !OPTIONAL.has(String(pattern))) {
    console.error(`prerender: index.html no longer contains ${pattern} — refusing to emit a wrong <head>.`);
    process.exit(1);
  }
  baseShell = baseShell.replace(pattern, "");
}
// og:*/twitter:* defaults are replaced per route.
baseShell = baseShell.replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, "");

if (!baseShell.includes('<div id="root"></div>')) {
  console.error("prerender: could not find the #root mount point in index.html.");
  process.exit(1);
}

const articles = articleRoutes();
const routes = allRoutes();

function write(route, body, filePath) {
  let html = baseShell.replace("</head>", `  ${headFor(route, articles)}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const target = join(DIST, filePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

for (const route of routes) {
  const body = chrome(
    route.product ? productBody(route)
      : route.article ? articleBody(route)
        : staticBody(route, articles)
  );
  // "<path>.html", not "<path>/index.html". Netlify serves a directory index
  // only after 301-redirecting to add a trailing slash, which would put a
  // redirect hop in front of every product page and land crawlers on a URL
  // that disagrees with the canonical tag and the sitemap. A flat .html file
  // is served at the extensionless URL directly.
  const filePath = route.path === "/" ? "index.html" : `${route.path.replace(/^\//, "")}.html`;
  write(route, body, filePath);
}

// A real 404 document. Netlify serves this with a 404 status for anything that
// does not match a generated file, so unknown URLs stop returning HTTP 200 and
// Google stops treating them as thin duplicate pages.
write(
  {
    path: "/404",
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist.",
    noindex: true,
    h1: "Page not found",
  },
  chrome(`<h1>Page not found</h1><p>That URL does not exist. Try the <a href="/products">catalog</a> or the <a href="/research">research library</a>.</p>`),
  "404.html"
);

console.log(`prerender: wrote ${routes.length} routes + 404.html`);
