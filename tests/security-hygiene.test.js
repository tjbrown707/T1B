import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createOrderHandler } from "../netlify/functions/create-order.js";
import { isAllowedOrigin } from "../netlify/functions/_shared/http.js";
import { verifyTurnstileToken } from "../netlify/functions/_shared/turnstile.js";
import {
  acceptAnalytics,
  ANALYTICS_CONSENT_KEY,
  declineAnalytics,
  getAnalyticsConsent,
  initAnalyticsIfGranted,
  MEASUREMENT_ID,
  revokeAnalytics,
} from "../src/analytics.js";
import { PRODUCTS } from "../src/data/catalog.js";
import { securityTxtProblems } from "../src/data/security-txt.js";

test("analytics remains unloaded until consent and can be revoked", () => {
  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); },
  };
  const cookies = new Map([
    ["_ga", "GA1.1.111.222"],
    [`_ga_${MEASUREMENT_ID.replace(/^G-/, "")}`, "GS1.1.333"],
    ["cart", "keep-me"],
  ]);
  const scripts = [];
  const document = {
    head: { appendChild(node) { scripts.push(node); } },
    createElement() {
      return {
        async: false,
        src: "",
        dataset: {},
        remove() {
          const index = scripts.indexOf(this);
          if (index >= 0) scripts.splice(index, 1);
        },
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return scripts.filter(node => node.src); },
  };
  Object.defineProperty(document, "cookie", {
    get() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set(value) {
      const [pair, ...attrs] = String(value).split(";");
      const [rawName, rawValue = ""] = pair.split("=");
      const name = rawName.trim();
      const expired = attrs.some(part => /expires\s*=\s*Thu, 01 Jan 1970/i.test(part));
      if (expired || rawValue === "") cookies.delete(name);
      else cookies.set(name, rawValue);
    },
  });

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = {
    location: { hostname: "www.tierone.bio" },
    __tierOneAnalyticsLoaded: false,
  };
  globalThis.document = document;

  try {
    assert.equal(getAnalyticsConsent(storage), null);
    initAnalyticsIfGranted(storage);
    assert.equal(globalThis.window.__tierOneAnalyticsLoaded, false);
    assert.equal(scripts.length, 0);

    declineAnalytics(storage, document);
    assert.equal(store.get(ANALYTICS_CONSENT_KEY), "denied");
    assert.equal(scripts.length, 0);

    acceptAnalytics(storage);
    assert.equal(store.get(ANALYTICS_CONSENT_KEY), "granted");
    assert.equal(globalThis.window.__tierOneAnalyticsLoaded, true);
    assert.equal(globalThis.window[`ga-disable-${MEASUREMENT_ID}`], false);
    assert.ok(scripts.some(node => node.src.includes("googletagmanager.com/gtag/js")));

    revokeAnalytics(storage, document);
    assert.equal(store.get(ANALYTICS_CONSENT_KEY), "denied");
    assert.equal(globalThis.window.__tierOneAnalyticsLoaded, false);
    assert.equal(globalThis.window[`ga-disable-${MEASUREMENT_ID}`], true);
    assert.equal(cookies.has("_ga"), false);
    assert.equal(cookies.has(`_ga_${MEASUREMENT_ID.replace(/^G-/, "")}`), false);
    assert.equal(cookies.get("cart"), "keep-me");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("security.txt publishes a current contact and disclosure policy", () => {
  const text = readFileSync("public/.well-known/security.txt", "utf8");
  assert.deepEqual(securityTxtProblems(text, new Date("2026-08-25T00:00:00.000Z")), []);
  assert.match(text, /^Contact: mailto:sales@tierone\.bio$/m);
  assert.match(text, /^Policy: https:\/\/www\.tierone\.bio\/security$/m);
  assert.match(text, /^Canonical: https:\/\/www\.tierone\.bio\/\.well-known\/security\.txt$/m);
  assert.match(
    securityTxtProblems(text, new Date("2028-01-01T00:00:00.000Z")).join(" "),
    /Expires date has passed/,
  );

  const site = readFileSync("site_1.jsx", "utf8");
  assert.match(site, /Cookie Settings/);
  assert.match(site, /path="\/security"/);
});

test("Turnstile verification posts the token and fails closed", async () => {
  let captured;
  const accepted = await verifyTurnstileToken("token-value", {
    secret: "secret-value",
    remoteIp: "203.0.113.10",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });
  assert.deepEqual(accepted, { ok: true });
  assert.equal(captured.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  const body = new URLSearchParams(captured.options.body);
  assert.equal(body.get("secret"), "secret-value");
  assert.equal(body.get("response"), "token-value");
  assert.equal(body.get("remoteip"), "203.0.113.10");

  const previousError = console.error;
  console.error = () => {};
  try {
    const rejected = await verifyTurnstileToken("bad-token", {
      secret: "secret-value",
      fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
    });
    assert.equal(rejected.ok, false);
    const missingSecret = await verifyTurnstileToken("token-value", { secret: "" });
    assert.equal(missingSecret.ok, false);
  } finally {
    console.error = previousError;
  }
});

test("invalid Turnstile and cross-origin checkout requests never reach Supabase", async () => {
  const previousNetlify = globalThis.Netlify;
  globalThis.Netlify = {
    env: {
      get(name) {
        return name === "TURNSTILE_SECRET_KEY" ? "test-secret" : undefined;
      },
    },
  };
  let databaseCalls = 0;
  const handler = createOrderHandler({
    createClient() {
      databaseCalls += 1;
      throw new Error("database must not be reached");
    },
    fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
  });
  const body = {
    orderNumber: "T1B-260825-123456",
    researchAcknowledged: true,
    customer: {
      name: "Research Customer",
      email: "researcher@example.com",
      phone: "555-555-1212",
      address: "123 Lab Road",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
    },
    items: [{ id: PRODUCTS[0].id, qty: 1 }],
    paymentMethod: "zelle",
    discountCodes: [],
    turnstileToken: "invalid-token",
  };

  const previousError = console.error;
  console.error = () => {};
  try {
    const invalid = await handler(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://www.tierone.bio" },
      body: JSON.stringify(body),
    }));
    assert.equal(invalid.status, 403);
    assert.equal(databaseCalls, 0);

    const crossOrigin = await handler(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify(body),
    }));
    assert.equal(crossOrigin.status, 403);
    assert.equal(databaseCalls, 0);
  } finally {
    console.error = previousError;
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

test("CSP permits only the required analytics, Turnstile, and image sources", () => {
  const toml = readFileSync("netlify.toml", "utf8");
  const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1] || "";
  assert.match(csp, /script-src 'self'[^;]*challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(csp, /stats\.g\.doubleclick\.net/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);

  const imageDirectives = csp
    .split(";")
    .map(directive => directive.trim().split(/\s+/))
    .filter(([name]) => name === "img-src");
  assert.equal(imageDirectives.length, 1, "CSP must have exactly one img-src directive");
  const imageSources = imageDirectives[0].slice(1);
  const expectedImageSources = [
    "'self'",
    "data:",
    "https://*.google-analytics.com",
    "https://www.googletagmanager.com",
  ];
  assert.deepEqual(imageSources.toSorted(), expectedImageSources.toSorted());
  assert.equal(new Set(imageSources).size, imageSources.length, "img-src must not repeat a source");
  assert.ok(!imageSources.includes("https:"), "img-src must not allow every HTTPS host");
  assert.ok(!imageSources.includes("*"), "img-src must not contain a wildcard source");

  const live = new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    headers: { Origin: "https://www.tierone.bio" },
  });
  const local = new Request("http://localhost:8888/.netlify/functions/create-order", {
    headers: { Origin: "http://localhost:8888" },
  });
  const other = new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(isAllowedOrigin(live), true);
  assert.equal(isAllowedOrigin(local), true);
  assert.equal(isAllowedOrigin(other), false);
});
