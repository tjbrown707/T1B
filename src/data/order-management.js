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

export const ORDER_STATUS_VALUES = Object.freeze(ORDER_STATUS_OPTIONS.map(option => option.value));

export function isOrderStatus(value) {
  return typeof value === "string" && ORDER_STATUS_VALUES.includes(value);
}

// Authorization belongs in app_metadata: customers can edit user_metadata,
// but only a trusted server or a Supabase administrator can edit app_metadata.
export function hasOrderManagerRole(user) {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "order_manager";
}
