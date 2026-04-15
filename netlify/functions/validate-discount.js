// Netlify Function: validates a discount code against codes stored in
// environment variables. Codes are never shipped to the browser.
//
// Required env var (set in Netlify UI → Site configuration → Environment variables):
//   DISCOUNT_CODES  — JSON string of codes, e.g.
//     {"WELCOME10":{"type":"percent","value":10,"label":"10% off"},
//      "T1B25":{"type":"fixed","value":25,"label":"$25 off"}}

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
  };
}
