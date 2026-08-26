import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import transportSecurity, { HSTS_VALUE, config } from "../netlify/edge-functions/transport-security.js";

test("static pages, functions, and the checkout redirect use the same non-preload HSTS policy", () => {
  const toml = readFileSync("netlify.toml", "utf8");
  const policies = [...toml.matchAll(/Strict-Transport-Security\s*=\s*"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(policies, [HSTS_VALUE]);
  assert.equal(HSTS_VALUE, "max-age=31536000; includeSubDomains");
  assert.deepEqual(config.path, ["/checkout", "/checkout/", "/.netlify/functions/*"]);
  const redirects = readFileSync("public/_redirects", "utf8");
  assert.match(redirects, /^\/checkout\s+\/cart\s+301\s*$/m);
});

for (const status of [200, 204, 304, 400, 401, 403, 404, 405, 429, 500]) {
  test(`HSTS middleware preserves the ${status} status, headers, and body`, async () => {
    const body = [204, 304].includes(status) ? null : JSON.stringify({ status });
    const original = new Response(body, {
      status,
      headers: {
        "Strict-Transport-Security": "max-age=31536000",
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "https://www.tierone.bio",
        Vary: "Origin, Authorization",
      },
    });
    let calls = 0;
    const result = await transportSecurity(new Request("https://www.tierone.bio/.netlify/functions/create-order"), {
      next(options) {
        calls++;
        assert.deepEqual(options, { sendConditionalRequest: true });
        return original;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("strict-transport-security"), HSTS_VALUE);
    for (const header of ["content-type", "cache-control", "access-control-allow-origin", "vary"]) {
      assert.equal(result.headers.get(header), original.headers.get(header));
    }
    assert.equal(await result.text(), body || "");
  });
}

test("HSTS middleware preserves immutable redirects including their query strings", async () => {
  const target = "https://www.tierone.bio/cart?source=bookmark";
  const original = Response.redirect(target, 301);
  const result = await transportSecurity(new Request("https://www.tierone.bio/checkout?source=bookmark"), {
    next: () => original,
  });
  assert.equal(result.status, 301);
  assert.equal(result.headers.get("location"), target);
  assert.equal(result.headers.get("strict-transport-security"), HSTS_VALUE);
  assert.equal(await result.text(), "");
});

test("HSTS middleware leaves submitted order bodies unread and passes binary PDFs through unchanged", async () => {
  const request = new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    method: "POST",
    body: JSON.stringify({ orderNumber: "test-only" }),
  });
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 255, 0, 128]);
  const result = await transportSecurity(request, {
    next() {
      assert.equal(request.bodyUsed, false);
      return new Response(bytes, { headers: { "Content-Type": "application/pdf" } });
    },
  });
  assert.equal(request.bodyUsed, false);
  assert.equal(result.headers.get("content-type"), "application/pdf");
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
});

test("HSTS middleware preserves separate response cookies", async () => {
  const headers = new Headers();
  headers.append("Set-Cookie", "first=one; Secure; HttpOnly; Path=/");
  headers.append("Set-Cookie", "second=two; Secure; SameSite=Lax; Path=/");
  const original = new Response(null, { headers });
  const result = await transportSecurity(new Request("https://www.tierone.bio/.netlify/functions/test"), {
    next: () => original,
  });
  assert.deepEqual(result.headers.getSetCookie(), original.headers.getSetCookie());
});
