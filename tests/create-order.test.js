import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import createOrder, {
  canUsePersonalDiscount,
  config,
  createOrderHandler,
  ordersMatch,
  validateOrderRequest,
} from "../netlify/functions/create-order.js";
import validateDiscount from "../netlify/functions/validate-discount.js";
import { PRODUCTS } from "../src/data/catalog.js";
import { HSTS_VALUE } from "../netlify/functions/_shared/http.js";

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
    turnstileToken: "ok-test-token",
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
  assert.match(validateOrderRequest(validRequest({ turnstileToken: "" })).error, /Bot verification/);
  assert.match(validateOrderRequest(validRequest({ turnstileToken: undefined })).error, /Bot verification/);
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
  assert.doesNotMatch(source, /emailjs\.send|@emailjs\/browser/);
  assert.match(source, /turnstileToken/);
  assert.match(source, /formData\.append\("orderStatus", confirmed\.status\)/);
  assert.match(source, /formData\.append\("orderSubtotal"/);
  assert.match(source, /formData\.append\("orderTotal"/);
  assert.match(source, /setReceiptSent\(confirmed\.receiptSent === true\)/);
  assert.match(source, /No need to come back\./);
  assert.doesNotMatch(source, /I HAVE SENT PAYMENT|PENDING_PAYMENT/);
  assert.ok(
    paymentHandler.indexOf('fetch("/.netlify/functions/create-order"')
      < paymentHandler.indexOf("window.location.assign(paymentUrl)"),
    "the durable order must be created before checkout leaves for the payment app",
  );
  assert.match(index, /name="researchUseAcknowledged"/);
});

test("create-order refuses a mismatched browser Origin without echoing it", async () => {
  const response = await createOrder(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
    },
    body: JSON.stringify({ customerEmail: "victim@example.com" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("strict-transport-security"), HSTS_VALUE);
  const body = await response.text();
  assert.match(body, /Request not allowed/);
  assert.doesNotMatch(body, /evil\.example|victim@example\.com/);
});

test("the schema keeps order creation server-only and redemption transactional", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const migration = readFileSync("supabase/migrations/20260811120000_inventory_fulfillment_foundation.sql", "utf8");
  const receiptOutbox = readFileSync("supabase/migrations/20260820220000_order_receipt_outbox.sql", "utf8");
  assert.match(migration, /alter column status set default 'AWAITING PAYMENT'/);
  assert.doesNotMatch(schema, /create policy "Users can insert their own orders"/);
  assert.match(migration, /create_order_transaction/);
  assert.match(migration, /grant execute on function public\.create_order_transaction\(jsonb, text\) to service_role/);
  assert.match(receiptOutbox, /create table public\.order_receipt_outbox/);
  assert.match(receiptOutbox, /on conflict \(order_id\) do nothing/);
  assert.match(receiptOutbox, /for update skip locked/);
});

test("replaying the same order ID does not send a second receipt", async () => {
  const { handler, state } = createTestOrderService();
  const first = await postOrder(handler, validCheckout());
  const second = await postOrder(handler, validCheckout());
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).receiptSent, true);
  assert.equal((await second.json()).receiptSent, true);
  assert.equal(state.resendCalls, 1);
  assert.equal(state.reserveCount, 1);
  assert.equal(state.outbox.status, "SENT");
});

test("an email-provider failure then retry sends the receipt once", async () => {
  let failOnce = true;
  const { handler, state } = createTestOrderService({
    resendImpl: async () => {
      if (failOnce) {
        failOnce = false;
        return new Response("provider down", { status: 503 });
      }
      return new Response(JSON.stringify({ id: "re_retry" }), { status: 200 });
    },
  });

  const first = await postOrder(handler, validCheckout());
  assert.equal(first.status, 200);
  assert.equal((await first.json()).receiptSent, false);
  assert.equal(state.outbox.status, "ERROR");
  assert.equal(state.reserveCount, 1);

  const second = await postOrder(handler, validCheckout());
  assert.equal(second.status, 200);
  assert.equal((await second.json()).receiptSent, true);
  assert.equal(state.resendCalls, 2);
  assert.equal(state.outbox.status, "SENT");

  const third = await postOrder(handler, validCheckout());
  assert.equal((await third.json()).receiptSent, true);
  assert.equal(state.resendCalls, 2);
  assert.equal(state.reserveCount, 1);
});

test("concurrent create-order attempts cannot send two receipts or double-reserve", async () => {
  const { handler, state } = createTestOrderService();
  const [first, second] = await Promise.all([
    postOrder(handler, validCheckout({ turnstileToken: "ok-one" })),
    postOrder(handler, validCheckout({ turnstileToken: "ok-two" })),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(state.reserveCount, 1);
  assert.equal(state.resendCalls, 1);
  assert.equal(state.outbox.status, "SENT");
});

test("an invalid or missing Turnstile token does not save an order or reserve inventory", async () => {
  const { handler, state } = createTestOrderService();
  const missing = await postOrder(handler, validCheckout({ turnstileToken: "" }));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /Bot verification/);

  const invalid = await postOrder(handler, validCheckout({ turnstileToken: "bad-token" }));
  assert.equal(invalid.status, 403);
  assert.match((await invalid.json()).error, /Bot verification/);

  assert.equal(state.order, null);
  assert.equal(state.reserveCount, 0);
  assert.equal(state.resendCalls, 0);
  assert.equal(state.rpcNames.includes("create_order_transaction"), false);
});

function validCheckout(overrides = {}) {
  const request = validRequest({
    discountCodes: [],
    ...overrides,
  });
  return request;
}

function postOrder(handler, body) {
  return handler(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function createTestOrderService({ resendImpl } = {}) {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    RESEND_API_KEY: "re_test_key",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    RESEND_FROM_ADDRESS: "Tier One BioSystems <noreply@tierone.bio>",
  };
  globalThis.Netlify = {
    env: { get(name) { return env[name]; } },
  };

  const state = {
    order: null,
    reserveCount: 0,
    outbox: null,
    resendCalls: 0,
    turnstileCalls: 0,
    rpcNames: [],
  };
  let chain = Promise.resolve();
  const serialize = fn => {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
    rpc(name, args) {
      state.rpcNames.push(name);
      return serialize(() => runRpc(name, args));
    },
  };

  async function runRpc(name, args) {
    if (name === "create_order_transaction") {
      if (state.order) return { data: state.order, error: null };
      state.reserveCount += 1;
      state.order = {
        id: "11111111-1111-4111-8111-111111111111",
        ...args.order_payload,
        status: "AWAITING PAYMENT",
      };
      return { data: state.order, error: null };
    }
    if (name === "enqueue_order_receipt") {
      if (!state.outbox) {
        state.outbox = {
          id: "22222222-2222-4222-8222-222222222222",
          order_id: args.p_order_id,
          status: "PENDING",
          recipient_email: args.p_recipient_email,
          customer_name: args.p_customer_name,
          order_number: args.p_order_number,
          items_text: args.p_items_text,
          order_subtotal: args.p_order_subtotal,
          discount_code: args.p_discount_code,
          discount_amount: args.p_discount_amount,
          shipping: args.p_shipping,
          payment_method: args.p_payment_method,
          order_total: args.p_order_total,
          shipping_address: args.p_shipping_address,
          shipping_city: args.p_shipping_city,
          shipping_state: args.p_shipping_state,
          shipping_zip: args.p_shipping_zip,
          customer_phone: args.p_customer_phone,
          idempotency_key: `order-receipt/v1/${args.p_order_id}`,
          claim_token: null,
          attempt_count: 0,
        };
      }
      return { data: { ...state.outbox }, error: null };
    }
    if (name === "claim_order_receipt") {
      const row = state.outbox;
      if (!row) return { data: [], error: null };
      if (args.p_delivery_id && args.p_delivery_id !== row.id) return { data: [], error: null };
      if (row.status === "SENT") return { data: [{ ...row }], error: null };
      if (row.status === "SENDING") return { data: [], error: null };
      if (!["PENDING", "ERROR"].includes(row.status)) return { data: [], error: null };
      row.status = "SENDING";
      row.attempt_count += 1;
      row.claim_token = "claim-1";
      return { data: [{ ...row }], error: null };
    }
    if (name === "complete_order_receipt") {
      if (state.outbox?.status === "SENT") return { data: state.outbox, error: null };
      if (state.outbox?.status !== "SENDING" || state.outbox.claim_token !== args.p_claim_token) {
        return { data: null, error: new Error("delivery_claim_conflict") };
      }
      state.outbox.status = "SENT";
      state.outbox.provider_message_id = args.p_provider_message_id;
      state.outbox.claim_token = null;
      return { data: state.outbox, error: null };
    }
    if (name === "fail_order_receipt") {
      if (state.outbox?.status === "SENT") return { data: state.outbox, error: null };
      state.outbox.status = args.p_retryable === false ? "NEEDS_REVIEW" : "ERROR";
      state.outbox.claim_token = null;
      return { data: state.outbox, error: null };
    }
    return { data: null, error: new Error(`unknown rpc ${name}`) };
  }

  async function fetchImpl(url, options) {
    if (String(url).includes("siteverify")) {
      state.turnstileCalls += 1;
      const token = new URLSearchParams(String(options.body || "")).get("response") || "";
      return new Response(JSON.stringify({ success: token.startsWith("ok-") }), { status: 200 });
    }
    if (String(url).includes("api.resend.com")) {
      state.resendCalls += 1;
      if (resendImpl) return resendImpl(url, options, state);
      return new Response(JSON.stringify({ id: `re_${state.resendCalls}` }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }

  globalThis.Netlify = {
    env: { get(name) { return env[name]; } },
  };

  return {
    handler: createOrderHandler({
      createClient: () => supabase,
      fetchImpl,
    }),
    state,
  };
}
