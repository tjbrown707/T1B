// Google Analytics loader.
//
// This used to be an inline <script> in index.html, which forced the Content
// Security Policy to allow 'unsafe-inline' for scripts — and an inline-script
// allowance defeats most of what a CSP is for, because an injected <script> is
// then just as permitted as this one. Moving it into the bundle lets the policy
// drop that allowance entirely.
//
// NOTE: analytics still load on every visit, exactly as before. Whether they
// should instead wait for a consent choice depends on where visitors are, and
// is a decision to take alongside the privacy-policy rewrite.

const MEASUREMENT_ID = "G-HY1FDLSRTJ";

export function initAnalytics() {
  if (typeof window === "undefined" || window.__tierOneAnalyticsLoaded) return;
  window.__tierOneAnalyticsLoaded = true;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID, { anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}
