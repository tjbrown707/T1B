import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import createOrder, {
  canUsePersonalDiscount,
  config,
  createOrderHandler,
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
    turnstileToken: "test-turnstile-token",
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
  assert.equal(result.data.turnstileToken, "test-turnstile-token");

  const zelleResult = validateOrderRequest(validRequest({ paymentMethod: "zelle" }));
  assert.equal(zelleResult.error, undefined);
  assert.equal(zelleResult.data.paymentMethod, "Zelle");
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
  assert.match(validateOrderRequest(validRequest({ paymentMethod: "wire" })).error, /Cash App, Venmo, or Zelle/);
  assert.match(validateOrderRequest(validRequest({
    customer: { ...validRequest().customer, email: "not-an-email" },
  })).error, /valid email/);
  assert.match(validateOrderRequest(validRequest({
    customer: { ...validRequest().customer, address: "x".repeat(201) },
  })).error, /too long/);
  assert.match(validateOrderRequest(validRequest({ discountCodes: ["A", "B", "C"] })).error, /Too many/);
  assert.match(validateOrderRequest(validRequest({ discountCodes: ["<script>"] })).error, /Invalid discount/);
  assert.match(validateOrderRequest(validRequest({ turnstileToken: "" })).error, /Bot verification/);
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

test("verified checkout saves once, queues the receipt, and preserves the staff alert", async () => {
  const previousNetlify = globalThis.Netlify;
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    RESEND_API_KEY: "re_test_key",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
  };
  globalThis.Netlify = { env: { get(name) { return env[name]; } } };

  const orderId = "11111111-1111-4111-8111-111111111111";
  const deliveryId = "22222222-2222-4222-8222-222222222222";
  let createCalls = 0;
  const resendRecipients = [];
  let delivery = null;
  const supabase = {
    auth: { getUser: async (token) => {
      assert.equal(token, "customer-token");
      return { data: { user: { id: "customer-1" } }, error: null };
    } },
    from() {
      throw new Error("discount lookup should not run without a code");
    },
    async rpc(name, args) {
      if (name === "create_order_transaction") {
        assert.equal(args.order_payload.user_id, "customer-1");
        createCalls += 1;
        return {
          data: { id: orderId, ...args.order_payload },
          error: null,
        };
      }
      if (name === "enqueue_order_receipt") {
        assert.equal(args.p_order_id, orderId);
        if (!delivery) {
          delivery = {
            id: deliveryId,
            order_id: orderId,
            status: "PENDING",
            recipient_email: "researcher@example.com",
            customer_name: "Research Customer",
            order_number: "T1B-260811-123456",
            items_text: "BPC-157 10mg x2",
            subtotal: "90.00",
            discount_code: "",
            discount_amount: "0.00",
            shipping: "10.00",
            payment_method: "Zelle",
            total: "100.00",
            shipping_address: "123 Lab Road",
            shipping_city: "Phoenix",
            shipping_state: "AZ",
            shipping_zip: "85001",
            customer_phone: "555-555-1212",
            idempotency_key: `order-receipt/v1/${orderId}`,
            claim_token: null,
          };
        }
        return { data: { ...delivery }, error: null };
      }
      if (name === "claim_order_receipt") {
        delivery.status = "SENDING";
        delivery.claim_token = "claim-1";
        return { data: [{ ...delivery }], error: null };
      }
      if (name === "complete_order_receipt") {
        delivery.status = "SENT";
        delivery.provider_message_id = args.p_provider_message_id;
        return { data: { ...delivery }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const handler = createOrderHandler({
    createClient: () => supabase,
    fetchImpl: async (url, options) => {
      if (String(url).includes("siteverify")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      const message = JSON.parse(options.body);
      resendRecipients.push(message.to[0]);
      return new Response(JSON.stringify({ id: `re_${resendRecipients.length}` }), { status: 200 });
    },
  });

  try {
    const response = await handler(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://www.tierone.bio", Authorization: "Bearer customer-token" },
      body: JSON.stringify(validRequest({ paymentMethod: "zelle", discountCodes: [] })),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.receiptSent, true);
    assert.equal(payload.staffNotificationSent, true);
    assert.equal(createCalls, 1);
    assert.equal(delivery.status, "SENT");
    assert.deepEqual(resendRecipients.sort(), ["researcher@example.com", "sales@tierone.bio"]);
  } finally {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

test("checkout rejects absent, invalid, expired, and anonymous sessions without creating orders or sending email", async () => {
  const previousNetlify = globalThis.Netlify;
  globalThis.Netlify = { env: { get: name => ({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    TURNSTILE_SECRET_KEY: "test-only",
  })[name] } };
  try {
    for (const scenario of ["absent", "invalid", "expired", "anonymous", "unavailable"]) {
      let authCalls = 0;
      const handler = createOrderHandler({
        createClient: () => ({
          auth: { getUser: async () => {
            authCalls++;
            if (scenario === "unavailable") throw new Error("offline");
            if (scenario === "anonymous") return { data: { user: { id: "anon-1", is_anonymous: true } } };
            return { data: { user: null }, error: { message: scenario } };
          } },
          rpc: () => { throw new Error("Unauthenticated order reached the database"); },
          from: () => { throw new Error("Unauthenticated order reached the database"); },
        }),
        fetchImpl: async url => {
          assert.ok(String(url).includes("siteverify"), "Unauthenticated checkout must never send mail");
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        },
      });
      const response = await handler(new Request("https://www.tierone.bio/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(scenario === "absent" ? {} : { Authorization: `Bearer ${scenario}` }) },
        body: JSON.stringify(validRequest({ discountCodes: [] })),
      }));
      assert.equal(response.status, scenario === "unavailable" ? 503 : 401, scenario);
      assert.equal(authCalls, scenario === "absent" ? 0 : 1);
    }
  } finally {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

test("checkout notifications and receipts use the server-confirmed order", () => {
  const source = readFileSync("site_1.jsx", "utf8");
  const index = readFileSync("index.html", "utf8");
  const emailTemplate = readFileSync("email-template.html", "utf8");
  const server = readFileSync("netlify/functions/create-order.js", "utf8");
  const paymentHandler = source.slice(
    source.indexOf("async function handlePlaceOrderAndPay"),
    source.indexOf("const inputStyle", source.indexOf("async function handlePlaceOrderAndPay")),
  );
  assert.doesNotMatch(source, /redeem-discount/);
  assert.doesNotMatch(source, /@emailjs\/browser|emailjs\.send|service_r3r7crs|template_i9k8u2a|E2QQt/);
  assert.doesNotMatch(paymentHandler, /form-name.*order|application\/x-www-form-urlencoded/);
  assert.doesNotMatch(index, /<form name="order"/);
  assert.match(server, /deliverOrderReceipt\(/);
  assert.match(server, /sendStaffOrderCreatedEmail\(saved/);
  assert.match(paymentHandler, /setReceiptSent\(confirmed\.receiptSent === true\)/);
  assert.match(source, /Your order is saved first\./);
  assert.doesNotMatch(source, /I HAVE SENT PAYMENT|PENDING_PAYMENT/);
  assert.match(source, /src="\/zelle-tier-one-bio-qr\.jpg"/);
  assert.match(source, /if \(paymentMethod === "zelle"\) return/);
  assert.equal(existsSync("public/zelle-tier-one-bio-qr.jpg"), true);
  assert.match(emailTemplate, /TierOneBio \/ TIER ONE BIO LLC<\/strong> \(Zelle\)/);
  assert.match(emailTemplate, /sent server-side.*Resend/s);
  assert.ok(
    paymentHandler.indexOf('fetch("/.netlify/functions/create-order"')
      < paymentHandler.indexOf("window.location.assign(paymentUrl)"),
    "the durable order must be created before checkout leaves for the payment app",
  );
  assert.match(source, /name="researchUseAcknowledgment"/);
});

test("order references fail closed when secure randomness is unavailable", () => {
  const source = readFileSync("site_1.jsx", "utf8");
  const generator = source.slice(
    source.indexOf("function generateOrderNumber"),
    source.indexOf("function handleCheckout", source.indexOf("function generateOrderNumber")),
  );
  assert.match(generator, /globalThis\.crypto\?\.getRandomValues/);
  assert.match(generator, /throw new Error\("Secure random-number generation is unavailable\."\)/);
  assert.doesNotMatch(generator, /Math\.random/);
});

test("the schema keeps order creation server-only and redemption transactional", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const migration = readFileSync("supabase/migrations/20260811120000_inventory_fulfillment_foundation.sql", "utf8");
  const receiptOutbox = readFileSync(
    "supabase/migrations/20260825183632_add_order_receipt_outbox.sql",
    "utf8",
  );
  assert.match(migration, /alter column status set default 'AWAITING PAYMENT'/);
  assert.doesNotMatch(schema, /create policy "Users can insert their own orders"/);
  assert.match(migration, /create_order_transaction/);
  assert.match(migration, /grant execute on function public\.create_order_transaction\(jsonb, text\) to service_role/);
  assert.match(receiptOutbox, /create table public\.order_receipt_outbox/);
  assert.match(receiptOutbox, /from public\.orders/);
  assert.match(receiptOutbox, /on conflict \(order_id\) do nothing/);
  assert.match(receiptOutbox, /for update skip locked/);
  assert.match(receiptOutbox, /revoke all on table public\.order_receipt_outbox from public, anon, authenticated/);
});

test("profile writes are column-scoped and only new orders receive an auto-release deadline", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const profileMigration = readFileSync(
    "supabase/migrations/20260825151157_restrict_profile_updates.sql",
    "utf8",
  );
  const expiryMigration = readFileSync(
    "supabase/migrations/20260825151207_add_unpaid_reservation_expiry.sql",
    "utf8",
  );
  const allowedColumns = /grant update \(full_name, phone, address, city, state, zip\)/i;
  assert.match(schema, allowedColumns);
  assert.match(profileMigration, allowedColumns);
  assert.doesNotMatch(schema, /grant select, insert, update on table public\.profiles/i);
  assert.ok(
    expiryMigration.indexOf("add column if not exists reservation_expires_at")
      < expiryMigration.indexOf("set default (now() + interval '24 hours')"),
    "the default must be added after the nullable column so legacy orders stay exempt",
  );
  assert.match(expiryMigration, /where payment_status = 'AWAITING_PAYMENT'/);
});
