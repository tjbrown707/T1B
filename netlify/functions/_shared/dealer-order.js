import { dealerQuote } from '../../../src/data/dealers.js';

export async function priceDealerOrder(supabase, input, user, resolveDiscounts = async () => {
  if (input.discountCodes.length) throw new Error('Discount codes must be verified before dealer pricing.');
  return {};
}) {
  // Recover the original price after a lost response, even if the dealer's
  // rate, catalog, or access changed. ordersMatch still checks ownership,
  // delivery, customer reference, items, and contact data before side effects.
  const previous = await supabase.from('orders').select('*').eq('order_number', input.orderNumber).maybeSingle();
  if (previous.error) throw new Error('Dealer order history could not be verified. Try again.');
  if (previous.data) {
    const saved = previous.data;
    if (saved.user_id !== user.id || !saved.dealer_sale) throw new Error('That order reference is already in use. Start a new order.');
    const requestedItems = input.items.map(item => `${item.id}:${item.qty}`).sort().join(',');
    const savedItems = saved.items.map(item => `${item.id}:${item.qty}`).sort().join(',');
    if (requestedItems !== savedItems || saved.dealer_sale.delivery !== input.dealerDelivery || saved.dealer_sale.customerReference !== input.customerReference
        || (saved.discount_code || '') !== input.discountCodes.join(', ')) throw new Error('That order reference is already in use. Start a new order.');
    return { ...saved.dealer_sale, dealerName: saved.dealer_sale.dealerName };
  }
  const result = await supabase.from('dealer_accounts').select('*').eq('user_id', user.id).maybeSingle();
  if (result.error) throw new Error('Dealer pricing could not be verified. Try again.');
  if (!result.data?.active) throw new Error('This account does not have active dealer pricing.');
  const { discount = null, freeShipping = false, personalDiscountCode = null } = await resolveDiscounts();
  const quote = dealerQuote(input.items, result.data.percent_off, input.dealerDelivery, { discount, freeShipping });
  if (Math.round(quote.dealerTotal * 100) !== Math.round(input.quotedDealerTotal * 100)
      || Math.round(quote.customerTotal * 100) !== Math.round(input.quotedCustomerTotal * 100)) throw new Error('Pricing changed. Refresh your quote before placing the order.');
  return { ...quote, dealerId: user.id, dealerName: result.data.display_name, delivery: input.dealerDelivery, customerReference: input.customerReference,
    discountCodes: input.discountCodes, discount, personalDiscountCode };
}
