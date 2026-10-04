export async function loadLotChoices(supabase, orderIds) {
  if (!orderIds.length) return new Map();
  const { data, error } = await supabase.rpc("get_order_lot_choices", { p_order_ids: orderIds });
  if (error) throw error;
  return new Map((data || []).map(row => [row.order_id, {
    lot_selection_required: row.lot_selection_required,
    lot_choices: row.lot_choices,
  }]));
}

// Freeze before taking the allocation snapshot. This closes the race between
// a staff edit and a concurrent PDF/print request. Order copies skip this RPC.
export async function prepareFulfillmentLots(supabase, orderId) {
  const { data, error } = await supabase.rpc("prepare_order_lots_for_fulfillment", { p_order_id: orderId });
  if (error) return { error: String(error.message).includes("manual_lot_assignment_required")
    ? "Assign shipment lots in the order details before picking or printing."
    : "The shipment lots could not be verified. Refresh the order and try again." };
  const order = Array.isArray(data) ? data[0] : data;
  if (!order || typeof order !== "object") return { error: "The shipment lots could not be verified." };
  return { order };
}
