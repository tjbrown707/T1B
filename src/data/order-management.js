// Shared vocabulary for the staff order console and its server endpoint.
// Keeping the list in a plain module means the browser, the Netlify Function,
// and the tests all accept exactly the same status values.

export const ORDER_STATUS_OPTIONS = Object.freeze([
  { value: "AWAITING PAYMENT", label: "Awaiting payment" },
  { value: "PAID", label: "Paid" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
  // Orders created before the server-authoritative checkout used this value.
  // It stays selectable so staff can find and move those legacy rows forward.
  { value: "CONFIRMED", label: "Confirmed (legacy)" },
]);

export const PAYMENT_STATUS_OPTIONS = Object.freeze([
  { value: "AWAITING_PAYMENT", label: "Awaiting payment" },
  { value: "PAID", label: "Paid" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "CANCELLED", label: "Cancelled" },
]);

export const FULFILLMENT_STATUS_OPTIONS = Object.freeze([
  { value: "ON_HOLD", label: "On hold" },
  { value: "READY_TO_PICK", label: "Ready to pick" },
  { value: "PICKED", label: "Picked" },
  { value: "PACKED", label: "Packed" },
  { value: "LABEL_CREATED", label: "Label created" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
]);

export const FULFILLMENT_METHODS = Object.freeze({
  SHIP: "SHIP",
  LOCAL_HANDOFF: "LOCAL_HANDOFF",
});

export const INVENTORY_ACCOUNTING_MODES = Object.freeze({
  TRACKED: "TRACKED",
  PRECOUNTED_LEGACY: "PRECOUNTED_LEGACY",
});

export const PAYMENT_RECEIVED_OPTIONS = Object.freeze([
  "Cash App",
  "Venmo",
  "Cash",
  "Other",
]);

export const ORDER_STATUS_VALUES = Object.freeze(ORDER_STATUS_OPTIONS.map(option => option.value));

export function isOrderStatus(value) {
  return typeof value === "string" && ORDER_STATUS_VALUES.includes(value);
}

export function canDeleteOrder() {
  // Inventory and payment history is an audit record. Operational orders are
  // cancelled or archived, never erased from the staff console.
  return false;
}

export function canConfirmPayment(order) {
  return order?.payment_status === "AWAITING_PAYMENT"
    && order?.fulfillment_status === "ON_HOLD";
}

export function canCancelUnpaidOrder(order) {
  return order?.payment_status === "AWAITING_PAYMENT";
}

export function canCompleteLocalHandoff(order) {
  return order?.fulfillment_method === FULFILLMENT_METHODS.LOCAL_HANDOFF
    && order?.packingSlipPrintRecorded === true
    && order?.trackingEmail?.fulfillment_method === FULFILLMENT_METHODS.LOCAL_HANDOFF
    && Number(order?.trackingEmail?.template_version) === 2;
}

export function nextFulfillmentAction(order) {
  if (order?.payment_status !== "PAID") return null;
  if (order.fulfillment_method === FULFILLMENT_METHODS.LOCAL_HANDOFF
      && order.fulfillment_status === "READY_TO_PICK"
      && canCompleteLocalHandoff(order)) {
    return { action: "mark_handed_off", label: "Mark Handed Off", target: "DELIVERED" };
  }
  if (order.fulfillment_method === FULFILLMENT_METHODS.LOCAL_HANDOFF) return null;
  if (order.fulfillment_status === "READY_TO_PICK") {
    return { action: "mark_picked", label: "Mark Picked", target: "PICKED" };
  }
  if (order.fulfillment_status === "PICKED") {
    return { action: "mark_packed", label: "Mark Packed", target: "PACKED" };
  }
  return null;
}

export function isLocalHandoff(order) {
  return order?.fulfillment_method === FULFILLMENT_METHODS.LOCAL_HANDOFF;
}

export function isPrecountedOrder(order) {
  return order?.inventory_accounting_mode === INVENTORY_ACCOUNTING_MODES.PRECOUNTED_LEGACY;
}

// Authorization belongs in app_metadata: customers can edit user_metadata,
// but only a trusted server or a Supabase administrator can edit app_metadata.
export function hasOrderManagerRole(user) {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "order_manager";
}
