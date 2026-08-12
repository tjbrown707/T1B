import { randomUUID } from "node:crypto";
import { authenticateOrderManager } from "./_shared/admin-auth.js";
import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { printNodeConfig, submitPrintNodeJob } from "./_shared/printnode.js";
import { ShippoError, shippoConfig, shippoRequest } from "./_shared/shippo.js";
import { DEFAULT_PARCEL } from "../../src/data/inventory.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIPPO_ID_PATTERN = /^[a-z0-9]{20,64}$/i;
const MAX_BODY_BYTES = 8 * 1024;
const METHODS = "GET, POST, OPTIONS";
const ORDER_FIELDS = [
  "id", "order_number", "payment_status", "fulfillment_status", "fulfillment_method", "customer_name",
  "customer_email", "customer_phone", "ship_address", "ship_city", "ship_state",
  "ship_zip",
].join(",");

export default async function handler(request) {
  if (request.method === "OPTIONS") return jsonResponse(204, null, METHODS);
  if (!["GET", "POST"].includes(request.method)) return fail(405, "Method not allowed");
  const auth = await authenticateOrderManager(request, fail);
  if (auth.response) return auth.response;

  const config = shippoConfig();
  if (request.method === "GET") {
    return jsonResponse(200, {
      configured: config.configured,
      defaultParcel: DEFAULT_PARCEL,
      missingSenderFields: config.configured ? [] : missingSenderFields(config),
    }, METHODS);
  }
  if (!config.configured) return fail(503, "Shippo and the sender address are not configured yet.");

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (parsed.error) return fail(parsed.error === "Request is too large." ? 413 : 400, parsed.error);
  const action = typeof parsed.data?.action === "string" ? parsed.data.action.trim() : "";
  const orderId = typeof parsed.data?.orderId === "string" ? parsed.data.orderId.trim() : "";
  if (!UUID_PATTERN.test(orderId)) return fail(400, "Invalid order id.");
  if (action === "get_rates") return getRates(auth, orderId, parsed.data, config);
  if (action === "buy_label") return buyLabel(auth, orderId, parsed.data);
  return fail(400, "Choose a valid shipping action.");
}

async function loadShippableOrder(auth, orderId) {
  const [orderResult, allocationsResult] = await Promise.all([
    auth.supabase.from("orders").select(ORDER_FIELDS).eq("id", orderId).maybeSingle(),
    auth.supabase
      .from("inventory_reservations")
      .select("state,inventory_lots(is_provisional,lot_number)")
      .eq("order_id", orderId),
  ]);
  if (orderResult.error || allocationsResult.error) throw orderResult.error || allocationsResult.error;
  if (!orderResult.data) return { error: "Order not found.", status: 404 };
  if (orderResult.data.fulfillment_method === "LOCAL_HANDOFF") {
    return { error: "This order is marked for local handoff and cannot create postage.", status: 409 };
  }
  if (orderResult.data.payment_status !== "PAID") return { error: "Confirm payment before creating a shipping label.", status: 409 };
  if (orderResult.data.fulfillment_status !== "PACKED") {
    return { error: "Mark the order picked and packed before creating its shipping label.", status: 409 };
  }
  if ((allocationsResult.data || []).length === 0) return { error: "This order has no inventory allocation.", status: 409 };
  if ((allocationsResult.data || []).some(allocation => allocation.state !== "COMMITTED")) {
    return { error: "Inventory has not been committed for this order.", status: 409 };
  }
  if ((allocationsResult.data || []).some(allocation => !allocation.inventory_lots
      || allocation.inventory_lots.is_provisional
      || !String(allocation.inventory_lots.lot_number || "").trim())) {
    return { error: "Replace provisional lot numbers before creating the shipping label.", status: 409 };
  }
  return { order: orderResult.data };
}

async function getRates(auth, orderId, body, config) {
  const parcel = validateParcel(body.parcel);
  if (parcel.error) return fail(400, parcel.error);
  let loaded;
  try {
    loaded = await loadShippableOrder(auth, orderId);
  } catch (error) {
    console.error("admin-shipping: order load failed:", error);
    return fail(500, "The order could not be loaded for shipping.");
  }
  if (loaded.error) return fail(loaded.status, loaded.error);
  const order = loaded.order;

  const { data: existing, error: existingError } = await auth.supabase
    .from("order_shipments")
    .select("status,provider_transaction_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existingError) return databaseError("existing shipment", existingError);
  if (existing?.provider_transaction_id) return fail(409, "A shipping label has already been purchased for this order.");
  if (existing?.status === "PURCHASING") return fail(409, "A label purchase is already in progress. Do not retry it yet.");

  let shipment;
  try {
    shipment = await shippoRequest("/shipments", {
      method: "POST",
      body: {
        address_from: config.addressFrom,
        address_to: {
          name: order.customer_name,
          street1: order.ship_address,
          city: order.ship_city,
          state: order.ship_state,
          zip: order.ship_zip,
          country: "US",
          phone: order.customer_phone,
          email: order.customer_email,
        },
        parcels: [{
          length: String(parcel.data.length),
          width: String(parcel.data.width),
          height: String(parcel.data.height),
          distance_unit: "in",
          weight: String(parcel.data.weight),
          mass_unit: "oz",
        }],
        metadata: order.order_number,
        async: false,
      },
    });
  } catch (error) {
    return shippoFailure(error, "Shipping rates could not be retrieved.");
  }

  if (shipment?.address_to?.validation_results?.is_valid === false) {
    const detail = validationMessages(shipment.address_to.validation_results);
    return fail(422, detail || "Shippo could not validate the customer's address.");
  }
  const rates = sanitiseRates(shipment?.rates);
  if (!SHIPPO_ID_PATTERN.test(shipment?.object_id || "") || rates.length === 0) {
    return fail(422, validationMessages({ messages: shipment?.messages }) || "No shipping rates were returned for this package.");
  }

  const { error: saveError } = await auth.supabase.from("order_shipments").upsert({
    order_id: orderId,
    provider: "shippo",
    status: "DRAFT",
    provider_shipment_id: shipment.object_id,
    provider_transaction_id: null,
    selected_rate_id: null,
    carrier: null,
    service_name: null,
    postage_amount: null,
    currency: null,
    tracking_number: null,
    tracking_url: null,
    label_url: null,
    parcel: parcel.data,
    rate_quotes: rates,
    quoted_at: new Date().toISOString(),
    purchase_token: null,
    purchase_started_at: null,
    error_message: null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "order_id" });
  if (saveError) return databaseError("rate quote", saveError);
  console.info(`admin-shipping: staff ${auth.user.id} rated ${order.order_number}`);
  return jsonResponse(200, { rates, parcel: parcel.data }, METHODS);
}

async function buyLabel(auth, orderId, body) {
  const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
  if (!SHIPPO_ID_PATTERN.test(rateId)) return fail(400, "Choose a valid shipping rate.");
  const { data: shipment, error } = await auth.supabase
    .from("order_shipments")
    .select("*,orders(order_number,payment_status,fulfillment_status,fulfillment_method)")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) return databaseError("shipment", error);
  if (!shipment) return fail(409, "Get current shipping rates before buying a label.");
  if (shipment.provider_transaction_id && shipment.label_url) {
    return jsonResponse(200, { shipment: publicShipment(shipment), alreadyPurchased: true }, METHODS);
  }
  if (shipment.status === "PURCHASING") {
    return fail(409, "A label purchase is already in progress. Check Shippo before trying again.");
  }
  if (shipment.orders?.fulfillment_method === "LOCAL_HANDOFF") {
    return fail(409, "This order is marked for local handoff and cannot create postage.");
  }
  if (shipment.orders?.payment_status !== "PAID") return fail(409, "Confirm payment before buying a label.");
  if (shipment.orders?.fulfillment_status !== "PACKED") return fail(409, "Mark the order packed before buying its label.");
  const quoteAge = Date.now() - new Date(shipment.quoted_at || 0).getTime();
  if (!Number.isFinite(quoteAge) || quoteAge < 0 || quoteAge > 2 * 60 * 60 * 1000) {
    return fail(409, "These rates have expired. Get current rates before buying the label.");
  }
  const chosenRate = (shipment.rate_quotes || []).find(rate => rate.id === rateId);
  if (!chosenRate) return fail(409, "That rate does not belong to this order. Get current rates and try again.");

  const purchaseToken = randomUUID();
  const { data: claimed, error: claimError } = await auth.supabase
    .from("order_shipments")
    .update({
      status: "PURCHASING",
      selected_rate_id: rateId,
      purchase_token: purchaseToken,
      purchase_started_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .in("status", ["DRAFT", "ERROR"])
    .is("provider_transaction_id", null)
    .select("id")
    .maybeSingle();
  if (claimError) return databaseError("label purchase lock", claimError);
  if (!claimed) return fail(409, "Another label purchase started first. Do not submit it again.");

  let transaction;
  try {
    transaction = await shippoRequest("/transactions", {
      method: "POST",
      body: {
        rate: rateId,
        async: false,
        label_file_type: "PDF_4x6",
        metadata: shipment.orders?.order_number || orderId,
      },
    });
  } catch (purchaseError) {
    if (purchaseError instanceof ShippoError && purchaseError.outcomeUnknown) {
      await auth.supabase.from("order_shipments").update({
        error_message: "Purchase outcome unknown; reconcile in Shippo before retrying.",
        updated_at: new Date().toISOString(),
      }).eq("order_id", orderId).eq("purchase_token", purchaseToken);
      console.error("admin-shipping: label outcome unknown; purchase left locked:", purchaseError);
      return fail(502, "The connection ended while Shippo was buying the label. Check Shippo before trying again so you are not charged twice.");
    }
    await auth.supabase.from("order_shipments").update({
      status: "ERROR",
      purchase_token: null,
      error_message: "Shippo rejected the label purchase.",
      updated_at: new Date().toISOString(),
    }).eq("order_id", orderId).eq("purchase_token", purchaseToken);
    return shippoFailure(purchaseError, "Shippo could not buy the label.");
  }

  const labelUrl = safeHttpsUrl(transaction?.label_url);
  const trackingUrl = safeHttpsUrl(transaction?.tracking_url_provider, true);
  const trackingNumber = typeof transaction?.tracking_number === "string"
    ? transaction.tracking_number.trim()
    : "";
  if (transaction?.status !== "SUCCESS"
      || !SHIPPO_ID_PATTERN.test(transaction?.object_id || "")
      || !labelUrl
      || trackingNumber.length < 1
      || trackingNumber.length > 160) {
    await auth.supabase.from("order_shipments").update({
      status: "ERROR",
      purchase_token: null,
      error_message: validationMessages({ messages: transaction?.messages }) || "Shippo did not create a usable label.",
      updated_at: new Date().toISOString(),
    }).eq("order_id", orderId).eq("purchase_token", purchaseToken);
    return fail(422, "Shippo did not create a usable label. Review the address and package details.");
  }

  const { data: completedData, error: completeError } = await auth.supabase.rpc(
    "complete_shippo_label_purchase",
    {
      p_order_id: orderId,
      p_purchase_token: purchaseToken,
      p_provider_transaction_id: transaction.object_id,
      p_carrier: chosenRate.provider,
      p_service_name: chosenRate.serviceName,
      p_postage_amount: Number(chosenRate.amount),
      p_currency: chosenRate.currency,
      p_tracking_number: trackingNumber,
      p_tracking_url: trackingUrl,
      p_label_url: labelUrl,
      p_actor_user_id: auth.user.id,
    },
  );
  const completed = Array.isArray(completedData) ? completedData[0] : completedData;
  if (completeError || !completed) {
    console.error("admin-shipping: label purchased but save failed:", completeError);
    return fail(500, "The label was purchased in Shippo but could not be completely saved. Do not buy it again; open Shippo and contact support.");
  }

  let print = { configured: false, printed: false };
  const printers = printNodeConfig();
  if (body.autoPrint !== false && printers.labelConfigured) {
    print = { configured: true, printed: false };
    try {
      const jobId = await submitPrintNodeJob({
        printerId: printers.labelPrinterId,
        title: `${shipment.orders?.order_number || orderId} - shipping label`,
        contentType: "pdf_uri",
        content: labelUrl,
      });
      print = { configured: true, printed: true, jobId };
      const { error: printEventError } = await auth.supabase.from("order_events").insert({
        order_id: orderId,
        event_type: "SHIPPING_LABEL_PRINTED",
        actor_user_id: auth.user.id,
        details: { printnode_job_id: jobId, automatic: true },
      });
      if (printEventError) console.error("admin-shipping: automatic print audit insert failed:", printEventError);
    } catch (printError) {
      console.error("admin-shipping: label saved but automatic print failed:", printError);
      print = { configured: true, printed: false, error: "The label was purchased but did not print automatically." };
    }
  }

  console.info(`admin-shipping: staff ${auth.user.id} bought label for ${shipment.orders?.order_number || orderId}`);
  return jsonResponse(200, { shipment: publicShipment(completed), print }, METHODS);
}

export function validateParcel(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : DEFAULT_PARCEL;
  const values = {
    length: Number(source.length),
    width: Number(source.width),
    height: Number(source.height),
    weight: Number(source.weight),
    distanceUnit: "in",
    massUnit: "oz",
  };
  if (![values.length, values.width, values.height].every(value => Number.isFinite(value) && value >= 0.1 && value <= 100)) {
    return { error: "Enter valid package dimensions." };
  }
  if (!Number.isFinite(values.weight) || values.weight < 0.1 || values.weight > 16) {
    return { error: "Enter a package weight between 0.1 and 16 ounces." };
  }
  return { data: values };
}

export function sanitiseRates(rawRates) {
  return (Array.isArray(rawRates) ? rawRates : [])
    .flatMap(rate => {
      const amount = Number(rate?.amount);
      const currency = String(rate?.currency || "").trim().toUpperCase();
      if (!SHIPPO_ID_PATTERN.test(rate?.object_id || "")
          || !Number.isFinite(amount)
          || amount < 0
          || amount >= 100000000
          || !/^[A-Z]{3}$/.test(currency)) return [];
      return [{
        id: rate.object_id,
        provider: String(rate.provider || "Carrier").slice(0, 80),
        serviceName: String(rate.servicelevel?.name || "Service").slice(0, 120),
        serviceToken: String(rate.servicelevel?.token || "").slice(0, 120),
        amount,
        currency,
        estimatedDays: Number.isFinite(Number(rate.estimated_days)) ? Number(rate.estimated_days) : null,
        durationTerms: String(rate.duration_terms || "").slice(0, 160),
        attributes: Array.isArray(rate.attributes) ? rate.attributes.map(String).slice(0, 10) : [],
      }];
    })
    .sort((a, b) => a.amount - b.amount);
}

function safeHttpsUrl(value, optional = false) {
  if ((value === null || value === undefined || value === "") && optional) return "";
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function publicShipment(shipment) {
  return {
    status: shipment.status,
    carrier: shipment.carrier,
    serviceName: shipment.service_name,
    postageAmount: shipment.postage_amount === null ? null : Number(shipment.postage_amount),
    currency: shipment.currency,
    trackingNumber: shipment.tracking_number,
    trackingUrl: shipment.tracking_url,
    labelUrl: shipment.label_url,
    parcel: shipment.parcel,
  };
}

function validationMessages(results) {
  return (Array.isArray(results?.messages) ? results.messages : [])
    .map(message => typeof message?.text === "string" ? message.text : "")
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

function shippoFailure(error, fallback) {
  const status = error instanceof ShippoError && error.status >= 400 && error.status < 500 ? 422 : 502;
  return fail(status, error instanceof ShippoError ? error.message : fallback);
}

function databaseError(operation, error) {
  console.error(`admin-shipping: ${operation} database failure:`, error);
  return fail(500, "Shipping information could not be saved.");
}

function missingSenderFields(config) {
  const labels = {
    name: "SHIP_FROM_NAME",
    street1: "SHIP_FROM_STREET1",
    city: "SHIP_FROM_CITY",
    state: "SHIP_FROM_STATE",
    zip: "SHIP_FROM_ZIP",
    country: "SHIP_FROM_COUNTRY",
    phone: "SHIP_FROM_PHONE",
    email: "SHIP_FROM_EMAIL",
  };
  const fields = Object.entries(labels)
    .filter(([field]) => !config.addressFrom[field])
    .map(([, env]) => env);
  if (!config.token) fields.unshift("SHIPPO_API_TOKEN");
  return fields;
}

export const config = {
  path: "/.netlify/functions/admin-shipping",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

function fail(status, error) {
  return jsonResponse(status, { error }, METHODS);
}
