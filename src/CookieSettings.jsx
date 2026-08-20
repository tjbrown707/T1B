import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  acceptAnalytics,
  getAnalyticsConsent,
  revokeAnalytics,
} from "./analytics.js";
import { COOKIE_SETTINGS_EVENT } from "./cookie-settings.js";

const panelStyle = {
  position: "fixed",
  left: 16,
  right: 16,
  bottom: 16,
  zIndex: 9100,
  maxWidth: 720,
  margin: "0 auto",
  padding: "18px 20px",
  background: "rgba(17,19,22,0.98)",
  border: "1px solid rgba(217,54,66,0.38)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
  color: "var(--text-primary, #f4f6f8)",
};

const textStyle = {
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: 16,
  lineHeight: 1.55,
  color: "var(--text-secondary, #c9c9c9)",
  margin: "0 0 14px",
};

const buttonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const acceptStyle = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  padding: "10px 16px",
  background: "var(--red-primary, #d93642)",
  border: "1px solid var(--red-primary, #d93642)",
  color: "#fff",
  cursor: "pointer",
};

const secondaryStyle = {
  ...acceptStyle,
  background: "transparent",
  color: "var(--text-secondary, #c9c9c9)",
  border: "1px solid var(--border, #333)",
};

export default function CookieSettings() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(() => getAnalyticsConsent());

  useEffect(() => {
    function onOpen() {
      setChoice(getAnalyticsConsent());
      setOpen(true);
    }
    window.addEventListener(COOKIE_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, onOpen);
  }, []);

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Cookie settings" style={panelStyle}>
      <p style={textStyle}>
        Analytics is currently <strong style={{ color: "var(--text-primary, #f4f6f8)" }}>
          {choice === "granted" ? "on" : choice === "denied" ? "off" : "not chosen"}
        </strong>.
        Accepting loads Google Analytics. Revoking stops the tracker and removes
        its cookies. Details are on the{" "}
        <Link to="/privacy" style={{ color: "var(--red-primary, #d93642)" }} onClick={() => setOpen(false)}>
          Privacy Policy
        </Link>.
      </p>
      <div style={buttonRowStyle}>
        <button
          type="button"
          style={acceptStyle}
          onClick={() => { acceptAnalytics(); setChoice("granted"); }}
        >
          Accept analytics
        </button>
        <button
          type="button"
          style={secondaryStyle}
          onClick={() => { revokeAnalytics(); setChoice("denied"); }}
        >
          Reject analytics
        </button>
        <button
          type="button"
          style={secondaryStyle}
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
