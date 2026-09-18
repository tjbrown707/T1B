import { createClient as defaultCreateClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../../src/data/catalog.js";
import { estimatedBackorderDate } from "../../src/data/backorders.js";
import { getEnv, jsonResponse, readBearerToken, rejectCrossOrigin } from "./_shared/http.js";

const METHODS = "GET, OPTIONS";
const fail = (status, error) => jsonResponse(status, { error }, METHODS);

export function availabilityHandler({ createClient = defaultCreateClient, env = getEnv, now = () => new Date() } = {}) {
  return async request => {
    const blocked = rejectCrossOrigin(request, METHODS);
    if (blocked) return blocked;
    if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
    if (request.method !== "GET") return fail(405, "Method not allowed");
    const token = readBearerToken(request);
    if (!token) return fail(401, "Please sign in to view availability.");
    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return fail(503, "Availability is temporarily unavailable.");
    try {
      const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: authError } = await db.auth.getUser(token);
      if (authError || !auth?.user?.id || auth.user.is_anonymous) return fail(401, "Please sign in again.");
      // Only aggregate availability leaves the server; lot details stay private.
      const { data, error } = await db.rpc("storefront_availability");
      if (error || !Array.isArray(data)) return fail(503, "Availability is temporarily unavailable.");
      const catalog = new Set(PRODUCTS.map(product => product.id));
      const estimatedShipDate = estimatedBackorderDate(now());
      return jsonResponse(200, { products: data.filter(row => catalog.has(row.product_id)).map(row => ({
        id: row.product_id,
        available: Number(row.available),
        estimatedShipDate: Number(row.available) > 0 ? null : estimatedShipDate,
      })) }, METHODS);
    } catch {
      return fail(503, "Availability is temporarily unavailable.");
    }
  };
}

export default availabilityHandler();
