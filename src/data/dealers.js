import { orderLineItems, orderTotals } from './order-totals.js';
import { PRODUCTS } from './catalog.js';
import { MAX_CART_QUANTITY } from './cart.js';

const cents = value => Math.round(Number(value) * 100);
export const money = value => `$${Number(value || 0).toFixed(2)}`;

export function readDealerPending(storage, userId) {
  try {
    const value = JSON.parse(storage.getItem(`t1b-dealer-pending-${userId}`) || 'null');
    if (!value || typeof value !== 'object' || value.dealerOrder !== true
        || !/^T1B-\d{6}-\d{6}$/.test(value.orderNumber)
        || !['LOCAL_HANDOFF', 'SHIP_TO_DEALER', 'SHIP_TO_CUSTOMER'].includes(value.dealerDelivery)
        || typeof value.customerReference !== 'string' || !value.customerReference.trim() || value.customerReference.length > 120
        || !['cashapp', 'venmo', 'zelle'].includes(value.paymentMethod)
        || !Array.isArray(value.items) || !value.items.length || value.items.length > PRODUCTS.length
        || value.items.some(item => !PRODUCTS.some(product => product.id === item?.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_CART_QUANTITY)
        || new Set(value.items.map(item => item.id)).size !== value.items.length
        || !['quotedDealerTotal','quotedCustomerTotal'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)
        || !['name','email','phone','address','city','state','zip'].every(key => typeof value.customer?.[key] === 'string' && value.customer[key].length > 0 && value.customer[key].length <= 254)) return null;
    return value;
  } catch { return null; }
}

// Dealer discount applies to the same quantity/sale price as normal checkout.
// Round each vial once; the customer/dealer difference always reconciles.
export function dealerQuote(items, percentOff, delivery = 'LOCAL_HANDOFF') {
  const rate = Number(percentOff);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 100) throw new Error('Dealer discount must be greater than 0 and less than 100.');
  const retailItems = orderLineItems(items);
  const dealerItems = retailItems.map(line => {
    const unitPrice = Math.round(cents(line.unitPrice) * (100 - rate) / 100) / 100;
    return { ...line, unitPrice, lineTotal: cents(unitPrice) * line.qty / 100 };
  });
  const retailSubtotal = retailItems.reduce((sum, line) => sum + cents(line.lineTotal), 0) / 100;
  const dealerSubtotal = dealerItems.reduce((sum, line) => sum + cents(line.lineTotal), 0) / 100;
  const { shipping } = orderTotals(items, { discount: { type: 'fixed', value: (cents(retailSubtotal) - cents(dealerSubtotal)) / 100 }, freeShipping: delivery === 'LOCAL_HANDOFF' });
  return {
    percentOff: rate, retailItems, dealerItems, retailSubtotal, dealerSubtotal, shipping,
    customerTotal: (cents(retailSubtotal) + cents(shipping)) / 100,
    dealerTotal: (cents(dealerSubtotal) + cents(shipping)) / 100,
    retained: (cents(retailSubtotal) - cents(dealerSubtotal)) / 100,
  };
}

export function dealerSummary(orders) {
  const totals = { orders: 0, customerSales: 0, retained: 0, owed: 0, paid: 0 };
  for (const order of orders || []) {
    if (!order.dealer_sale || ['CANCELLED', 'REFUNDED'].includes(order.payment_status)) continue;
    totals.orders++;
    totals.customerSales += cents(order.dealer_sale.customerTotal);
    // Planned retention becomes earned only after the dealer payment is verified.
    if (order.payment_status === 'PAID') {
      totals.retained += cents(order.dealer_sale.retained);
      totals.paid += cents(order.payment_amount_received ?? order.total);
      totals.owed += Math.max(0, cents(order.total) - cents(order.payment_amount_received ?? order.total));
    } else totals.owed += cents(order.total);
  }
  for (const key of ['customerSales', 'retained', 'owed', 'paid']) totals[key] /= 100;
  return totals;
}
