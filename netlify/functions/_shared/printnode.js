import { Buffer } from "node:buffer";
import { getEnv } from "./http.js";

export function printNodeConfig() {
  const apiKey = normaliseApiKey(getEnv("PRINTNODE_API_KEY"));
  const fulfillmentPrinterId = positiveInteger(getEnv("PRINTNODE_FULFILLMENT_PRINTER_ID"));
  const labelPrinterId = positiveInteger(getEnv("PRINTNODE_LABEL_PRINTER_ID"));
  return {
    apiKey,
    fulfillmentPrinterId,
    labelPrinterId,
    fulfillmentConfigured: Boolean(apiKey && fulfillmentPrinterId),
    labelConfigured: Boolean(apiKey && labelPrinterId),
  };
}

export async function getPrintNodePrinterReadiness({
  apiKey,
  printerId,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalisedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const normalisedPrinterId = positiveInteger(printerId);
  if (!normalisedApiKey || !normalisedPrinterId) {
    return readiness({
      configured: false,
      available: false,
      reason: "not_configured",
    });
  }

  let response;
  try {
    response = await fetchImpl(`https://api.printnode.com/printers/${normalisedPrinterId}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${normalisedApiKey}:`).toString("base64")}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return readiness({ configured: true, reason: "lookup_failed" });
  }

  if (!response?.ok) {
    if ([401, 403].includes(Number(response?.status))) {
      return readiness({
        configured: true,
        available: false,
        reason: "authentication_failed",
      });
    }
    return readiness({ configured: true, reason: "lookup_failed" });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return readiness({ configured: true, reason: "invalid_response" });
  }
  if (!Array.isArray(payload)) {
    return readiness({ configured: true, reason: "invalid_response" });
  }

  const printer = payload.find(candidate => positiveInteger(candidate?.id) === normalisedPrinterId);
  if (!printer) {
    return readiness({
      configured: true,
      printerAvailable: false,
      available: false,
      reason: "printer_missing",
    });
  }

  const printerState = normaliseState(printer.state);
  const computerState = normaliseState(printer.computer?.state);
  const printerAvailable = printerState === "online"
    ? true
    : printerState === "offline" ? false : null;
  const computerAvailable = computerState === "connected"
    ? true
    : computerState === "disconnected" ? false : null;

  if (computerAvailable === false) {
    return readiness({
      configured: true,
      printerAvailable,
      computerAvailable,
      available: false,
      reason: "computer_disconnected",
    });
  }
  if (printerAvailable === false) {
    return readiness({
      configured: true,
      printerAvailable,
      computerAvailable,
      available: false,
      reason: "printer_offline",
    });
  }
  if (printerAvailable === true && computerAvailable === true) {
    return readiness({
      configured: true,
      printerAvailable,
      computerAvailable,
      available: true,
      reason: "ready",
    });
  }
  return readiness({
    configured: true,
    printerAvailable,
    computerAvailable,
    reason: "unknown_state",
  });
}

export async function submitPrintNodeJob({ printerId, title, contentType, content, idempotencyKey }) {
  const apiKey = normaliseApiKey(printNodeConfig().apiKey);
  if (!apiKey || !positiveInteger(printerId)) throw new Error("PrintNode is not configured.");
  if (!["pdf_base64", "pdf_uri"].includes(contentType)) throw new Error("Unsupported print content.");

  const response = await fetch("https://api.printnode.com/printjobs", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      printerId: positiveInteger(printerId),
      title: String(title || "Tier One print job").slice(0, 160),
      contentType,
      content,
      source: "Tier One Operations",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PrintNode returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const jobId = Number(text);
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error("PrintNode returned an invalid print job id.");
  return jobId;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normaliseState(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normaliseApiKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readiness({
  configured,
  printerAvailable = null,
  computerAvailable = null,
  available = null,
  reason,
}) {
  return {
    configured,
    printerAvailable,
    computerAvailable,
    available,
    reason,
  };
}
