import { getEnv } from "./http.js";

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 8000;
const TOKEN_MAX_LENGTH = 2048;

export function readTurnstileToken(value) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  if (!token || token.length > TOKEN_MAX_LENGTH) return "";
  return token;
}

export function turnstileSecret() {
  return getEnv("TURNSTILE_SECRET_KEY") || "";
}

// Verifies a Cloudflare Turnstile token with siteverify. Missing secret,
// missing token, and Cloudflare "success: false" all fail closed. Errors
// never include the token or the upstream body.
export async function verifyTurnstileToken(token, {
  fetchImpl = fetch,
  secret = turnstileSecret(),
  remoteIp = "",
} = {}) {
  const cleaned = readTurnstileToken(token);
  if (!secret) {
    console.error("turnstile: TURNSTILE_SECRET_KEY is not configured");
    return { ok: false, error: "Bot verification is not configured." };
  }
  if (!cleaned) {
    return { ok: false, error: "Bot verification failed. Please try again." };
  }

  const body = new URLSearchParams({
    secret,
    response: cleaned,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("turnstile: siteverify failed with status", response.status);
      return { ok: false, error: "Bot verification failed. Please try again." };
    }
    const payload = await response.json().catch(() => null);
    if (payload?.success === true) return { ok: true };
    console.error("turnstile: siteverify rejected the token");
    return { ok: false, error: "Bot verification failed. Please try again." };
  } catch {
    console.error("turnstile: siteverify could not be reached");
    return { ok: false, error: "Bot verification failed. Please try again." };
  } finally {
    clearTimeout(timer);
  }
}

export function clientIp(request) {
  return (
    request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || ""
  );
}
