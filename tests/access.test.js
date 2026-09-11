import test from "node:test";
import assert from "node:assert/strict";
import { loginUrl, requiresLogin, safeReturnPath } from "../src/data/access.js";

test("return destinations preserve local queries and reject off-site paths and auth loops", () => {
  const destination = "/product/bpc157-10?ref=cart#details";
  assert.equal(safeReturnPath(destination), destination);
  assert.equal(new URL(loginUrl(destination), "https://www.tierone.bio").searchParams.get("redirect"), destination);
  for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil.example", "/login", "/signup?redirect=/login", "/reset-password", "/products/../login", null]) {
    assert.equal(safeReturnPath(path), "/account", String(path));
  }
});

test("catalog and resources require login while public information and auth remain available", () => {
  for (const path of ["/products", "/product/bpc157-10", "/research", "/research/example", "/cart", "/checkout", "/lab-results", "/calculator"]) {
    assert.equal(requiresLogin(path), true, path);
  }
  for (const path of ["/", "/about", "/contact", "/privacy", "/terms", "/login", "/signup", "/reset-password"]) {
    assert.equal(requiresLogin(path), false, path);
  }
});
