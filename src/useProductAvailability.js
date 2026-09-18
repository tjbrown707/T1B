import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export function useProductAvailability() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/.netlify/functions/product-availability", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const body = response.ok ? await response.json() : null;
        if (active) setResult({ token, products: Array.isArray(body?.products) ? body.products : null });
      } catch {
        if (active) setResult({ token, products: null });
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [token]);
  return token && result?.token === token ? result.products : null;
}
