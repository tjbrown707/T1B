// The route table: every URL the site serves, and the metadata that describes
// it.
//
// This is the single source of truth for titles, descriptions and indexability.
// The React pages read it through useRouteMeta(), and the build reads it to
// generate the sitemap and to prerender each route's HTML. Keeping one table
// is what stops the prerendered <title> and the client-rendered <title> from
// drifting apart — which is the failure mode that makes prerendering worse
// than useless, because search engines then see one page and users see another.
//
// Keep this file free of React and of any browser API — it is imported by
// plain Node scripts during the build.

import { PRODUCTS } from "./catalog.js";
import { ARTICLE_META } from "./articles.js";
import { SITE_DOMAIN } from "./site.js";

// ─── Article publication gating ──────────────────────────────────────────────
// Dates are ISO (YYYY-MM-DD), so a string comparison is a date comparison.
// An article with no date at all is treated as published rather than hidden
// forever, so a missing field can never silently bury a finished article.
export function todayISO(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isPublished(article, today = todayISO()) {
  return !article?.date || article.date <= today;
}

export function publishedArticleMeta(today = todayISO()) {
  return ARTICLE_META.filter(a => isPublished(a, today));
}

// ─── Per-item metadata ───────────────────────────────────────────────────────
// Used by the product/article pages AND by the prerenderer, so the two cannot
// disagree about what a page is called.

export function productMeta(product) {
  return {
    title: `${product.name} ${product.dose}`,
    description: `${product.name} ${product.dose} — ${(product.research || "").slice(0, 150)}`,
    image: product.image,
    type: "website",
  };
}

export function articleMeta(article) {
  return {
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt || "",
    image: article.heroImage,
    type: "article",
  };
}

// ─── Static routes ───────────────────────────────────────────────────────────
// `title: null` means "use the site default title" (the homepage).
// `noindex` keeps transactional and account pages out of the index: they are
// useless as search results and they dilute the pages that matter.
export const STATIC_ROUTES = [
  {
    path: "/",
    title: null,
    description: "Premium research grade peptides with 99%+ purity. Third-party tested. BPC-157, GLP-3RT, Tesamorelin, and more. US-based supplier.",
    h1: "Research-grade peptides, tested lot by lot",
    priority: "1.0", changefreq: "weekly",
  },
  {
    path: "/products",
    title: "All Products",
    description: "Browse our full catalog of research grade peptides. 99%+ purity, third-party tested.",
    h1: "All research compounds",
    priority: "0.9", changefreq: "weekly",
  },
  {
    path: "/lab-results",
    title: "Lab Results — Certificates of Analysis",
    description: "Analytical summaries for the research compounds in the Tier One BioSystems catalog, published per production lot.",
    h1: "Certificates of analysis",
    priority: "0.9", changefreq: "monthly",
  },
  {
    path: "/research",
    title: "Research",
    description: "Peer-reviewed research summaries, peptide mechanism explainers, and educational articles from Tier One BioSystems — evidence-based content for qualified researchers.",
    h1: "Research library",
    priority: "0.9", changefreq: "weekly",
  },
  {
    path: "/calculator",
    title: "Peptide Reconstitution Calculator",
    description: "Laboratory reconstitution calculator for research peptides. Work out diluent volume, resulting concentration, and the volume needed to draw a given mass.",
    h1: "Reconstitution calculator",
    priority: "0.8", changefreq: "monthly",
  },
  {
    path: "/testing-standards",
    title: "Testing Standards",
    description: "How Tier One BioSystems verifies research peptide purity, identity, and safety. HPLC, ESI-MS, AAA, peptide content, and endotoxin testing explained.",
    h1: "Testing standards",
    priority: "0.8", changefreq: "monthly",
  },
  {
    path: "/about",
    title: "About",
    description: "Tier One BioSystems — research-grade peptides with lot-level transparency, 99%+ purity, and US-based fulfillment.",
    h1: "About Tier One BioSystems",
    priority: "0.7", changefreq: "monthly",
  },
  {
    path: "/faq",
    title: "FAQ",
    description: "Frequently asked questions about Tier One BioSystems research peptide products, ordering, shipping, and quality.",
    h1: "Frequently asked questions",
    priority: "0.7", changefreq: "monthly",
  },
  {
    path: "/contact",
    title: "Contact Us",
    description: "Get in touch with Tier One BioSystems. Questions about research peptides, orders, or wholesale inquiries.",
    h1: "Contact us",
    priority: "0.7", changefreq: "monthly",
  },
  {
    path: "/shipping",
    title: "Shipping Policy",
    description: "How Tier One BioSystems ships research peptides — domestic shipping rates, processing time, free shipping over $200.",
    h1: "Shipping policy",
    priority: "0.5", changefreq: "yearly",
  },
  {
    path: "/returns",
    title: "Returns Policy",
    description: "Tier One BioSystems returns and refunds policy for research peptides.",
    h1: "Returns policy",
    priority: "0.5", changefreq: "yearly",
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description: "Terms of service for Tier One BioSystems research peptide supply.",
    h1: "Terms of service",
    priority: "0.5", changefreq: "yearly",
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "How Tier One BioSystems collects and handles personal data.",
    h1: "Privacy policy",
    priority: "0.5", changefreq: "yearly",
  },

  // ── Transactional / account pages: served, but never indexed ──────────────
  {
    path: "/cart",
    title: "Your Cart",
    description: "Review your order and checkout at Tier One BioSystems.",
    h1: "Your cart",
    noindex: true,
  },
  {
    path: "/login",
    title: "Sign In",
    description: "Sign in to your Tier One BioSystems account to view your orders.",
    h1: "Sign in",
    noindex: true,
  },
  {
    path: "/signup",
    title: "Create Account",
    description: "Create a Tier One BioSystems account to save your info and track your orders.",
    h1: "Create an account",
    noindex: true,
  },
  {
    path: "/account",
    title: "My Account",
    description: "Manage your Tier One BioSystems profile and view your order history.",
    h1: "My account",
    noindex: true,
  },
];

const STATIC_BY_PATH = Object.fromEntries(STATIC_ROUTES.map(r => [r.path, r]));

// Lookup used by the pages. Throws loudly during development if a page asks
// for a path that isn't in the table, because a missing entry means that page
// would also be missing from the sitemap and the prerender.
export function routeMeta(path) {
  const meta = STATIC_BY_PATH[path];
  if (!meta) throw new Error(`No route metadata registered for "${path}" — add it to src/data/routes.js`);
  return meta;
}

// ─── The full set of URLs the build must produce ─────────────────────────────
export function productRoutes() {
  return PRODUCTS.map(product => ({
    path: `/product/${product.id}`,
    ...productMeta(product),
    h1: `${product.name} ${product.dose}`,
    product,
    priority: "0.8",
    changefreq: "weekly",
  }));
}

export function articleRoutes(today = todayISO()) {
  return publishedArticleMeta(today).map(article => ({
    path: `/research/${article.slug}`,
    ...articleMeta(article),
    h1: article.title,
    article,
    lastmod: article.date,
    priority: "0.8",
    changefreq: "monthly",
  }));
}

export function allRoutes(today = todayISO()) {
  return [...STATIC_ROUTES, ...productRoutes(), ...articleRoutes(today)];
}

// Only these belong in the sitemap: indexable, canonical, public.
export function sitemapRoutes(today = todayISO()) {
  return allRoutes(today).filter(route => !route.noindex);
}

export function canonicalUrl(path) {
  const clean = path.replace(/\/+$/, "");
  return `${SITE_DOMAIN}${clean || "/"}`;
}
