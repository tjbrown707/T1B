import { Buffer } from "node:buffer";
import { getEnv } from "./http.js";

export function printNodeConfig() {
  const apiKey = getEnv("PRINTNODE_API_KEY") || "";
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

export async function submitPrintNodeJob({ printerId, title, contentType, content }) {
  const { apiKey } = printNodeConfig();
  if (!apiKey || !positiveInteger(printerId)) throw new Error("PrintNode is not configured.");
  if (!["pdf_base64", "pdf_uri"].includes(contentType)) throw new Error("Unsupported print content.");

  const response = await fetch("https://api.printnode.com/printjobs", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
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
