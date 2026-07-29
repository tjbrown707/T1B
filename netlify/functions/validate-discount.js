// Netlify Function: validates a discount code against codes stored in
// environment variables. Codes are never shipped to the browser.
//
// Required env var (set in Netlify UI → Site configuration → Environment variables):
//   DISCOUNT_CODES  — JSON string of codes, e.g.
//     {"WELCOME10":{"type":"percent","value":10,"label":"10% off"},
//      "T1B25":{"type":"fixed","value":25,"label":"$25 off"}}

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

  const match = codes[code];
  if (!match || typeof match !== "object") {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ valid: false, error: "Invalid discount code." }),
    };
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
