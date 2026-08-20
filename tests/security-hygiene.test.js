import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  acceptAnalytics,
  ANALYTICS_CONSENT_KEY,
  declineAnalytics,
  getAnalyticsConsent,
  initAnalyticsIfGranted,
  MEASUREMENT_ID,
  revokeAnalytics,
} from "../src/analytics.js";
import { HSTS_VALUE, isAllowedOrigin, jsonResponse } from "../netlify/functions/_shared/http.js";
import { orderReceiptParams, sendOrderReceiptDelivery } from "../netlify/functions/_shared/order-receipt.js";
import { securityTxtProblems } from "../src/data/security-txt.js";

test("the public bundle source no longer ships EmailJS send calls", () => {
  const site = readFileSync("site_1.jsx", "utf8");
  const main = readFileSync("src/main.jsx", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.doesNotMatch(site, /emailjs\.send|@emailjs\/browser|service_r3r7crs|template_i9k8u2a/);
  assert.doesNotMatch(main, /initAnalytics\(\)/);
  assert.equal(pkg.dependencies["@emailjs/browser"], undefined);
});

test("security.txt uses the live contact and a real disclosure policy", () => {
  const text = readFileSync("public/.well-known/security.txt", "utf8");
  assert.match(text, /^Contact: mailto:sales@tierone\.bio$/m);
  assert.match(text, /^Policy: https:\/\/www\.tierone\.bio\/security$/m);
  assert.match(text, /^Canonical: https:\/\/www\.tierone\.bio\/\.well-known\/security\.txt$/m);
  assert.deepEqual(securityTxtProblems(text, new Date("2026-08-20T21:00:00.000Z")), []);
  assert.match(
    securityTxtProblems(text, new Date("2028-01-01T00:00:00.000Z")).join(" "),
    /Expires date has passed/,
  );
});

test("one HSTS policy is set for HTML and function responses, without preload", () => {
  const toml = readFileSync("netlify.toml", "utf8");
  assert.match(toml, /Strict-Transport-Security = "max-age=31536000; includeSubDomains"/);
  assert.doesNotMatch(toml, /Strict-Transport-Security = "[^"]*preload/);
  assert.doesNotMatch(toml, /stats\.g\.doubleclick\.net/);
  assert.doesNotMatch(toml, /api\.emailjs\.com/);
  const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1] || "";
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /challenges\.cloudflare\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.equal(HSTS_VALUE, "max-age=31536000; includeSubDomains");
  assert.doesNotMatch(HSTS_VALUE, /preload/);

  const response = jsonResponse(200, { ok: true }, "POST, OPTIONS");
  assert.equal(response.headers.get("strict-transport-security"), HSTS_VALUE);
});

test("analytics stays unloaded until the visitor accepts", () => {
  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); },
  };

  assert.equal(getAnalyticsConsent(storage), null);
  declineAnalytics(storage);
  assert.equal(store.get(ANALYTICS_CONSENT_KEY), "denied");
  initAnalyticsIfGranted(storage);
  assert.equal(globalThis.window?.__tierOneAnalyticsLoaded, undefined);

  acceptAnalytics(storage);
  assert.equal(store.get(ANALYTICS_CONSENT_KEY), "granted");
});

test("Cookie Settings revoke stops analytics and removes GA cookies", () => {
  const cookies = new Map([
    ["_ga", "GA1.1.111.222"],
    [`_ga_${MEASUREMENT_ID.replace(/^G-/, "")}`, "GS1.1.333"],
    ["_gid", "GA1.1.444"],
    ["cart", "keep-me"],
  ]);
  const scripts = [];
  const document = {
    head: { appendChild(node) { scripts.push(node); } },
    createElement() {
      const node = {
        async: false,
        src: "",
        dataset: {},
        remove() {
          const index = scripts.indexOf(node);
          if (index >= 0) scripts.splice(index, 1);
        },
      };
      return node;
    },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (String(selector).includes("googletagmanager.com/gtag/js") || String(selector).includes("tierone-analytics")) {
        return scripts.filter(node => node.src);
      }
      return [];
    },
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

  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); },
  };

  try {
    acceptAnalytics(storage);
    assert.equal(store.get(ANALYTICS_CONSENT_KEY), "granted");
    assert.equal(globalThis.window.__tierOneAnalyticsLoaded, true);
    assert.equal(typeof globalThis.window.gtag, "function");
    assert.ok(scripts.some(node => node.src.includes("googletagmanager.com/gtag/js")));

    revokeAnalytics(storage, document);
    assert.equal(store.get(ANALYTICS_CONSENT_KEY), "denied");
    assert.equal(globalThis.window.__tierOneAnalyticsLoaded, false);
    assert.equal(globalThis.window.gtag, undefined);
    assert.equal(cookies.has("_ga"), false);
    assert.equal(cookies.has(`_ga_${MEASUREMENT_ID.replace(/^G-/, "")}`), false);
    assert.equal(cookies.has("_gid"), false);
    assert.equal(cookies.get("cart"), "keep-me");

    acceptAnalytics(storage);
    assert.equal(store.get(ANALYTICS_CONSENT_KEY), "granted");
    assert.equal(globalThis.window.__tierOneAnalyticsLoaded, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  const cookieSettings = readFileSync("src/CookieSettings.jsx", "utf8");
  const footer = readFileSync("site_1.jsx", "utf8");
  assert.match(footer, /Cookie Settings/);
  assert.match(cookieSettings, /revokeAnalytics/);
});

test("Resend receipts fail closed when the API key is missing", async () => {
  const previous = globalThis.Netlify;
  const calls = [];
  globalThis.Netlify = {
    env: {
      get(name) {
        if (name === "RESEND_FROM_ADDRESS") return "Tier One BioSystems <noreply@tierone.bio>";
        return undefined;
      },
    },
  };

  try {
    await assert.rejects(
      () => sendOrderReceiptDelivery(receiptDelivery(), {
        fetchImpl: (...args) => {
          calls.push(args);
          return Promise.resolve(new Response(JSON.stringify({ id: "re_x" }), { status: 200 }));
        },
        apiKey: "",
      }),
      /RESEND_API_KEY is not configured/,
    );
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previous;
  }
});

test("Resend receipts send from env vars and do not put PII in errors", async () => {
  const previous = globalThis.Netlify;
  globalThis.Netlify = {
    env: {
      get(name) {
        return {
          RESEND_API_KEY: "re_test_key",
          RESEND_FROM_ADDRESS: "Tier One BioSystems <noreply@tierone.bio>",
        }[name];
      },
    },
  };

  try {
    let captured;
    const result = await sendOrderReceiptDelivery(receiptDelivery(), {
      fetchImpl: (url, options) => {
        captured = { url, options };
        return Promise.resolve(new Response(JSON.stringify({ id: "re_abc123" }), { status: 200 }));
      },
      apiKey: "re_test_key",
    });

    assert.equal(result.providerMessageId, "re_abc123");
    assert.equal(captured.url, "https://api.resend.com/emails");
    assert.equal(captured.options.headers["Idempotency-Key"], "order-receipt/v1/order-1");
    const body = JSON.parse(captured.options.body);
    assert.equal(body.to[0], "researcher@example.com");
    assert.match(body.html, /T1B-260820-123456/);
    assert.match(body.text, /\$70\.00/);

    await assert.rejects(
      () => sendOrderReceiptDelivery(receiptDelivery(), {
        fetchImpl: () => Promise.reject(new Error("network down for researcher@example.com")),
        apiKey: "re_test_key",
      }),
      error => {
        assert.match(error.message, /Resend could not be reached/);
        assert.doesNotMatch(error.message, /researcher@example\.com|T1B-260820-123456/);
        return true;
      },
    );
  } finally {
    if (previous === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previous;
  }
});

test("same-origin checks allow the live site and localhost, not other hosts", () => {
  const live = new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    headers: { Origin: "https://www.tierone.bio" },
  });
  const local = new Request("http://localhost:8888/.netlify/functions/create-order", {
    headers: { Origin: "http://localhost:8888" },
  });
  const other = new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    headers: { Origin: "https://evil.example" },
  });
  const missing = new Request("https://www.tierone.bio/.netlify/functions/create-order");
  assert.equal(isAllowedOrigin(live), true);
  assert.equal(isAllowedOrigin(local), true);
  assert.equal(isAllowedOrigin(other), false);
  assert.equal(isAllowedOrigin(missing), true);
});

function receiptDelivery(overrides = {}) {
  const params = orderReceiptParams({
    customer: {
      name: "Research Customer",
      email: "researcher@example.com",
      phone: "555-555-1212",
      address: "123 Lab Road",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
    },
    orderNumber: "T1B-260820-123456",
    itemsText: "BPC-157 10mg x1",
    totals: { subtotal: 80, discountAmount: 10, shipping: 0, total: 70 },
    discountCode: "WELCOME10",
    paymentMethod: "Venmo",
  });
  return {
    id: "delivery-1",
    order_id: "order-1",
    status: "SENDING",
    recipient_email: params.customerEmail,
    customer_name: params.customerName,
    order_number: params.orderNumber,
    items_text: params.orderItems,
    order_subtotal: params.orderSubtotal,
    discount_code: params.discountCode,
    discount_amount: params.discountAmount,
    shipping: params.shipping,
    payment_method: params.paymentMethod,
    order_total: params.orderTotal,
    shipping_address: params.shippingAddress,
    shipping_city: params.shippingCity,
    shipping_state: params.shippingState,
    shipping_zip: params.shippingZip,
    customer_phone: params.customerPhone,
    idempotency_key: "order-receipt/v1/order-1",
    claim_token: "claim-1",
    ...overrides,
  };
}
