// Validates reusable sitewide codes and authenticated, single-use personal
// codes. Code lists and the service-role key stay server-side.

import { createClient } from "@supabase/supabase-js";
import { isSaleActive } from "../../src/data/pricing.js";
import { getEnv, jsonResponse, readBearerToken, readJsonBody } from "./_shared/http.js";

const CODE_PATTERN = /^[A-Z0-9_@-]{1,64}$/;
const MAX_BODY_BYTES = 8 * 1024;

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, "POST, OPTIONS");
  if (request.method !== "POST") return fail(405, "Method not allowed");

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);

  const code = typeof parsed.data?.code === "string" ? parsed.data.code.trim().toUpperCase() : "";
  if (!code) return fail(200, "Enter a discount code.");
  if (!CODE_PATTERN.test(code)) return fail(200, "Invalid discount code.");
  if (isSaleActive()) return fail(200, "Discount codes are unavailable during the current sitewide sale.");

  let codes;
  try {
    const value = JSON.parse(getEnv("DISCOUNT_CODES") || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
    codes = value;
  } catch (error) {
    console.error("validate-discount: DISCOUNT_CODES is not valid JSON:", error);
    return fail(500, "Discount system unavailable.");
  }

  let match = codes[code];
  if (!match || typeof match !== "object") {
    const token = readBearerToken(request);
    if (!token) return fail(200, "Invalid discount code.");

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("validate-discount: Supabase env vars missing — personal codes disabled");
      return fail(200, "Invalid discount code.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return fail(200, "Invalid discount code.");

    const { data: personal, error: lookupError } = await supabase
      .from("discount_codes")
      .select("code, type, value, label, expires_at, redeemed_at")
      .eq("code", code)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) {
      console.error("validate-discount: lookup failed:", lookupError);
      return fail(500, "Discount system unavailable.");
    }
    if (!personal) return fail(200, "Invalid discount code.");
    if (personal.redeemed_at) return fail(200, "This code has already been used.");
    if (personal.expires_at) {
      const expiry = new Date(personal.expires_at).getTime();
      if (!Number.isFinite(expiry) || expiry <= Date.now()) return fail(200, "This code has expired.");
    }
    match = personal;
  }

  const type = match.type === "fixed" ? "fixed" : "percent";
  const value = Number(match.value);
  if (!Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100)) {
    console.error(`validate-discount: code ${code} has an invalid value`);
    return fail(200, "Invalid discount code.");
  }

  const label = typeof match.label === "string" && match.label.trim()
    ? match.label.trim().slice(0, 120)
    : type === "percent"
      ? `${value}% off`
      : `$${value} off`;

  return jsonResponse(200, { valid: true, code, type, value, label }, "POST, OPTIONS");
}

function fail(status, error) {
  return jsonResponse(status, { valid: false, error }, "POST, OPTIONS");
}

export const config = {
  path: "/.netlify/functions/validate-discount",
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
