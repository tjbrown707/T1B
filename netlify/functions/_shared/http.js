import { Buffer } from "node:buffer";

export const SITE_ORIGIN = "https://www.tierone.bio";

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

export function jsonResponse(status, payload, methods) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": methods,
      Vary: "Origin, Authorization",
    },
  });
}
