import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/catalog.js';
import { dealerQuote, dealerSummary, readDealerPending } from '../src/data/dealers.js';
import { lineUnitPrice } from '../src/data/order-totals.js';
import { priceDealerOrder } from '../netlify/functions/_shared/dealer-order.js';
import { createDealersHandler } from '../netlify/functions/dealers.js';
import { createOrderHandler, ordersMatch, validateOrderRequest } from '../netlify/functions/create-order.js';

const userId = '11111111-1111-4111-8111-111111111111';
const user = { id: userId, email: 'dealer@example.com', email_confirmed_at: '2026-01-01', app_metadata: {} };
const items = [{ id: PRODUCTS[0].id, qty: 1, price: 0.01 }];
const input = { items, orderNumber: 'T1B-261001-123456', discountCodes: [], dealerDelivery: 'LOCAL_HANDOFF', customerReference: 'Customer A', quotedDealerTotal: dealerQuote(items, 60).dealerTotal, quotedCustomerTotal: dealerQuote(items, 60).customerTotal };

test('60% dealer pricing resolves catalog prices, rounds vials, and reconciles totals for every product and tier', () => {
  for (const product of PRODUCTS) for (const qty of [1, 4, 5, 9, 10, 24, 25, 99]) {
    const quote = dealerQuote([{ id: product.id, qty, price: 0.01, bulk: 0 }], 60);
    const expectedUnit = Math.round(lineUnitPrice({ id: product.id, qty }) * 100 * 0.4) / 100;
    assert.equal(quote.dealerItems[0].unitPrice, expectedUnit);
    assert.equal(quote.dealerSubtotal, Math.round(expectedUnit * qty * 100) / 100);
    assert.equal(quote.shipping, 0);
    assert.equal(Math.round(quote.customerTotal * 100), Math.round((quote.dealerTotal + quote.retained) * 100));
  }
});

test('shipping passes through equally and the free-shipping threshold uses the dealer merchandise total', () => {
  const small = dealerQuote(items, 60, 'SHIP_TO_CUSTOMER');
  assert.equal(small.shipping, 10);
  assert.equal(small.retained, dealerQuote(items, 60).retained);
  const large = dealerQuote([{ id: PRODUCTS[0].id, qty: 99 }], 60, 'SHIP_TO_DEALER');
  assert.ok(large.dealerSubtotal >= 200);
  assert.equal(large.shipping, 0);
  for (const rate of [0, 100, -1, NaN, Infinity]) assert.throws(() => dealerQuote(items, rate));
});

test('codes adjust the customer basket before the dealer retains their share, with exact cent reconciliation', () => {
  for (const product of PRODUCTS) for (const qty of [1, 5, 99]) for (const rate of [60, 33.33, 99.99]) {
    for (const discount of [{ type: 'percent', value: 10 }, { type: 'fixed', value: 5 }, { type: 'fixed', value: 100000 }, { type: 'percent', value: 100 }]) {
      const quote = dealerQuote([{ id: product.id, qty }], rate, 'LOCAL_HANDOFF', { discount });
      const before = Math.round(lineUnitPrice({ id: product.id, qty }) * qty * 100);
      const reduction = Math.round(Math.min(before, discount.type === 'percent' ? before * discount.value / 100 : discount.value * 100));
      assert.equal(Math.round(quote.customerTotal * 100), before - reduction);
      assert.equal(Math.round(quote.retained * 100), Math.round((before - reduction) * rate / 100));
      assert.equal(Math.round((quote.dealerTotal + quote.retained) * 100), before - reduction);
      assert.ok(quote.dealerDiscountAmount >= 0);
      assert.equal(Math.round(quote.dealerItems.reduce((sum, line) => sum + line.lineTotal, 0) * 100), Math.round(quote.dealerSubtotal * 100));
      assert.equal(Math.round((quote.dealerSubtotal - quote.dealerDiscountAmount) * 100), Math.round(quote.dealerTotal * 100));
    }
  }
  const mixed = dealerQuote([{ id: PRODUCTS[0].id, qty: 5 }, { id: PRODUCTS[1].id, qty: 3 }], 60, 'SHIP_TO_CUSTOMER', { discount: { type: 'fixed', value: 50 } });
  assert.equal(mixed.retained, Math.round(mixed.customerSubtotalAfterDiscount * 60) / 100);
  assert.equal(mixed.shipping, 10);
  assert.equal(Math.round((mixed.customerTotal - mixed.dealerTotal) * 100), Math.round(mixed.retained * 100));
  const free = dealerQuote(items, 60, 'SHIP_TO_CUSTOMER', { discount: { type: 'percent', value: 10 }, freeShipping: true });
  assert.equal(free.shipping, 0);
  const above = dealerQuote([{ id: PRODUCTS[0].id, qty: 10 }], 60, 'SHIP_TO_DEALER');
  const below = dealerQuote([{ id: PRODUCTS[0].id, qty: 10 }], 60, 'SHIP_TO_DEALER', { discount: { type: 'percent', value: 10 } });
  // A code can move the discounted dealer merchandise below free shipping.
  assert.equal(above.shipping, above.dealerSubtotal >= 200 ? 0 : 10);
  assert.equal(below.shipping, below.dealerSubtotalAfterDiscount >= 200 ? 0 : 10);
  for (const discount of [{ type: 'percent', value: 101 }, { type: 'fixed', value: -1 }, { type: 'percent', value: NaN }]) assert.throws(() => dealerQuote(items, 60, 'LOCAL_HANDOFF', { discount }));
});

test('balances exclude cancelled/refunded orders and account for payment corrections without claiming customer payment was verified', () => {
  const dealer_sale = dealerQuote(items, 60);
  const total = dealer_sale.dealerTotal;
  const summary = dealerSummary([
    { dealer_sale, total, payment_status: 'AWAITING_PAYMENT' },
    { dealer_sale, total, payment_status: 'PAID', payment_amount_received: total - 1 },
    { dealer_sale, total, payment_status: 'CANCELLED' },
    { dealer_sale, total, payment_status: 'REFUNDED' },
    { total, payment_status: 'PAID' },
  ]);
  assert.equal(summary.orders, 2);
  assert.equal(summary.owed, total + 1);
  assert.equal(summary.paid, total - 1);
  assert.equal(summary.retained, dealer_sale.retained);
});

function pricingDb(account = { active: true, percent_off: 60, display_name: 'David' }, saved = null) {
  return { from(table) { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: table === 'orders' ? saved : account }; } }; } };
}

test('dealer orders require an active server-managed account and current quote; customer supplied rates do not affect prices', async () => {
  const quote = await priceDealerOrder(pricingDb(), { ...input, percentOff: 99 }, user);
  assert.equal(quote.percentOff, 60);
  assert.equal(quote.dealerId, userId);
  await assert.rejects(priceDealerOrder(pricingDb(null), input, user), /active dealer/);
  await assert.rejects(priceDealerOrder(pricingDb({ active: false }), input, user), /active dealer/);
  await assert.rejects(priceDealerOrder(pricingDb(), { ...input, quotedDealerTotal: 0 }, user), /Pricing changed/);
  await assert.rejects(priceDealerOrder(pricingDb(), { ...input, discountCodes: ['WELCOME10'] }, user), /verified/);
});

test('lost-response retries preserve original dealer economics and reject different owners, items, customers or deliveries', async () => {
  const sale = await priceDealerOrder(pricingDb(), input, user);
  const saved = { user_id: userId, items: sale.dealerItems, dealer_sale: sale };
  assert.deepEqual(await priceDealerOrder(pricingDb(null, saved), input, user), sale);
  for (const change of [{ customerReference: 'Other' }, { dealerDelivery: 'SHIP_TO_CUSTOMER' }, { items: [{ id: PRODUCTS[0].id, qty: 2 }] }, { discountCodes: ['OTHER'] }]) {
    await assert.rejects(priceDealerOrder(pricingDb(null, saved), { ...input, ...change }, user), /already in use/);
  }
  await assert.rejects(priceDealerOrder(pricingDb(null, saved), input, { ...user, id: 'another-user' }), /already in use/);
  assert.equal(ordersMatch({ ...saved, dealer_sale: { ...sale, retained: 999 } }, saved), false);
});

test('dealer endpoints reject forged metadata and cross-account access without exposing other orders', async () => {
  const before = globalThis.Netlify;
  globalThis.Netlify = { env: { get: () => 'server-config' } };
  const filters = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { ...user, user_metadata: { role: 'admin' } } } }) },
    from(table) { return { select() { return this; }, eq(key, value) { filters.push([table, key, value]); return this; }, async maybeSingle() { return { data: null }; } }; },
  };
  const handler = createDealersHandler({ createClient: () => db });
  const request = (suffix, options = {}) => new Request(`https://www.tierone.bio/.netlify/functions/dealers${suffix}`, { headers: { Authorization: 'Bearer test' }, ...options });
  try {
    assert.equal((await handler(request('?staff=1'))).status, 403);
    assert.equal((await handler(request('', { method: 'PUT', body: '{}' }))).status, 403);
    const result = await handler(request('?dealerId=22222222-2222-4222-8222-222222222222'));
    assert.equal(result.status, 200);
    assert.deepEqual(filters, [['dealer_accounts', 'user_id', userId]]);
    assert.equal((await handler(request('', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer test' } }))).status, 403);
    assert.equal((await handler(request('', { headers: {} }))).status, 401);
  } finally { globalThis.Netlify = before; }
});

test('staff can set dealer terms only for a confirmed existing account and writes an audit through the protected RPC', async () => {
  const before = globalThis.Netlify;
  globalThis.Netlify = { env: { get: () => 'server-config' } };
  let writes = 0;
  let confirmed = true;
  const db = {
    auth: { getUser: async () => ({ data: { user: { ...user, app_metadata: { role: 'admin' } } } }), admin: { getUserById: async id => ({ data: { user: { id, email: user.email, email_confirmed_at: confirmed ? '2026-01-01' : null } } }) } },
    rpc: async (name, args) => { writes++; assert.equal(name, 'save_dealer_account'); assert.equal(args.p_actor, user.id); assert.equal(args.p_percent_off, 60); return { data: { user_id: args.p_user_id, percent_off: 60, active: true } }; },
  };
  const handler = createDealersHandler({ createClient: () => db });
  const body = { userId, name: 'David', percentOff: 60, active: true };
  const request = value => new Request('https://www.tierone.bio/.netlify/functions/dealers', { method: 'PUT', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(value) });
  try {
    assert.equal((await handler(request(body))).status, 200);
    for (const change of [{ percentOff: 100 }, { percentOff: 0 }, { percentOff: '60' }, { percentOff: 60.005 }, { active: 'true' }, { name: '' }]) assert.equal((await handler(request({ ...body, ...change }))).status, 400);
    confirmed = false;
    assert.equal((await handler(request(body))).status, 400);
    assert.equal(writes, 1);
  } finally { globalThis.Netlify = before; }
});

test('dealer request validation requires delivery, customer reference and quoted totals', () => {
  const body = { ...input, dealerOrder: true, researchAcknowledged: true, paymentMethod: 'zelle', turnstileToken: 'test', customer: { name: 'David', email: user.email, phone: '555-555-5555', address: 'Local pickup', city: 'Phoenix', state: 'AZ', zip: 'N/A' } };
  assert.equal(validateOrderRequest(body).error, undefined);
  for (const change of [{ dealerDelivery: 'INVALID' }, { customerReference: '' }, { quotedDealerTotal: '40' }, { quotedCustomerTotal: Infinity }]) assert.ok(validateOrderRequest({ ...body, ...change }).error);
});

test('refresh recovery rejects malformed storage and retains a valid immutable submission', () => {
  const customer = { name: 'David', email: user.email, phone: '555', address: 'Local pickup', city: 'Phoenix', state: 'AZ', zip: 'N/A' };
  const payload = { ...input, customer, dealerOrder: true, paymentMethod: 'zelle' };
  const storage = value => ({ getItem: key => { assert.equal(key, `t1b-dealer-pending-${userId}`); return value; } });
  assert.deepEqual(readDealerPending(storage(JSON.stringify(payload)), userId), payload);
  for (const value of ['broken-json', '{}', '[]', JSON.stringify({ ...payload, items: [null] }), JSON.stringify({ ...payload, customer: null }), JSON.stringify({ ...payload, quotedDealerTotal: 'free' }), JSON.stringify({ ...payload, discountCodes: 'WELCOME10' }), JSON.stringify({ ...payload, discountCodes: ['<script>'] })]) assert.equal(readDealerPending(storage(value), userId), null);
  assert.equal(readDealerPending({ getItem: () => { throw new Error('blocked storage'); } }, userId), null);
});

test('real dealer checkout uses the verified payer email, saves only dealer-priced totals, and replays without new pricing or printing', async t => {
  const before = globalThis.Netlify;
  globalThis.Netlify = { env: { get: name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only', TURNSTILE_SECRET_KEY: 'test-only', PRINTNODE_API_KEY: 'test-key', PRINTNODE_FULFILLMENT_PRINTER_ID: '42' })[name] } };
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('dealer checkout must never contact PrintNode'); });
  let saved = null;
  const db = pricingDb();
  db.from = table => pricingDb({ active: true, percent_off: saved ? 30 : 60, display_name: 'David' }, saved).from(table);
  db.auth = { getUser: async () => ({ data: { user } }) };
  db.rpc = async (name, args) => {
    if (name === 'create_order_transaction') { saved ||= { id: 'order-id', ...args.order_payload }; return { data: saved }; }
    if (name === 'enqueue_order_receipt') return { data: { status: 'SENT' } };
    throw new Error(`Unexpected RPC ${name}`);
  };
  const handler = createOrderHandler({ createClient: () => db, fetchImpl: async url => { assert.ok(String(url).includes("siteverify") || String(url).includes("api.resend.com/emails")); return new Response(JSON.stringify({ success: true })); } });
  const body = { ...input, dealerOrder: true, researchAcknowledged: true, paymentMethod: 'zelle', turnstileToken: 'test', customer: { name: 'David', email: 'downstream-customer@example.com', phone: '555-555-5555', address: 'Local pickup', city: 'Phoenix', state: 'AZ', zip: 'N/A' }, dealerTotal: 0.01, percentOff: 99 };
  const request = () => new Request('https://www.tierone.bio/.netlify/functions/create-order', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) });
  try {
    const first = await handler(request());
    assert.equal(first.status, 200);
    assert.equal(saved.customer_email, user.email);
    assert.equal(saved.total, input.quotedDealerTotal);
    assert.equal(saved.shipping, 0);
    assert.equal(saved.discount_amount, 0);
    assert.equal(saved.dealer_sale.percentOff, 60);
    const second = await handler(request());
    assert.equal(second.status, 200);
    assert.equal((await second.json()).dealerSale.percentOff, 60);
    saved.payment_status = 'PAID';
    const paid = await handler(request());
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).paymentStatus, 'PAID');
    for (const status of ['CANCELLED', 'REFUNDED']) {
      saved.payment_status = status;
      const cancelled = await handler(request());
      assert.equal(cancelled.status, 409);
      assert.match((await cancelled.json()).error, /cancelled or refunded/);
    }
  } finally { globalThis.Netlify = before; }
});

test('dealer checkout validates codes server-side, snapshots the adjusted split, and recovers without revalidating changed codes', async t => {
  const before = globalThis.Netlify;
  let codes = { SAVE10: { type: 'percent', value: 10 }, FIX5: { type: 'fixed', value: 5 }, SHIP4FREE: { type: 'percent', value: 100 } };
  let saved = null;
  let personal = null;
  let writes = 0;
  let personalLookups = 0;
  const redemptions = [];
  globalThis.Netlify = { env: { get: name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only', TURNSTILE_SECRET_KEY: 'test-only', DISCOUNT_CODES: JSON.stringify(codes) })[name] } };
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() {
          if (table === 'discount_codes') { personalLookups++; return { data: personal }; }
          return { data: table === 'orders' ? saved : { active: true, percent_off: saved ? 30 : 60, display_name: 'David' } };
        },
      };
    },
    async rpc(name, args) {
      if (name === 'create_order_transaction') {
        writes++;
        if (!saved) { saved = { id: 'order-id', ...args.order_payload }; redemptions.push(args.personal_discount_code); }
        return { data: saved };
      }
      if (name === 'enqueue_order_receipt') return { data: { status: 'SENT' } };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const handler = createOrderHandler({ createClient: () => db, fetchImpl: async () => new Response(JSON.stringify({ success: true })) });
  const submit = (discountCodes, discount, extra = {}) => {
    const quote = dealerQuote(items, 60, 'SHIP_TO_CUSTOMER', { discount, freeShipping: discountCodes.includes('SHIP4FREE') });
    const body = { ...input, dealerOrder: true, dealerDelivery: 'SHIP_TO_CUSTOMER', discountCodes, quotedDealerTotal: quote.dealerTotal, quotedCustomerTotal: quote.customerTotal, researchAcknowledged: true, paymentMethod: 'zelle', turnstileToken: 'test', customer: { name: 'Customer', email: 'customer@example.com', phone: '555', address: '123 Test St', city: 'Phoenix', state: 'AZ', zip: '85001' }, percentOff: 99, discount: { type: 'percent', value: 100 }, ...extra };
    return handler(new Request('https://www.tierone.bio/.netlify/functions/create-order', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) }));
  };
  try {
    await t.test('percent plus free shipping updates both parties and freezes the original code on replay', async () => {
      const discount = { type: 'percent', value: 10 };
      const quote = dealerQuote(items, 60, 'SHIP_TO_CUSTOMER', { discount, freeShipping: true });
      const response = await submit(['SAVE10', 'SHIP4FREE'], discount);
      assert.equal(response.status, 200);
      assert.equal(saved.dealer_sale.customerTotal, quote.customerTotal);
      assert.equal(saved.dealer_sale.retained, quote.retained);
      assert.equal(saved.total, quote.dealerTotal);
      assert.equal(saved.discount_amount, quote.dealerDiscountAmount);
      assert.equal(saved.discount_code, 'SAVE10, SHIP4FREE');
      assert.equal(saved.customer_email, user.email);
      assert.equal(saved.shipping, 0);
      assert.deepEqual(redemptions, [null]);
      const original = structuredClone(saved);
      codes = {};
      assert.equal((await submit(['SAVE10', 'SHIP4FREE'], discount)).status, 200);
      assert.deepEqual(saved, original);
      assert.equal((await submit(['FIX5'], discount)).status, 409);
    });
    await t.test('fixed codes, invalid codes, conflicting codes and forged quotes', async () => {
      saved = null; codes = { FIX5: { type: 'fixed', value: 5 }, SAVE10: { type: 'percent', value: 10 } };
      const beforeWrites = writes;
      assert.equal((await submit(['UNKNOWN'], null)).status, 400);
      assert.equal((await submit(['FIX5', 'SAVE10'], { type: 'fixed', value: 5 })).status, 400);
      assert.equal((await submit(['SAVE10'], { type: 'percent', value: 10 }, { quotedDealerTotal: 0.01 })).status, 409);
      assert.equal(writes, beforeWrites);
      assert.equal((await submit(['FIX5'], { type: 'fixed', value: 5 })).status, 200);
      assert.equal(saved.dealer_sale.customerDiscountAmount, 5);
      assert.equal(saved.dealer_sale.retained, Math.round(saved.dealer_sale.customerSubtotalAfterDiscount * 60) / 100);
    });
    await t.test('personal codes are bound to the dealer, forwarded for atomic redemption and skipped on replay', async () => {
      saved = null; codes = {};
      personal = { type: 'percent', value: 10, expires_at: '2000-01-01' };
      assert.equal((await submit(['WELCOME'], { type: 'percent', value: 10 })).status, 400);
      personal = { type: 'percent', value: 10, expires_at: '2099-01-01' };
      assert.equal((await submit(['WELCOME'], { type: 'percent', value: 10 })).status, 200);
      assert.equal(redemptions.at(-1), 'WELCOME');
      assert.equal(saved.dealer_sale.personalDiscountCode, 'WELCOME');
      personal = null;
      const lookups = personalLookups;
      assert.equal((await submit(['WELCOME'], { type: 'percent', value: 10 })).status, 200);
      assert.equal(personalLookups, lookups);
    });
  } finally { globalThis.Netlify = before; }
});
