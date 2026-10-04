export function canAssignOrderLots(order) {
  return order?.inventory_accounting_mode === "TRACKED"
    && order?.payment_status === "PAID"
    && order?.fulfillment_status === "READY_TO_PICK"
    && !order?.backorder_pending && !order?.lots_locked_at
    && !order?.packingSlipPrintRecorded
    && Array.isArray(order?.lot_choices) && order.lot_choices.length > 0;
}

export function initialLotQuantities(products, confirmed = false) {
  return Object.fromEntries(products.flatMap(product => product.lots.map(lot => [
    lot.id, confirmed || product.lots.length === 1 ? String(lot.assigned || 0) : "0",
  ])));
}

export function validateLotQuantities(products, quantities) {
  const assignments = [];
  for (const product of products) {
    let total = 0;
    for (const lot of product.lots) {
      const raw = String(quantities[lot.id] ?? "0").trim();
      const quantity = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(quantity) || quantity < 0) {
        return { error: "Enter a whole number of vials for each lot." };
      }
      if (quantity > lot.capacity) return { error: `Lot ${lot.lotNumber} has only ${lot.capacity} vials available for this order. Refresh if inventory changed.` };
      if (quantity > 0 && (lot.isProvisional || (lot.expiresOn && lot.expiresOn < new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())))) {
        return { error: `Lot ${lot.lotNumber} needs a valid, unexpired lot record in Inventory before assignment.` };
      }
      total += quantity;
      if (quantity > 0) assignments.push({ lotId: lot.id, quantity });
    }
    if (total !== product.quantity) return { error: `Assign exactly ${product.quantity} vials for ${product.productId}; currently ${total} are selected.` };
  }
  return { assignments };
}
