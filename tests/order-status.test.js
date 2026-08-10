import test from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_STATUSES,
  DEFAULT_ORDER_STATUS,
  normalizeStatus,
  isValidStatus,
  parseAdminEmails,
  isAdminEmail,
} from "../src/data/order-status.js";

test("an order starts life unreconciled", () => {
  assert.equal(DEFAULT_ORDER_STATUS, "AWAITING PAYMENT");
  assert.ok(ORDER_STATUSES.includes(DEFAULT_ORDER_STATUS));
});

test("status matching survives case and spacing from a form control", () => {
  assert.equal(normalizeStatus("  awaiting   payment "), "AWAITING PAYMENT");
  assert.ok(isValidStatus("confirmed"));
  assert.ok(isValidStatus(" Shipped "));
});

test("a status the shop does not use is rejected", () => {
  assert.equal(isValidStatus("PAID IN FULL"), false);
  assert.equal(isValidStatus(""), false);
  assert.equal(isValidStatus(null), false);
  assert.equal(isValidStatus("DROP TABLE orders"), false);
});

// The property that matters most in this file. If a missing or misspelled
// ADMIN_EMAILS ever read as "allow everyone", every signed-in customer would be
// handed every other customer's name, address and phone number.
test("an unset or empty allowlist admits nobody", () => {
  for (const raw of [undefined, null, "", "   ", ",", " , , "]) {
    assert.equal(
      isAdminEmail("owner@example.com", raw),
      false,
      `empty allowlist (${JSON.stringify(raw)}) must not grant access`,
    );
  }
});

test("an address on the list is admitted regardless of case or padding", () => {
  const list = "Owner@Example.com, second@example.com";
  assert.ok(isAdminEmail("owner@example.com", list));
  assert.ok(isAdminEmail("  OWNER@EXAMPLE.COM  ", list));
  assert.ok(isAdminEmail("second@example.com", list));
});

test("an address not on the list is refused", () => {
  const list = "owner@example.com";
  assert.equal(isAdminEmail("customer@example.com", list), false);
  assert.equal(isAdminEmail("", list), false);
  assert.equal(isAdminEmail(null, list), false);
  // Not a prefix or substring match: a lookalike domain must not pass.
  assert.equal(isAdminEmail("owner@example.com.evil.test", list), false);
  assert.equal(isAdminEmail("notowner@example.com", list), false);
});

test("the allowlist parses either commas or whitespace", () => {
  assert.deepEqual(parseAdminEmails("a@x.test, b@x.test"), ["a@x.test", "b@x.test"]);
  assert.deepEqual(parseAdminEmails("a@x.test\nb@x.test"), ["a@x.test", "b@x.test"]);
});
