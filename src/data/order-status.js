// The order lifecycle, and who is allowed to move an order through it.
//
// Free of React and of any browser or Node API, so the admin page, the Netlify
// function that performs the update, and the tests all read one definition. A
// status the browser offers but the server rejects is a bug that only appears
// in production, on a real order.

export const ORDER_STATUSES = [
  "AWAITING PAYMENT",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

// What create-order.js writes, and what the database column default should be.
// The customer has said they sent payment via Cash App or Venmo; nobody has
// checked that it arrived. Recording that honestly is the difference between an
// order the owner knows to reconcile and one that looks already settled.
export const DEFAULT_ORDER_STATUS = "AWAITING PAYMENT";

export function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function isValidStatus(value) {
  return ORDER_STATUSES.includes(normalizeStatus(value));
}

// The admin allowlist arrives as a comma- or space-separated env var.
export function parseAdminEmails(raw) {
  return String(raw ?? "")
    .split(/[,\s]+/)
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

// An unset or empty allowlist grants access to NOBODY.
//
// That direction is the whole point. The tempting alternative — treating "no
// list configured" as "not locked down yet" — would hand every signed-in
// customer the name, address and phone number of every other customer the
// moment the variable was missing or misspelled in the Netlify dashboard.
// Failing closed makes that mistake visible (the owner loses access) instead of
// silent (everyone gains it).
export function isAdminEmail(email, raw) {
  const allowed = parseAdminEmails(raw);
  if (allowed.length === 0) return false;
  const candidate = String(email ?? "").trim().toLowerCase();
  if (!candidate) return false;
  return allowed.includes(candidate);
}
