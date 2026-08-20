import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function turnstileSiteKey() {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
}

export default function TurnstileField({ onToken, resetKey = 0 }) {
  const hostRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const siteKey = turnstileSiteKey();

  useEffect(() => {
    onTokenRef.current("");
    if (!siteKey || !hostRef.current || typeof document === "undefined") return undefined;

    let widgetId;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !window.turnstile || !hostRef.current) return;
      hostRef.current.innerHTML = "";
      widgetId = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: token => onTokenRef.current(token || ""),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current(""),
      });
    }

    const existing = document.querySelector("script[data-tierone-turnstile]");
    if (window.turnstile) {
      renderWidget();
    } else if (existing) {
      existing.addEventListener("load", renderWidget);
    } else {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.tieroneTurnstile = "1";
      script.addEventListener("load", renderWidget);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (existing) existing.removeEventListener("load", renderWidget);
      if (widgetId != null && window.turnstile) {
        try { window.turnstile.remove(widgetId); } catch { /* widget already gone */ }
      }
    };
  }, [siteKey, resetKey]);

  if (!siteKey) {
    return (
      <p style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: "var(--text-secondary)",
        margin: "0 0 16px",
      }}>
        Checkout verification is not configured. The public Turnstile site key
        must be set before an order can be placed.
      </p>
    );
  }

  return (
    <div
      ref={hostRef}
      style={{ margin: "0 0 16px", minHeight: 65 }}
      aria-label="Bot verification"
    />
  );
}
