import { useState } from "react";
import { Link } from "react-router-dom";
import { acceptAnalytics, declineAnalytics, getAnalyticsConsent } from "./analytics.js";

const bannerStyle = {
  position: "fixed",
  left: 16,
  right: 16,
  bottom: 16,
  zIndex: 9000,
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

const declineStyle = {
  ...acceptStyle,
  background: "transparent",
  color: "var(--text-secondary, #c9c9c9)",
  border: "1px solid var(--border, #333)",
};

export default function ConsentBanner() {
  const [choice, setChoice] = useState(() => getAnalyticsConsent());

  if (choice) return null;

  return (
    <div role="dialog" aria-label="Analytics cookies" style={bannerStyle}>
      <p style={textStyle}>
        This site can use Google Analytics to count visits. The tracker is not
        loaded unless you accept. Details, including the cookie names, are on
        the <Link to="/privacy" style={{ color: "var(--red-primary, #d93642)" }}>Privacy Policy</Link>.
      </p>
      <div style={buttonRowStyle}>
        <button type="button" style={acceptStyle} onClick={() => { acceptAnalytics(); setChoice("granted"); }}>
          Accept analytics
        </button>
        <button type="button" style={declineStyle} onClick={() => { declineAnalytics(); setChoice("denied"); }}>
          Decline
        </button>
      </div>
    </div>
  );
}
