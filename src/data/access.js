// Shared by route rendering and the static build. Research remains disabled
// separately; if the owner restores it, these URLs still require sign-in.
export function requiresLogin(path) {
  return /^\/(?:products|product|research|lab-results|calculator|cart|checkout)(?:\/|$)/.test(path);
}

export function safeReturnPath(value, fallback = "/account") {
  if (typeof value !== "string" || !value.startsWith("/")
      || value.includes("\\") || [...value].some(char => char.charCodeAt(0) <= 32)) return fallback;
  try {
    const url = new URL(value, "https://www.tierone.bio");
    if (url.origin !== "https://www.tierone.bio"
        || /^\/(?:login|signup|reset-password)(?:\/|$)/.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function loginUrl(path) {
  return `/login?redirect=${encodeURIComponent(safeReturnPath(path, "/products"))}`;
}
