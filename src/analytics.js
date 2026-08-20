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
// left off even after accept.

export const MEASUREMENT_ID = "G-HY1FDLSRTJ";
export const ANALYTICS_CONSENT_KEY = "tierone-analytics-consent";

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

export function declineAnalytics(storage) {
  persistConsent("denied", storage);
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

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
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
