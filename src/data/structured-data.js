// Schema.org builders.
//
// Shared by the prerenderer (which bakes this into the HTML) and by the React
// pages (which inject it for crawlers that do execute JavaScript). Building it
// in one place is what stops the two from describing the same page differently.
//
// Keep this file free of React and of any browser API — it is imported by
// plain Node scripts during the build.

import { SITE_DOMAIN, SITE_NAME, CONTACT_EMAIL } from "./site.js";
import { applySale } from "./pricing.js";
import {
  canonicalUrl,
  productImageAlt,
  PRODUCT_IMAGE_WIDTH,
  PRODUCT_IMAGE_HEIGHT,
} from "./routes.js";

const absolute = (path) =>
  !path ? `${SITE_DOMAIN}/logo-wide.png` : (path.startsWith("http") ? path : `${SITE_DOMAIN}${path}`);

export const ORGANISATION = {
  "@type": "Organization",
  "@id": `${SITE_DOMAIN}/#organization`,
  name: SITE_NAME,
  url: `${SITE_DOMAIN}/`,
  logo: `${SITE_DOMAIN}/logo-wide.png`,
  email: CONTACT_EMAIL,
};

export const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_DOMAIN}/#website`,
  url: `${SITE_DOMAIN}/`,
  name: SITE_NAME,
  publisher: { "@id": `${SITE_DOMAIN}/#organization` },
};

export function breadcrumbLd(trail) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([path, name], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: canonicalUrl(path),
    })),
  };
}

export function productLd(product) {
  const url = canonicalUrl(`/product/${product.id}`);
  const imageUrl = absolute(product.image);
  return {
    "@type": "Product",
    "@id": `${url}#product`,
    name: `${product.name} ${product.dose}`,
    description: product.research,
    sku: product.id,
    category: product.category,
    brand: { "@type": "Brand", name: SITE_NAME },
    image: [{
      "@type": "ImageObject",
      url: imageUrl,
      contentUrl: imageUrl,
      caption: productImageAlt(product),
      width: PRODUCT_IMAGE_WIDTH,
      height: PRODUCT_IMAGE_HEIGHT,
      representativeOfPage: true,
    }],
    url,
    // Deliberately no `availability` and no `priceValidUntil`. There is no
    // stock system behind this catalog, so marking all 27 products InStock
    // with a validity date years out states two things the site cannot back
    // up — and Google's structured-data policy treats that as misrepresentation.
    offers: {
      "@type": "Offer",
      url,
      price: applySale(product.price),
      priceCurrency: "USD",
      seller: { "@type": "Organization", name: SITE_NAME },
    },
  };
}

export function articleLd(article) {
  const url = canonicalUrl(`/research/${article.slug}`);
  return {
    "@type": "Article",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.metaDescription || article.excerpt,
    datePublished: article.date,
    dateModified: article.date,
    image: [absolute(article.heroImage)],
    author: { "@type": "Organization", name: article.author || SITE_NAME },
    publisher: ORGANISATION,
    mainEntityOfPage: url,
  };
}

export function itemListLd(name, entries) {
  return {
    "@type": "ItemList",
    name,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: entry.url,
      name: entry.name,
    })),
  };
}

export function productGraph(product) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      productLd(product),
      breadcrumbLd([["/", "Home"], ["/products", "Products"], [`/product/${product.id}`, `${product.name} ${product.dose}`]]),
    ],
  };
}

export function articleGraph(article) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      articleLd(article),
      breadcrumbLd([["/", "Home"], ["/research", "Research"], [`/research/${article.slug}`, article.title]]),
    ],
  };
}
