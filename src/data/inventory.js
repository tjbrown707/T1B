export const OPENING_INVENTORY_QUANTITY = 50;
export const DEFAULT_REORDER_POINT = 10;

export function lotAvailable(lot) {
  return Math.max(0, Number(lot?.on_hand || 0) - Number(lot?.reserved || 0));
}

export function inventoryProductTotals(product) {
  const lots = Array.isArray(product?.lots) ? product.lots : [];
  const onHand = lots.reduce((sum, lot) => sum + Number(lot?.on_hand || 0), 0);
  const reserved = lots.reduce((sum, lot) => sum + Number(lot?.reserved || 0), 0);
  return {
    onHand,
    reserved,
    available: Math.max(0, onHand - reserved),
    provisional: lots.some(lot => lot?.is_provisional && Number(lot?.on_hand || 0) > 0),
  };
}

export function inventoryDashboardTotals(products) {
  const rows = (Array.isArray(products) ? products : []).map(product => ({
    ...inventoryProductTotals(product),
    reorderPoint: Number(product?.reorder_point || 0),
  }));
  return {
    products: rows.length,
    onHand: rows.reduce((sum, row) => sum + row.onHand, 0),
    reserved: rows.reduce((sum, row) => sum + row.reserved, 0),
    available: rows.reduce((sum, row) => sum + row.available, 0),
    lowStock: rows.filter(row => row.available <= row.reorderPoint).length,
    provisionalProducts: rows.filter(row => row.provisional).length,
  };
}

export function inventoryRetailValue(products, catalog) {
  const prices = new Map((Array.isArray(catalog) ? catalog : []).map(product => [
    product?.id,
    Number(product?.price || 0),
  ]));
  return (Array.isArray(products) ? products : []).reduce((total, product) => {
    const price = prices.get(product?.product_id) || 0;
    return total + inventoryProductTotals(product).onHand * price;
  }, 0);
}

export function orderHasProvisionalLots(order) {
  return (Array.isArray(order?.allocations) ? order.allocations : [])
    .some(allocation => !allocation?.lot
      || allocation.lot.is_provisional
      || !String(allocation.lot.lot_number || "").trim());
}

export function isAllocationlessLegacyLocalHandoff(order) {
  const allocations = order?.allocations;
  const items = order?.items;
  return order?.payment_status === "PAID"
    && order?.fulfillment_method === "LOCAL_HANDOFF"
    && order?.inventory_accounting_mode === "PRECOUNTED_LEGACY"
    && Array.isArray(allocations)
    && allocations.length === 0
    && Array.isArray(items)
    && items.length > 0
    && items.length <= 200
    && items.every(item => {
      const quantity = Number(item?.qty);
      return String(item?.id || item?.name || "").trim().length > 0
        && Number.isInteger(quantity)
        && quantity > 0
        && quantity <= 1000;
    });
}

export function canPrintFulfillment(order) {
  if (isAllocationlessLegacyLocalHandoff(order)) return true;
  return order?.payment_status === "PAID"
    && Array.isArray(order?.allocations)
    && order.allocations.length > 0
    && order.allocations.every(allocation => allocation?.state === "COMMITTED")
    && !orderHasProvisionalLots(order);
}

export function formatLotLabel(lot) {
  if (!lot) return "Unassigned lot";
  return lot.is_provisional ? "Lot ID needed" : lot.lot_number;
}

export const DEFAULT_PARCEL = Object.freeze({
  length: 9,
  width: 4.25,
  // Shippo requires three dimensions. This remains editable in the staff UI
  // because the owner supplied the mailer's length and width but not thickness.
  height: 0.5,
  weight: 1.9,
  distanceUnit: "in",
  massUnit: "oz",
});
