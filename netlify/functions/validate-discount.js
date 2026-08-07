// Netlify Function: validates a discount code. Two sources, checked in order:
//
//   1. Sitewide codes in the DISCOUNT_CODES env var. Reusable, not tied to a
//      customer, no redemption tracking.
//   2. Per-customer single-use codes in public.discount_codes (the welcome
//      code). Bound to one user_id, expires, and can be redeemed once.
//
// Codes are never shipped to the browser.
//
// Required env var (set in Netlify UI → Site configuration → Environment variables):
//   DISCOUNT_CODES  — JSON string of codes, e.g.
//     {"WELCOME10":{"type":"percent","value":10,"label":"10% off"},
//      "T1B25":{"type":"fixed","value":25,"label":"$25 off"}}
// Required for per-customer codes:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

// Simple in-memory rate limiter. Netlify keeps a warm function instance alive
// between invocations, so this throttles the common case of someone scripting
// thousands of guesses at the code list. It is best-effort, not a hard
// guarantee (a cold start or a second instance resets the window).
const RATE_LIMIT_MAX = 10;            // attempts allowed...
const RATE_LIMIT_WINDOW_MS = 60_000;  // ...per IP per minute
const attempts = new Map();           // ip -> { count, resetAt }

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Opportunistic cleanup so the map can't grow without bound.
    if (attempts.size > 5000) {
      for (const [key, val] of attempts) if (now > val.resetAt) attempts.delete(key);
    }
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}

export const handler = async (event) => {
  // CORS / method guard
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Method not allowed" }),
    };
  }

  const clientIp =
    event.headers?.["x-nf-client-connection-ip"] ||
    (event.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Too many attempts. Please wait a minute and try again." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Invalid request." }),
    };
  }

  const code = String(body.code || "").trim().toUpperCase();
  if (!code) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Enter a discount code." }),
    };
  }

  let codes;
  try {
    codes = JSON.parse(process.env.DISCOUNT_CODES || "{}");
  } catch (err) {
    console.error("DISCOUNT_CODES env var is not valid JSON:", err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Discount system unavailable." }),
    };
  }

  let match = codes[code];

  // Not a sitewide code — try the customer's own single-use codes. These are
  // bound to a user_id, so the caller has to prove who they are: the lookup is
  // filtered by the id on their access token, and a code belonging to someone
  // else comes back as simply "invalid" rather than "not yours", which would
  // otherwise confirm that the code exists.
  if (!match || typeof match !== "object") {
    const token = (event.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "Invalid discount code." }),
      };
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      // Personal codes are not configured. send-welcome-email needs this same
      // key to mint them, so if it is absent no personal code can exist and
      // anything reaching here really is invalid — telling the customer the
      // system is down would be wrong as well as alarming. Logged so the
      // misconfiguration is still visible to us in the function log.
      console.error("validate-discount: Supabase env vars missing — personal codes disabled");
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "Invalid discount code." }),
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "Invalid discount code." }),
      };
    }

    const { data: personal, error: lookupErr } = await supabase
      .from("discount_codes")
      .select("code, type, value, label, expires_at, redeemed_at")
      .eq("code", code)
      .eq("user_id", userId)
      .maybeSingle();

    if (lookupErr) {
      console.error("validate-discount: lookup failed:", lookupErr);
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "Discount system unavailable." }),
      };
    }
    if (!personal) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "Invalid discount code." }),
      };
    }
    if (personal.redeemed_at) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "This code has already been used." }),
      };
    }
    if (personal.expires_at && new Date(personal.expires_at) < new Date()) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ valid: false, error: "This code has expired." }),
      };
    }

    match = { type: personal.type, value: personal.value, label: personal.label };
  }

  const type = match.type === "fixed" ? "fixed" : "percent";
  const value = Number(match.value);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`Discount code ${code} has invalid value`);
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Invalid discount code." }),
    };
  }

  const label =
    typeof match.label === "string" && match.label.trim()
      ? match.label.trim()
      : type === "percent"
        ? `${value}% off`
        : `$${value} off`;

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({ valid: true, code, type, value, label }),
  };
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    // Only our own site may call this endpoint from a browser.
    "Access-Control-Allow-Origin": "https://www.tierone.bio",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}
