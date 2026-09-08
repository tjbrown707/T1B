import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import {
  getPrintNodePrinterReadiness,
  printNodeConfig,
} from "../netlify/functions/_shared/printnode.js";
import adminPrint, { packingPrinterUnavailableMessage } from "../netlify/functions/admin-print.js";

const API_KEY = "printnode-test-key";
const PRINTER_ID = 4321;
const LABEL_PRINTER_ID = 9876;
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const SUPABASE_ORIGIN = "https://example.supabase.co";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function printer(overrides = {}) {
  return {
    id: PRINTER_ID,
    name: "Private office printer name",
    state: "online",
    computer: {
      id: 8765,
      name: "Private computer name",
      state: "connected",
    },
    ...overrides,
  };
}

function adminUserResponse() {
  return jsonResponse({
    id: "22222222-2222-4222-8222-222222222222",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { role: "admin" },
  });
}

function printableOrderResponse() {
  return jsonResponse({
    id: ORDER_ID,
    order_number: "T1B-260908-123456",
    status: "PROCESSING",
    payment_status: "PAID",
    fulfillment_status: "READY_TO_PICK",
    fulfillment_method: "SHIP",
    inventory_accounting_mode: "TRACKED",
    items: [{ id: "bpc157-5", name: "BPC-157", dose: "5 mg", qty: 1 }],
    subtotal: 50,
    discount_amount: 0,
    shipping: 0,
    total: 50,
    payment_method: "Zelle",
    customer_name: "Research Customer",
    customer_email: "researcher@example.com",
    customer_phone: "555-555-1212",
    ship_address: "123 Lab Road",
    ship_city: "Phoenix",
    ship_state: "AZ",
    ship_zip: "85001",
    created_at: "2026-09-08T12:00:00.000Z",
  });
}

function committedAllocationsResponse() {
  return jsonResponse([{
    product_id: "bpc157-5",
    quantity: 1,
    state: "COMMITTED",
    inventory_lots: {
      lot_number: "LOT-TEST-1",
      is_provisional: false,
      storage_location: "Test shelf",
    },
  }]);
}

function installAdminPrintRuntime(t, { env = {}, fetchImpl }) {
  const previousNetlify = globalThis.Netlify;
  const previousFetch = globalThis.fetch;
  t.after(() => {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
    globalThis.fetch = previousFetch;
  });

  const values = {
    SUPABASE_URL: SUPABASE_ORIGIN,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-value",
    PRINTNODE_API_KEY: API_KEY,
    ...env,
  };
  globalThis.Netlify = { env: { get: name => values[name] } };
  globalThis.fetch = fetchImpl;
}

function adminPrintRequest(method = "GET") {
  const options = {
    method,
    headers: { Authorization: "Bearer test-session" },
  };
  if (method === "POST") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify({ orderId: ORDER_ID, document: "fulfillment" });
  }
  return new Request("https://www.tierone.bio/.netlify/functions/admin-print", options);
}

test("PrintNode configuration keeps the two printer roles separate", t => {
  const previousNetlify = globalThis.Netlify;
  t.after(() => {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  });
  globalThis.Netlify = {
    env: {
      get(name) {
        return {
          PRINTNODE_API_KEY: `  ${API_KEY}  `,
          PRINTNODE_FULFILLMENT_PRINTER_ID: String(PRINTER_ID),
          PRINTNODE_LABEL_PRINTER_ID: "9876",
        }[name];
      },
    },
  };

  assert.deepEqual(printNodeConfig(), {
    apiKey: API_KEY,
    fulfillmentPrinterId: PRINTER_ID,
    labelPrinterId: 9876,
    fulfillmentConfigured: true,
    labelConfigured: true,
  });
});

test("an online printer on a connected PrintNode computer is ready", async () => {
  let request = null;
  const result = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse([printer()]);
    },
  });

  assert.deepEqual(result, {
    configured: true,
    printerAvailable: true,
    computerAvailable: true,
    available: true,
    reason: "ready",
  });
  assert.equal(request.url, `https://api.printnode.com/printers/${PRINTER_ID}`);
  assert.equal(request.options.method, "GET");
  assert.equal(
    request.options.headers.Authorization,
    `Basic ${Buffer.from(`${API_KEY}:`).toString("base64")}`,
  );
  assert.equal(request.options.headers.Accept, "application/json");
  assert.doesNotMatch(JSON.stringify(result), /4321|8765|Private|printnode-test-key/);
});

test("an offline printer is definitively unavailable", async () => {
  const result = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => jsonResponse([printer({ state: "OFFLINE" })]),
  });

  assert.equal(result.configured, true);
  assert.equal(result.printerAvailable, false);
  assert.equal(result.computerAvailable, true);
  assert.equal(result.available, false);
  assert.equal(result.reason, "printer_offline");
});

test("a disconnected PrintNode computer is definitively unavailable", async () => {
  const result = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => jsonResponse([printer({
      computer: { id: 8765, name: "Private computer name", state: "disconnected" },
    })]),
  });

  assert.equal(result.printerAvailable, true);
  assert.equal(result.computerAvailable, false);
  assert.equal(result.available, false);
  assert.equal(result.reason, "computer_disconnected");
});

test("a stale configured printer id is unavailable without exposing account data", async () => {
  const result = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => jsonResponse([]),
  });

  assert.deepEqual(result, {
    configured: true,
    printerAvailable: false,
    computerAvailable: null,
    available: false,
    reason: "printer_missing",
  });
});

test("missing configuration is unavailable and does not call PrintNode", async () => {
  let called = false;
  const result = await getPrintNodePrinterReadiness({
    apiKey: "",
    printerId: null,
    fetchImpl: async () => {
      called = true;
      throw new Error("must not run");
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, {
    configured: false,
    printerAvailable: null,
    computerAvailable: null,
    available: false,
    reason: "not_configured",
  });
});

test("malformed PrintNode data produces an unknown fail-open status", async () => {
  const nonArray = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => jsonResponse({ id: PRINTER_ID }),
  });
  const invalidJson = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        throw new SyntaxError("invalid JSON");
      },
    }),
  });

  for (const result of [nonArray, invalidJson]) {
    assert.equal(result.configured, true);
    assert.equal(result.available, null);
    assert.equal(result.reason, "invalid_response");
  }
});

test("PrintNode HTTP and network errors produce an unknown fail-open status", async () => {
  const httpError = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => jsonResponse({ error: "private upstream detail" }, 503),
  });
  const networkError = await getPrintNodePrinterReadiness({
    apiKey: API_KEY,
    printerId: PRINTER_ID,
    fetchImpl: async () => {
      throw new Error("private network detail");
    },
  });

  for (const result of [httpError, networkError]) {
    assert.equal(result.configured, true);
    assert.equal(result.available, null);
    assert.equal(result.reason, "lookup_failed");
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test("rejected PrintNode credentials are definitively unavailable", async () => {
  for (const status of [401, 403]) {
    const result = await getPrintNodePrinterReadiness({
      apiKey: API_KEY,
      printerId: PRINTER_ID,
      fetchImpl: async () => jsonResponse({ error: "private upstream detail" }, status),
    });
    assert.equal(result.configured, true);
    assert.equal(result.available, false);
    assert.equal(result.reason, "authentication_failed");
    assert.doesNotMatch(JSON.stringify(result), /private|printnode-test-key/);
  }
});

test("packing submissions fail with actionable messages only for definitive unavailability", () => {
  assert.match(packingPrinterUnavailableMessage({ available: false, reason: "printer_offline" }), /offline/);
  assert.match(packingPrinterUnavailableMessage({ available: false, reason: "computer_disconnected" }), /disconnected/);
  assert.match(packingPrinterUnavailableMessage({ available: false, reason: "printer_missing" }), /cannot find/);
  assert.match(packingPrinterUnavailableMessage({ available: false, reason: "not_configured" }), /not configured/);
  assert.match(packingPrinterUnavailableMessage({ available: false, reason: "authentication_failed" }), /API key/);
  assert.equal(packingPrinterUnavailableMessage({ available: true, reason: "ready" }), "");
  assert.equal(packingPrinterUnavailableMessage({ available: null, reason: "lookup_failed" }), "");
});

test("authenticated status keeps a configured label separate from an unconfigured packing printer", async t => {
  const calls = [];
  installAdminPrintRuntime(t, {
    env: { PRINTNODE_LABEL_PRINTER_ID: String(LABEL_PRINTER_ID) },
    fetchImpl: async (url, options = {}) => {
      const request = { url: String(url), method: options.method || "GET" };
      calls.push(request);
      if (request.url.includes("/auth/v1/user")) return adminUserResponse();
      if (request.url === `https://api.printnode.com/printers/${LABEL_PRINTER_ID}`) {
        return jsonResponse([printer({
          id: LABEL_PRINTER_ID,
          computer: { id: 6789, name: "Private label computer", state: "connected" },
        })]);
      }
      throw new Error(`Unexpected external request: ${request.method} ${request.url}`);
    },
  });

  const response = await adminPrint(adminPrintRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    fulfillmentConfigured: false,
    labelConfigured: true,
    packing: {
      configured: false,
      printerAvailable: null,
      computerAvailable: null,
      available: false,
      reason: "not_configured",
    },
    label: {
      configured: true,
      printerAvailable: true,
      computerAvailable: true,
      available: true,
      reason: "ready",
    },
  });
  assert.deepEqual(calls.map(call => call.url), [
    `${SUPABASE_ORIGIN}/auth/v1/user`,
    `https://api.printnode.com/printers/${LABEL_PRINTER_ID}`,
  ]);
});

test("an offline packing printer returns 503 after validation but before PDF submission or audit", async t => {
  const calls = [];
  installAdminPrintRuntime(t, {
    env: {
      PRINTNODE_FULFILLMENT_PRINTER_ID: String(PRINTER_ID),
      PRINTNODE_LABEL_PRINTER_ID: String(LABEL_PRINTER_ID),
    },
    fetchImpl: async (url, options = {}) => {
      const request = {
        url: String(url),
        method: options.method || "GET",
        body: options.body || null,
      };
      calls.push(request);
      if (request.url.includes("/auth/v1/user")) return adminUserResponse();
      if (request.url.includes("/rest/v1/orders")) return printableOrderResponse();
      if (request.url.includes("/rest/v1/inventory_reservations")) {
        return committedAllocationsResponse();
      }
      if (request.url === `https://api.printnode.com/printers/${PRINTER_ID}`) {
        return jsonResponse([printer({ state: "offline" })]);
      }
      throw new Error(`Unexpected external request: ${request.method} ${request.url}`);
    },
  });

  const response = await adminPrint(adminPrintRequest("POST"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "The packing-slip printer is offline. Turn it on and wait for it to show online in PrintNode, then try again.",
  });
  const orderLoadIndex = calls.findIndex(call => call.url.includes("/rest/v1/orders"));
  const allocationsLoadIndex = calls.findIndex(call => call.url.includes("/rest/v1/inventory_reservations"));
  const readinessIndex = calls.findIndex(call => call.url === `https://api.printnode.com/printers/${PRINTER_ID}`);
  assert.ok(orderLoadIndex >= 0);
  assert.ok(allocationsLoadIndex >= 0);
  assert.ok(readinessIndex > orderLoadIndex);
  assert.ok(readinessIndex > allocationsLoadIndex);
  assert.equal(calls.some(call => call.url.includes("/printjobs")), false);
  assert.equal(calls.some(call => call.url.includes("/rpc/record_order_print_submission")), false);
});

test("an uncertain readiness lookup fails open and attempts the PrintNode job", async t => {
  const calls = [];
  const previousWarn = console.warn;
  const previousError = console.error;
  t.after(() => {
    console.warn = previousWarn;
    console.error = previousError;
  });
  console.warn = () => {};
  console.error = () => {};

  installAdminPrintRuntime(t, {
    env: {
      PRINTNODE_FULFILLMENT_PRINTER_ID: String(PRINTER_ID),
      PRINTNODE_LABEL_PRINTER_ID: String(LABEL_PRINTER_ID),
    },
    fetchImpl: async (url, options = {}) => {
      const request = {
        url: String(url),
        method: options.method || "GET",
        body: options.body || null,
      };
      calls.push(request);
      if (request.url.includes("/auth/v1/user")) return adminUserResponse();
      if (request.url.includes("/rest/v1/orders")) return printableOrderResponse();
      if (request.url.includes("/rest/v1/inventory_reservations")) {
        return committedAllocationsResponse();
      }
      if (request.url === `https://api.printnode.com/printers/${PRINTER_ID}`) {
        return jsonResponse({ error: "synthetic readiness outage" }, 503);
      }
      if (request.url === "https://api.printnode.com/printjobs") {
        return jsonResponse({ error: "synthetic print outage" }, 503);
      }
      throw new Error(`Unexpected external request: ${request.method} ${request.url}`);
    },
  });

  const response = await adminPrint(adminPrintRequest("POST"));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "PrintNode could not print the packing slip.",
  });
  assert.equal(calls.some(call => call.url.includes("/rest/v1/orders")), true);
  assert.equal(calls.some(call => call.url.includes("/rest/v1/inventory_reservations")), true);
  const printJob = calls.find(call => call.url === "https://api.printnode.com/printjobs");
  assert.equal(printJob?.method, "POST");
  const printPayload = JSON.parse(printJob.body);
  assert.equal(printPayload.printerId, PRINTER_ID);
  assert.equal(printPayload.contentType, "pdf_base64");
  assert.equal(Buffer.from(printPayload.content, "base64").subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(calls.some(call => call.url.includes("/rpc/record_order_print_submission")), false);
});

test("packing UI copy describes queue acceptance and explicit status refresh", () => {
  const site = readFileSync("site_1.jsx", "utf8");
  assert.match(site, /packing slip was queued in PrintNode/);
  assert.match(site, /Use Refresh above to check it again/);
  assert.doesNotMatch(site, /packing slip was sent to the printer/);
});
