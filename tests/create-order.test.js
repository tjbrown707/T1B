import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import createOrder, {
  canUsePersonalDiscount,
  config,
  ordersMatch,
  validateOrderRequest,
} from "../netlify/functions/create-order.js";
import validateDiscount from "../netlify/functions/validate-discount.js";
import { PRODUCTS } from "../src/data/catalog.js";

function validRequest(overrides = {}) {
  return {
    orderNumber: "T1B-260811-123456",
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
    items: [{ id: PRODUCTS[0].id, qty: 2 }],
    paymentMethod: "cashapp",
    discountCodes: [" welcome10 "],
    ...overrides,
  };
}

test("order requests are trimmed and reduced to catalog ids and quantities", () => {
  const result = validateOrderRequest(validRequest());
  assert.equal(result.error, undefined);
  assert.equal(result.data.customer.email, "researcher@example.com");
  assert.deepEqual(result.data.items, [{ id: PRODUCTS[0].id, qty: 2 }]);
  assert.equal(result.data.paymentMethod, "Cash App");
  assert.deepEqual(result.data.discountCodes, ["WELCOME10"]);
});

test("legacy discount codes containing @ pass validation and order submission", async () => {
  const requestResult = validateOrderRequest(validRequest({ discountCodes: [" m1comb@t "] }));
  assert.equal(requestResult.error, undefined);
  assert.deepEqual(requestResult.data.discountCodes, ["M1COMB@T"]);

  const previousNetlify = globalThis.Netlify;
  globalThis.Netlify = {
    env: {
      get(name) {
        return name === "DISCOUNT_CODES"
          ? JSON.stringify({
            "M1COMB@T": { type: "percent", value: 25, label: "25% off" },
          })
          : undefined;
      },
    },
  };

  try {
    const response = await validateDiscount(new Request(
      "https://www.tierone.bio/.netlify/functions/validate-discount",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "m1comb@t" }),
      },
    ));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      valid: true,
      code: "M1COMB@T",
      type: "percent",
      value: 25,
      label: "25% off",
    });
  } finally {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

test("order request bounds reject malformed or oversized customer input", () => {
  assert.match(validateOrderRequest(validRequest({ paymentMethod: "wire" })).error, /Cash App or Venmo/);
  assert.match(validateOrderRequest(validRequest({
    customer: { ...validRequest().customer, email: "not-an-email" },
  })).error, /valid email/);
  assert.match(validateOrderRequest(validRequest({
    customer: { ...validRequest().customer, address: "x".repeat(201) },
  })).error, /too long/);
  assert.match(validateOrderRequest(validRequest({ discountCodes: ["A", "B", "C"] })).error, /Too many/);
  assert.match(validateOrderRequest(validRequest({ discountCodes: ["<script>"] })).error, /Invalid discount/);
});

test("replayed order numbers must match every immutable order field", () => {
  const expected = {
    user_id: null,
    order_number: "T1B-260811-123456",
    items: [{ id: PRODUCTS[0].id, qty: 2, nested: { b: 2, a: 1 } }],
    items_text: "one line",
    subtotal: 100,
    discount_code: null,
    discount_amount: 0,
    shipping: 10,
    total: 110,
    payment_method: "Cash App",
    customer_name: "Research Customer",
    customer_email: "researcher@example.com",
    customer_phone: "555-555-1212",
    ship_address: "123 Lab Road",
    ship_city: "Phoenix",
    ship_state: "AZ",
    ship_zip: "85001",
  };
  const saved = {
    ...expected,
    status: "SHIPPED",
    items: [{ nested: { a: 1, b: 2 }, qty: 2, id: PRODUCTS[0].id }],
    subtotal: "100.00",
    shipping: "10.00",
    total: "110.00",
  };
  assert.equal(ordersMatch(saved, expected), true);
  assert.equal(ordersMatch({ ...saved, user_id: "11111111-1111-4111-8111-111111111111" }, expected), false);
  assert.equal(ordersMatch({ ...saved, customer_email: "other@example.com" }, expected), false);
  assert.equal(ordersMatch({ ...saved, total: "0.00" }, expected), false);
});

test("a consumed personal code can resume only the order that consumed it", () => {
  const consumed = {
    redeemed_at: "2026-08-11T12:00:00.000Z",
    order_number: "T1B-260811-123456",
  };
  assert.equal(canUsePersonalDiscount(consumed, "T1B-260811-123456"), true);
  assert.equal(canUsePersonalDiscount(consumed, "T1B-260811-654321"), false);
  assert.equal(canUsePersonalDiscount({ expires_at: "2026-08-12T00:00:00.000Z" }, "x", Date.parse("2026-08-11")), true);
  assert.equal(canUsePersonalDiscount({ expires_at: "2026-08-10T00:00:00.000Z" }, "x", Date.parse("2026-08-11")), false);
});

test("order creation has a platform rate limit and rejects large bodies before database access", async () => {
  assert.deepEqual(config.rateLimit.aggregateBy, ["ip", "domain"]);
  assert.equal(config.rateLimit.windowLimit, 8);

  const response = await createOrder(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(33 * 1024) }),
  }));
  assert.equal(response.status, 413);
});

test("checkout notifications and receipts use the server-confirmed order", () => {
  const source = readFileSync("site_1.jsx", "utf8");
  const index = readFileSync("index.html", "utf8");
  const paymentHandler = source.slice(
    source.indexOf("async function handlePlaceOrderAndPay"),
    source.indexOf("const inputStyle", source.indexOf("async function handlePlaceOrderAndPay")),
  );
  assert.doesNotMatch(source, /redeem-discount/);
  assert.match(source, /formData\.append\("orderStatus", confirmed\.status\)/);
  assert.match(source, /orderSubtotal: `\$\$\{serverTotals\.subtotal\.toFixed\(2\)\}`/);
  assert.match(source, /orderTotal: `\$\$\{serverTotals\.total\.toFixed\(2\)\}`/);
  assert.match(source, /No need to come back\./);
  assert.doesNotMatch(source, /I HAVE SENT PAYMENT|PENDING_PAYMENT/);
  assert.ok(
    paymentHandler.indexOf('fetch("/.netlify/functions/create-order"')
      < paymentHandler.indexOf("window.location.assign(paymentUrl)"),
    "the durable order must be created before checkout leaves for the payment app",
  );
  assert.match(index, /name="researchUseAcknowledged"/);
});

test("the schema keeps order creation server-only and redemption transactional", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const migration = readFileSync("supabase/migrations/20260811120000_inventory_fulfillment_foundation.sql", "utf8");
  assert.match(migration, /alter column status set default 'AWAITING PAYMENT'/);
  assert.doesNotMatch(schema, /create policy "Users can insert their own orders"/);
  assert.match(migration, /create_order_transaction/);
  assert.match(migration, /grant execute on function public\.create_order_transaction\(jsonb, text\) to service_role/);
});
