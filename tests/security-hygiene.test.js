import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  acceptAnalytics,
  ANALYTICS_CONSENT_KEY,
  declineAnalytics,
  getAnalyticsConsent,
  initAnalyticsIfGranted,
} from "../src/analytics.js";
import { HSTS_VALUE, isAllowedOrigin, jsonResponse } from "../netlify/functions/_shared/http.js";
import { orderReceiptParams, sendOrderReceipt } from "../netlify/functions/_shared/emailjs.js";

test("the public bundle source no longer ships EmailJS send calls", () => {
  const site = readFileSync("site_1.jsx", "utf8");
  const main = readFileSync("src/main.jsx", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.doesNotMatch(site, /emailjs\.send|@emailjs\/browser|service_r3r7crs|template_i9k8u2a/);
  assert.doesNotMatch(main, /initAnalytics\(\)/);
  assert.equal(pkg.dependencies["@emailjs/browser"], undefined);
});

test("security.txt uses the existing contact address and privacy policy", () => {
  const text = readFileSync("public/.well-known/security.txt", "utf8");
  assert.match(text, /^Contact: mailto:sales@tierone\.bio$/m);
  assert.match(text, /^Expires: 2027-08-20T23:59:59\.000Z$/m);
  assert.match(text, /^Policy: https:\/\/www\.tierone\.bio\/privacy$/m);
  assert.match(text, /^Canonical: https:\/\/www\.tierone\.bio\/\.well-known\/security\.txt$/m);
});

test("one HSTS policy is set for HTML and function responses, without preload", () => {
  const toml = readFileSync("netlify.toml", "utf8");
  assert.match(toml, /Strict-Transport-Security = "max-age=31536000; includeSubDomains"/);
  assert.doesNotMatch(toml, /Strict-Transport-Security = "[^"]*preload/);
  assert.doesNotMatch(toml, /stats\.g\.doubleclick\.net/);
  assert.doesNotMatch(toml, /api\.emailjs\.com/);
  assert.doesNotMatch(toml, /script-src[^"]*'unsafe-inline'/);
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

test("EmailJS receipts fail closed when the private key is missing", async () => {
  const previous = globalThis.Netlify;
  const calls = [];
  globalThis.Netlify = {
    env: {
      get(name) {
        if (name === "EMAILJS_PRIVATE_KEY") return undefined;
        if (name === "EMAILJS_SERVICE_ID") return "service_test";
        if (name === "EMAILJS_TEMPLATE_ID") return "template_test";
        if (name === "EMAILJS_PUBLIC_KEY") return "public_test";
        return undefined;
      },
    },
  };

  try {
    const result = await sendOrderReceipt(orderReceiptParams({
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
      totals: { subtotal: 100, discountAmount: 0, shipping: 10, total: 110 },
      discountCode: "",
      paymentMethod: "Cash App",
    }), (...args) => {
      calls.push(args);
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "Order email is not configured.");
    assert.equal(calls.length, 0);
    assert.doesNotMatch(result.error, /researcher@example\.com|T1B-260820-123456/);
  } finally {
    if (previous === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previous;
  }
});

test("EmailJS receipts send from env vars and do not put PII in errors", async () => {
  const previous = globalThis.Netlify;
  globalThis.Netlify = {
    env: {
      get(name) {
        return {
          EMAILJS_SERVICE_ID: "service_test",
          EMAILJS_TEMPLATE_ID: "template_test",
          EMAILJS_PUBLIC_KEY: "public_test",
          EMAILJS_PRIVATE_KEY: "private_test",
        }[name];
      },
    },
  };

  try {
    let captured;
    const result = await sendOrderReceipt(orderReceiptParams({
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
    }), (url, options) => {
      captured = { url, options };
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

    assert.equal(result.ok, true);
    assert.equal(captured.url, "https://api.emailjs.com/api/v1.0/email/send");
    const body = JSON.parse(captured.options.body);
    assert.equal(body.service_id, "service_test");
    assert.equal(body.template_id, "template_test");
    assert.equal(body.user_id, "public_test");
    assert.equal(body.accessToken, "private_test");
    assert.equal(body.template_params.customerEmail, "researcher@example.com");
    assert.equal(body.template_params.orderTotal, "$70.00");
    assert.equal(body.template_params.shipping, "FREE");
    assert.equal(body.template_params.discountAmount, "-$10.00");
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
