// Google Analytics loader.
//
// This used to be an inline <script> in index.html, which forced the Content
// Security Policy to allow 'unsafe-inline' for scripts — and an inline-script
// allowance defeats most of what a CSP is for, because an injected <script> is
// then just as permitted as this one. Moving it into the bundle lets the policy
// drop that allowance entirely.
//
// The tracker is not loaded until the visitor accepts. Declining stores that
// choice and leaves gtag unloaded. Advertising / DoubleClick collection is
// left off even after accept. Cookie Settings can revoke later; that unloads
// the tracker and expires the GA cookies.

export const MEASUREMENT_ID = "G-HY1FDLSRTJ";
export const ANALYTICS_CONSENT_KEY = "tierone-analytics-consent";
export const GA_COOKIE_NAMES = ["_ga", `_ga_${MEASUREMENT_ID.replace(/^G-/, "")}`, "_gid", "_gat"];

export function getAnalyticsConsent(storage) {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    const value = store.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function acceptAnalytics(storage) {
  persistConsent("granted", storage);
  initAnalytics();
}

export function declineAnalytics(storage, documentImpl) {
  persistConsent("denied", storage);
  stopAnalytics(documentImpl);
}

export function revokeAnalytics(storage, documentImpl) {
  persistConsent("denied", storage);
  stopAnalytics(documentImpl);
}

export function initAnalyticsIfGranted(storage) {
  if (getAnalyticsConsent(storage) === "granted") initAnalytics();
}

export function initAnalytics() {
  if (typeof window === "undefined" || window.__tierOneAnalyticsLoaded) return;
  window.__tierOneAnalyticsLoaded = true;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.dataset.tieroneAnalytics = "1";
  document.head.appendChild(script);
}

export function stopAnalytics(documentImpl) {
  if (typeof window !== "undefined") {
    window.__tierOneAnalyticsLoaded = false;
    try { delete window.gtag; } catch { window.gtag = undefined; }
    try { delete window.dataLayer; } catch { window.dataLayer = undefined; }
  }

  const doc = resolveDocument(documentImpl);
  if (doc?.querySelectorAll) {
    const scripts = doc.querySelectorAll('script[src*="googletagmanager.com/gtag/js"], script[data-tierone-analytics]');
    scripts.forEach(node => node.remove());
  }
  clearGaCookies(doc);
}

export function clearGaCookies(documentImpl) {
  const doc = resolveDocument(documentImpl);
  if (!doc || typeof doc.cookie !== "string") return;

  const names = new Set(GA_COOKIE_NAMES);
  for (const part of doc.cookie.split(";")) {
    const name = part.split("=")[0].trim();
    if (name === "_ga" || name === "_gid" || name === "_gat" || name.startsWith("_ga_")) {
      names.add(name);
    }
  }

  const expired = "Thu, 01 Jan 1970 00:00:00 GMT";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const domains = ["", host ? `; domain=${host}` : "", host ? `; domain=.${host}` : ""];
  for (const name of names) {
    for (const domain of domains) {
      doc.cookie = `${name}=; expires=${expired}; path=/${domain}`;
    }
  }
}

function persistConsent(value, storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    // Private mode can refuse localStorage. The in-memory choice still stands
    // for this visit; the banner may reappear next time.
  }
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveDocument(documentImpl) {
  if (documentImpl) return documentImpl;
  if (typeof document === "undefined") return null;
  return document;
}
