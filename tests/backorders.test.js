import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatedBackorderDate, formatShipDate } from '../src/data/backorders.js';
import { availabilityHandler } from '../netlify/functions/product-availability.js';
import { workflowRpc, workflowError } from '../netlify/functions/admin-orders.js';

const fixedNow = () => new Date('2026-09-19T05:00:00Z'); // Still Sep 18 in Arizona.
test('backorder estimates use 14 calendar days in Arizona across month/year/leap boundaries', () => {
  assert.equal(estimatedBackorderDate(fixedNow()), '2026-10-02');
  assert.equal(estimatedBackorderDate(new Date('2026-12-25T19:00:00Z')), '2027-01-08');
  assert.equal(estimatedBackorderDate(new Date('2028-02-20T19:00:00Z')), '2028-03-05');
  assert.equal(formatShipDate('2026-10-02'), 'October 2, 2026');
});

function fixture({ user = { id: 'customer' }, error = null, throws = false } = {}) {
  let queries = 0;
  const handler = availabilityHandler({
    env: () => 'configured', now: fixedNow,
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      rpc: async name => {
        queries++;
        assert.equal(name, 'storefront_availability');
        if (throws) throw new Error('network');
        return { data: [{ product_id: 'bpc157-5', available: 0, secret: 'private' }, { product_id: 'bpc157-10', available: 3 }], error };
      },
    }),
  });
  return { handler, queries: () => queries };
}
const request = (token = 'valid') => new Request('https://www.tierone.bio/.netlify/functions/product-availability', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
test('availability requires a verified non-anonymous account before querying inventory', async () => {
  for (const user of [null, { id: 'anon', is_anonymous: true }]) {
    const f = fixture({ user });
    assert.equal((await f.handler(request())).status, 401);
    assert.equal(f.queries(), 0);
  }
  const f = fixture();
  assert.equal((await f.handler(request(''))).status, 401);
  assert.equal(f.queries(), 0);
});
test('availability returns only catalog quantities and estimated backorder dates without caching', async () => {
  const response = await fixture().handler(request());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { products: [
    { id: 'bpc157-5', available: 0, estimatedShipDate: '2026-10-02' },
    { id: 'bpc157-10', available: 3, estimatedShipDate: null },
  ] });
});
test('inventory failures never become false sold-out responses', async () => {
  for (const options of [{ error: { message: 'offline' } }, { throws: true }]) {
    const response = await fixture(options).handler(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).products, undefined);
  }
});
test('only paid orders expose the allocation workflow', async () => {
  const input = { orderId: 'order', actorUserId: 'staff', expectedPaymentStatus: 'PAID' };
  assert.deepEqual(workflowRpc('allocate_backorder', input), { name: 'allocate_backorder', args: { p_order_id: 'order', p_actor_user_id: 'staff' } });
  assert.equal(workflowRpc('allocate_backorder', { ...input, expectedPaymentStatus: 'AWAITING_PAYMENT' }), null);
  const response = workflowError({ message: 'insufficient_inventory:bpc157-5' }, 'allocate_backorder');
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /still waiting for stock/);
});
