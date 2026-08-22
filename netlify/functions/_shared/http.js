import { Buffer } from "node:buffer";

export const SITE_ORIGIN = "https://www.tierone.bio";

// One HSTS policy for every function response. includeSubDomains stays;
// preload is omitted until the owner submits the domain to the preload list.
export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

export function getEnv(name) {
  return globalThis.Netlify?.env?.get(name);
}

export function readBearerToken(request) {
  return (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

export async function readJsonBody(request, maxBytes) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { error: "Request is too large." };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { error: "Request is too large." };
  }

  try {
    return { data: JSON.parse(text || "{}") };
  } catch {
    return { error: "Invalid request." };
  }
}

export function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": HSTS_VALUE,
    ...extra,
  };
}

export function jsonResponse(status, payload, methods) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: securityHeaders({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": methods,
      Vary: "Origin, Authorization",
    }),
  });
}

// Browser fetch always sends Origin. Missing Origin is allowed so unit tests
// and server-to-server calls still work. A mismatched Origin is refused
// without echoing the header or any request body back.
export function isAllowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === SITE_ORIGIN) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function rejectCrossOrigin(request, methods) {
  if (isAllowedOrigin(request)) return null;
  return jsonResponse(403, { ok: false, error: "Request not allowed." }, methods);
}
