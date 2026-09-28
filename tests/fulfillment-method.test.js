import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfillmentMethodChangeBlock } from '../src/data/order-management.js';
import { workflowRpc, workflowError } from '../netlify/functions/admin-orders.js';

const order = { status: 'PROCESSING', payment_status: 'PAID', fulfillment_status: 'PACKED', fulfillment_method: 'SHIP' };
test('delivery method can change before payment, on backorder, and during picking or packing', () => {
  for (const fulfillment_status of ['ON_HOLD', 'READY_TO_PICK', 'PICKED', 'PACKED']) {
    assert.equal(fulfillmentMethodChangeBlock({ ...order, fulfillment_status }), '');
  }
  assert.equal(fulfillmentMethodChangeBlock({ ...order, payment_status: 'AWAITING_PAYMENT', fulfillment_status: 'ON_HOLD' }), '');
  assert.equal(fulfillmentMethodChangeBlock({ ...order, shipment: { status: 'DRAFT' }, trackingEmail: { status: 'SENT' } }), '');
});
test('completed orders, postage purchases and in-flight email sends block a switch', () => {
  for (const fulfillment_status of ['SHIPPED', 'DELIVERED', 'LABEL_CREATED', 'CANCELLED']) {
    assert.ok(fulfillmentMethodChangeBlock({ ...order, fulfillment_status }));
  }
  for (const status of ['PURCHASING', 'LABEL_PURCHASED', 'IN_TRANSIT', 'DELIVERED']) {
    assert.ok(fulfillmentMethodChangeBlock({ ...order, shipment: { status } }));
  }
  assert.ok(fulfillmentMethodChangeBlock({ ...order, shipment: { status: 'ERROR', label_url: 'https://example.com/label' } }));
  assert.ok(fulfillmentMethodChangeBlock({ ...order, trackingEmail: { status: 'SENDING' } }));
});
test('method changes require explicit old and new methods and expected statuses', () => {
  const input = { orderId: 'id', actorUserId: 'actor', expectedPaymentStatus: 'PAID', expectedFulfillmentStatus: 'PACKED', expectedFulfillmentMethod: 'SHIP', fulfillmentMethod: 'LOCAL_HANDOFF' };
  assert.deepEqual(workflowRpc('update_fulfillment_method', input), { name: 'update_order_fulfillment_method', args: {
    p_order_id: 'id', p_actor_user_id: 'actor', p_expected_payment_status: 'PAID', p_expected_fulfillment_status: 'PACKED', p_expected_fulfillment_method: 'SHIP', p_fulfillment_method: 'LOCAL_HANDOFF',
  } });
  for (const key of ['expectedPaymentStatus', 'expectedFulfillmentStatus', 'expectedFulfillmentMethod', 'fulfillmentMethod']) {
    assert.equal(workflowRpc('update_fulfillment_method', { ...input, [key]: undefined }), null);
    assert.equal(workflowRpc('update_fulfillment_method', { ...input, [key]: 'INVALID' }), null);
  }
});
test('workflow conflicts give actionable errors', async () => {
  for (const message of ['fulfillment_method_shipment_locked', 'fulfillment_method_email_sending', 'fulfillment_method_order_locked', 'order_fulfillment_status_conflict']) {
    const response = workflowError({ message }, 'update_fulfillment_method');
    assert.equal(response.status, 409);
    assert.ok((await response.json()).error);
  }
});
