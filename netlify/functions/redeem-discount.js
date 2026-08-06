// Netlify Function: marks a per-customer discount code as spent.
//
// Called once, after an order is successfully placed. Without this step
// "single use" is decorative — validate-discount would keep approving the same
// code on every future order.
//
// Sitewide codes from the DISCOUNT_CODES env var are not tracked and are
// ignored here; a request naming one is a no-op, not an error.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "Method not allowed" }),
    };
  }

  const token = (event.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "Not signed in" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "Invalid request" }),
    };
  }

  const code = String(body.code || "").trim().toUpperCase();
  const orderNumber = String(body.orderNumber || "").trim() || null;
  if (!code) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "No code supplied" }),
    };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("redeem-discount: Supabase env vars missing");
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "Unavailable" }),
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "Not signed in" }),
    };
  }

  // The `is("redeemed_at", null)` filter is what makes this safe against two
  // checkouts racing in separate tabs: Postgres applies it inside the UPDATE,
  // so the second request matches zero rows instead of overwriting the first
  // redemption. `.select()` returns what actually changed.
  const { data: updated, error: updateErr } = await supabase
    .from("discount_codes")
    .update({ redeemed_at: new Date().toISOString(), order_number: orderNumber })
    .eq("code", code)
    .eq("user_id", userId)
    .is("redeemed_at", null)
    .select("code");

  if (updateErr) {
    console.error("redeem-discount: update failed:", updateErr);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ redeemed: false, error: "Unavailable" }),
    };
  }

  // Zero rows means a sitewide code, someone else's code, or one already
  // spent. None of these should surface an error at checkout — the order is
  // already placed by the time this runs.
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({ redeemed: Array.isArray(updated) && updated.length > 0 }),
  };
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "https://www.tierone.bio",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}
