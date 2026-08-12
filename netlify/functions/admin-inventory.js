import { authenticateOrderManager } from "./_shared/admin-auth.js";
import { jsonResponse, readJsonBody } from "./_shared/http.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_BODY_BYTES = 8 * 1024;
const METHODS = "GET, POST, OPTIONS";

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (!["GET", "POST"].includes(request.method)) return fail(405, "Method not allowed");

  const auth = await authenticateOrderManager(request, fail);
  if (auth.response) return auth.response;
  if (request.method === "GET") return inventorySnapshot(auth.supabase);

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);
  const operation = validateInventoryOperation(parsed.data);
  if (operation.error) return fail(400, operation.error);

  const { data, error } = await auth.supabase.rpc(operation.rpc, {
    ...operation.args,
    p_actor_user_id: auth.user.id,
  });
  if (error) return inventoryWriteError(error, operation.action);
  const lot = Array.isArray(data) ? data[0] : data;
  console.info(`admin-inventory: staff ${auth.user.id} performed ${operation.action} on ${lot?.id || "a lot"}`);
  return jsonResponse(200, { lot }, METHODS);
}

async function inventorySnapshot(supabase) {
  const [productsResult, lotsResult, movementsResult, eventsResult] = await Promise.all([
    supabase
      .from("inventory_products")
      .select("product_id,product_name,dose,reorder_point,updated_at")
      .order("product_name", { ascending: true })
      .order("dose", { ascending: true }),
    supabase
      .from("inventory_lots")
      .select("id,product_id,lot_number,supplier_batch_id,is_provisional,received_quantity,on_hand,reserved,expires_on,storage_location,received_at,updated_at")
      .order("is_provisional", { ascending: true })
      .order("expires_on", { ascending: true, nullsFirst: false })
      .order("received_at", { ascending: true }),
    supabase
      .from("inventory_movements")
      .select("id,product_id,lot_id,order_id,movement_type,on_hand_delta,reserved_delta,reason,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
    supabase
      .from("inventory_events")
      .select("id,product_id,lot_id,event_type,details,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
  ]);
  const error = productsResult.error || lotsResult.error || movementsResult.error || eventsResult.error;
  if (error) {
    console.error("admin-inventory: snapshot failed:", error);
    return fail(500, "Inventory could not be loaded.");
  }

  const lotsByProduct = new Map();
  for (const lot of lotsResult.data || []) {
    const list = lotsByProduct.get(lot.product_id) || [];
    list.push(lot);
    lotsByProduct.set(lot.product_id, list);
  }
  const products = (productsResult.data || []).map(product => ({
    ...product,
    lots: lotsByProduct.get(product.product_id) || [],
  }));
  const movements = [
    ...(movementsResult.data || []).map(movement => ({ ...movement, auditKey: `movement-${movement.id}` })),
    ...(eventsResult.data || []).map(event => ({
      ...event,
      auditKey: `event-${event.id}`,
      movement_type: event.event_type,
      on_hand_delta: 0,
      reserved_delta: 0,
      reason: inventoryEventSummary(event),
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 100);
  return jsonResponse(200, { products, movements }, METHODS);
}

export function validateInventoryOperation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid request." };
  const action = cleanString(body.action, 40);

  if (action === "receive_lot") {
    const productId = cleanString(body.productId, 80);
    const lotNumber = cleanString(body.lotNumber, 80);
    const supplierBatchId = cleanString(body.supplierBatchId, 120);
    const storageLocation = cleanString(body.storageLocation, 120);
    const quantity = integer(body.quantity);
    const expiresOn = optionalDate(body.expiresOn);
    if (!PRODUCT_ID_PATTERN.test(productId)) return { error: "Choose a valid product." };
    if (!lotNumber || lotNumber.length > 80 || lotNumber.toUpperCase().startsWith("PROVISIONAL-")) return { error: "Enter the real lot number." };
    if (supplierBatchId.length > 120 || storageLocation.length > 120) return { error: "Lot details are too long." };
    if (!quantity || quantity < 1 || quantity > 100000) return { error: "Enter a valid received quantity." };
    if (expiresOn === false) return { error: "Enter a valid expiration date." };
    return {
      action,
      rpc: "receive_inventory_lot",
      args: {
        p_product_id: productId,
        p_lot_number: lotNumber,
        p_supplier_batch_id: supplierBatchId,
        p_quantity: quantity,
        p_expires_on: expiresOn,
        p_storage_location: storageLocation,
      },
    };
  }

  if (action === "update_lot") {
    const lotId = cleanString(body.lotId, 36);
    const expectedUpdatedAt = cleanString(body.expectedUpdatedAt, 40);
    const lotNumber = cleanString(body.lotNumber, 80);
    const supplierBatchId = cleanString(body.supplierBatchId, 120);
    const storageLocation = cleanString(body.storageLocation, 120);
    const reorderPoint = integer(body.reorderPoint);
    const expiresOn = optionalDate(body.expiresOn);
    if (!UUID_PATTERN.test(lotId)) return { error: "Choose a valid inventory lot." };
    if (!expectedUpdatedAt || expectedUpdatedAt.length > 40 || Number.isNaN(new Date(expectedUpdatedAt).getTime())) return { error: "Refresh this lot before editing it." };
    if (!lotNumber || lotNumber.length > 80 || lotNumber.toUpperCase().startsWith("PROVISIONAL-")) return { error: "Enter the real lot number." };
    if (supplierBatchId.length > 120 || storageLocation.length > 120) return { error: "Lot details are too long." };
    if (reorderPoint === null || reorderPoint < 0 || reorderPoint > 100000) return { error: "Enter a valid low-stock level." };
    if (expiresOn === false) return { error: "Enter a valid expiration date." };
    return {
      action,
      rpc: "update_inventory_lot_metadata",
      args: {
        p_lot_id: lotId,
        p_expected_updated_at: expectedUpdatedAt,
        p_lot_number: lotNumber,
        p_supplier_batch_id: supplierBatchId,
        p_expires_on: expiresOn,
        p_storage_location: storageLocation,
        p_reorder_point: reorderPoint,
      },
    };
  }

  if (action === "adjust_lot") {
    const lotId = cleanString(body.lotId, 36);
    const delta = integer(body.delta);
    const reason = cleanString(body.reason, 500);
    if (!UUID_PATTERN.test(lotId)) return { error: "Choose a valid inventory lot." };
    if (!delta || Math.abs(delta) > 100000) return { error: "Enter a non-zero adjustment." };
    if (reason.length < 3 || reason.length > 500) return { error: "Explain why this inventory adjustment is needed (500 characters maximum)." };
    return {
      action,
      rpc: "adjust_inventory_lot",
      args: { p_lot_id: lotId, p_delta: delta, p_reason: reason },
    };
  }

  return { error: "Choose a valid inventory action." };
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : false;
}

function inventoryEventSummary(event) {
  const lotNumber = event?.details?.after?.lot_number;
  return lotNumber ? `Lot details updated to ${lotNumber}` : "Lot details updated";
}

function inventoryWriteError(error, action) {
  const message = String(error?.message || "");
  if (message.includes("lot_update_conflict")) return fail(409, "Someone else changed this lot. Refresh and try again.");
  if (message.includes("adjustment_would_overdraw_reserved_stock")) {
    return fail(409, "That adjustment would remove units already reserved for orders.");
  }
  if (message.includes("duplicate key") || error?.code === "23505") {
    return fail(409, "That lot number is already in use for this product.");
  }
  if (message.includes("foreign key") || error?.code === "23503") return fail(400, "The selected product or lot no longer exists.");
  console.error(`admin-inventory: ${action} failed:`, error);
  return fail(500, "Inventory could not be updated.");
}

export const config = {
  path: "/.netlify/functions/admin-inventory",
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}
