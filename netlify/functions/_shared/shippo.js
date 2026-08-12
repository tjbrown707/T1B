import { getEnv } from "./http.js";

const API_ROOT = "https://api.goshippo.com";

export function shippoConfig() {
  const token = getEnv("SHIPPO_API_TOKEN") || "";
  const addressFrom = {
    name: getEnv("SHIP_FROM_NAME") || "",
    company: getEnv("SHIP_FROM_COMPANY") || "Tier One BioSystems",
    street1: getEnv("SHIP_FROM_STREET1") || "",
    street2: getEnv("SHIP_FROM_STREET2") || "",
    city: getEnv("SHIP_FROM_CITY") || "",
    state: getEnv("SHIP_FROM_STATE") || "",
    zip: getEnv("SHIP_FROM_ZIP") || "",
    country: getEnv("SHIP_FROM_COUNTRY") || "US",
    phone: getEnv("SHIP_FROM_PHONE") || "",
    email: getEnv("SHIP_FROM_EMAIL") || "",
  };
  const required = ["name", "street1", "city", "state", "zip", "country", "phone", "email"];
  return {
    token,
    addressFrom,
    configured: Boolean(token && required.every(field => addressFrom[field])),
  };
}

export async function shippoRequest(path, { method = "GET", body } = {}) {
  const { token } = shippoConfig();
  if (!token) throw new ShippoError(503, "Shippo is not configured.", false);
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: {
        Authorization: `ShippoToken ${token}`,
        "Content-Type": "application/json",
        "SHIPPO-API-VERSION": "2018-02-08",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    // A failed label-purchase request has an unknown outcome: the carrier may
    // have charged the account before the connection was lost. Callers must
    // not automatically retry it.
    throw new ShippoError(502, "Shippo could not be reached.", true, error);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = shippoMessage(payload) || `Shippo returned HTTP ${response.status}.`;
    throw new ShippoError(response.status, message, false);
  }
  return payload;
}

export class ShippoError extends Error {
  constructor(status, message, outcomeUnknown = false, cause) {
    super(message, { cause });
    this.name = "ShippoError";
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function shippoMessage(payload) {
  if (typeof payload?.detail === "string") return payload.detail.slice(0, 300);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const safe = messages
    .map(message => typeof message?.text === "string" ? message.text : "")
    .filter(Boolean)
    .join(" ");
  return safe.slice(0, 300);
}
