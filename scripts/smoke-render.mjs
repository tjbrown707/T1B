// Renders the real application in jsdom and reports what each route produced.
// The point is to catch the failure the build and the linter cannot see: a
// runtime throw that leaves the page blank.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { SITE_NAME } from "../src/data/site.js";
import { PRODUCTS } from "../src/data/catalog.js";
import { requiresLogin } from "../src/data/access.js";
import { dealerQuote } from "../src/data/dealers.js";

// Inside node_modules so the throwaway bundle is never committed and never
// collides with the real dist/.
const OUT = process.env.SMOKE_OUT || "node_modules/.smoke-build";

await build({
  root: process.cwd(),
  logLevel: "error",
  plugins: [react()],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      input: "src/main.jsx",
      output: { format: "iife", entryFileNames: "app.js", codeSplitting: false },
    },
  },
});

const code = readFileSync(`${OUT}/app.js`, "utf8");

// Each route names something that must appear in the rendered output. A route
// that renders only the age gate, or throws and leaves an empty div, fails.
const PRODUCT_REFERENCE_LABELS = [
  "Peer-reviewed research",
  "Research on individual components",
  "Sources & References",
  "View Source ↗",
];

const ROUTES = [
  { path: "/", expect: "SIGN IN TO VIEW PRODUCTS", forbidBody: ["FEATURED COMPOUNDS", "ADD TO CART"] },
  { path: "/", expect: "FEATURED COMPOUNDS", signedIn: true },
  { path: "/products", expect: "BPC-157", signedIn: true },
  ...PRODUCTS.map(product => ({
    path: `/product/${product.id}`,
    expect: product.name,
    requireBody: ["RESEARCH PROFILE", ...(product.id === "bpc157-5" ? ["On Backorder", "October 2, 2026", "BACKORDER NOW"] : [])],
    forbidBody: [...PRODUCT_REFERENCE_LABELS, ...(product.id === "bpc157-5" ? [] : ["On Backorder", "BACKORDER NOW"])],
    signedIn: true,
  })),
  ...["/products", ...PRODUCTS.map(p => `/product/${p.id}`), "/lab-results", "/cart", "/checkout"].map(path => ({
    path,
    expect: "SIGN IN",
    exerciseLogin: path === "/product/bpc157-10",
    forbidBody: ["RESEARCH PROFILE", "ADD TO CART", "CERTIFICATES OF ANALYSIS", "Continue as guest", ...PRODUCTS.map(p => p.name)],
  })),
  {
    path: "/research",
    expect: "PAGE NOT FOUND",
    expectHeadRobots: "noindex, follow",
    forbidHead: ["Peer-reviewed research summaries"],
  },
  {
    path: "/research/bpc-157-mechanism-of-action",
    expect: "PAGE NOT FOUND",
    expectHeadRobots: "noindex, follow",
    forbidHead: ["BPC-157: Mechanism of Action"],
  },
  ...[false, true].map(signedIn => ({
    path: "/calculator",
    expect: "PAGE NOT FOUND",
    expectHeadRobots: "noindex, follow",
    forbidBody: ["Calculator", "Aliquot"],
    signedIn,
  })),
  { path: "/lab-results", expect: "CERTIFICATES OF ANALYSIS", signedIn: true },
  { path: "/cart", expect: "Your cart is empty", signedIn: true },
  { path: "/signup?redirect=%2Fproducts", expect: "CREATE ACCOUNT" },
  { path: "/reset-password", expect: "SET NEW PASSWORD" },
  { path: "/contact", expect: "Contact Us" },
  { path: "/privacy", expect: "Privacy" },
  { path: "/terms", expect: "Terms" },
  { path: "/login", expect: "Sign" },
  // Signed out, so this asserts the protected staff route reaches the normal
  // sign-in screen rather than throwing or leaking an order list.
  {
    path: "/admin/orders",
    expect: "Sign",
    expectHeadTitle: SITE_NAME,
    expectHeadRobots: "noindex, nofollow",
    forbidHead: ["Order Management", "Staff order management"],
  },
  {
    path: "/admin/inventory",
    expect: "Sign",
    expectHeadTitle: SITE_NAME,
    expectHeadRobots: "noindex, nofollow",
    forbidHead: ["Inventory Management", "Staff lot-level inventory management"],
  },
  {
    path: "/admin",
    expect: "Sign",
    expectHeadTitle: SITE_NAME,
    expectHeadRobots: "noindex, nofollow",
    forbidHead: ["Order Management", "Staff order management"],
  },
  { path: "/admin/orders", expect: "Change Delivery Method", signedIn: true, exerciseFulfillment: true },
  { path: "/admin/orders", expect: "Edit Amount Received", signedIn: true, exercisePaymentEmail: true },
  { path: "/admin/orders", expect: "Save Lot Assignment", signedIn: true, exerciseLotAssignment: true },
  { path: "/admin/inventory", expect: "RECEIVE A NEW LOT", signedIn: true, exerciseInventory: true },
  { path: '/dealer', expect: 'SIGN IN', forbidBody: ['Dealer orders', 'New customer order'] },
  { path: '/dealer', expect: 'New customer order', signedIn: true, exerciseDealer: true, requireBody: ['You keep 60%', 'Still owed to Tier One', 'Discount code'] },
  { path: '/dealer', expect: 'Dealer access has not been enabled', signedIn: true },
  { path: '/admin/dealers', expect: 'Sign', expectHeadTitle: SITE_NAME, expectHeadRobots: 'noindex, nofollow', forbidHead: ['Dealer Management'] },
  { path: '/admin/dealers', expect: 'does not have staff access', signedIn: true },
  { path: '/admin/dealers', expect: 'Find an existing customer', signedIn: true, exerciseDealersAdmin: true },
  { path: "/no-such-page", expect: "PAGE NOT FOUND" },
];
let failures = 0;

for (const {
  path: route,
  expect,
  expectHeadTitle = "",
  expectHeadRobots = "",
  forbidHead = [],
  forbidBody = [],
  requireBody = [],
  signedIn = false,
  exerciseLogin = false,
  exerciseFulfillment = false,
  exerciseLotAssignment = false,
  exercisePaymentEmail = false,
  exerciseInventory = false,
  exerciseDealer = false,
  exerciseDealersAdmin = false,
} of ROUTES) {
  const errors = [];
  const forbiddenHeadHits = new Set();
  const titleHistory = new Set();
  const robotsHistory = new Set();
  const adminRobotsHistory = new Set();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(`jsdomError: ${e.message}`));
  virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.join(" ")}`));

  const dom = new JSDOM(
    `<!doctype html><html><head></head><body><div id="root"></div></body></html>`,
    { url: `https://www.tierone.bio${route}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole }
  );
  const { window } = dom;
  const fixtureUser = { id: "11111111-1111-4111-8111-111111111111", email: "researcher@example.com", role: "authenticated", app_metadata: (exerciseFulfillment || exerciseLotAssignment || exercisePaymentEmail || exerciseInventory || exerciseDealersAdmin) ? { role: "admin" } : {}, user_metadata: {}, email_confirmed_at: "2026-01-01T00:00:00Z" };
  const fixtureSession = {
    access_token: "smoke-access-token", refresh_token: "smoke-refresh-token", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: fixtureUser,
  };
  if (signedIn) {
    window.localStorage.setItem("sb-nmafhetkofrekabqawgb-auth-token", JSON.stringify(fixtureSession));
  }
  if (exerciseLogin) window.localStorage.setItem("t1b-cart", JSON.stringify([{ id: "bpc157-10", qty: 2 }]));
  window.fetch = async url => new Response(JSON.stringify(
    String(url).includes("/product-availability") ? { products: PRODUCTS.map(product => ({ id: product.id, available: product.id === "bpc157-5" ? 0 : 50, estimatedShipDate: product.id === "bpc157-5" ? "2026-10-02" : null })) } : String(url).includes('/dealers') ? { dealer: null, orders: [], summary: {} } : String(url).includes("/token") ? fixtureSession : String(url).includes("/orders") ? [] : {}
  ), { status: 200, headers: { "Content-Type": "application/json" } });
  let fulfillmentRequest;
  let lotRequest;
  if (exerciseLotAssignment) {
    const oldId = "33333333-3333-4333-8333-333333333333", newId = "44444444-4444-4444-8444-444444444444";
    let order = { id: "22222222-2222-4222-8222-222222222222", order_number: "T1B-LOT-TEST", status: "PAID", payment_status: "PAID", fulfillment_status: "READY_TO_PICK", fulfillment_method: "SHIP", inventory_accounting_mode: "TRACKED", lot_assignment_version: 0, lot_selection_required: true, customer_name: "Test Customer", customer_email: "test@example.com", total: 100, items: [{ id: "glp3rt-10", name: "GLP-3RT", dose: "10 mg", qty: 3 }], allocations: [{ productId: "glp3rt-10", quantity: 3, state: "COMMITTED", lot: { id: newId, lot_number: "NEW-LOT", is_provisional: false } }], lot_choices: [{ productId: "glp3rt-10", quantity: 3, lots: [{ id: oldId, lotNumber: "OLD-LOT", capacity: 10, assigned: 0 }, { id: newId, lotNumber: "NEW-LOT", capacity: 20, assigned: 3 }] }] };
    window.fetch = async (url, options = {}) => {
      let payload = {};
      if (String(url).includes("/admin-orders")) {
        if (options.method === "PATCH") {
          lotRequest = JSON.parse(options.body);
          order = { ...order, lot_assignment_version: 1, lots_confirmed_at: new Date().toISOString(), lots_locked_at: new Date().toISOString(), lot_choices: [], packingSlipPrintRecorded: true, lot_selection_required: false, allocations: [{ productId: "glp3rt-10", quantity: 3, state: "COMMITTED", lot: { id: oldId, lot_number: "OLD-LOT", is_provisional: false } }] };
          payload = { order, packingSlip: { printed: true, jobId: 123 } };
        } else payload = { orders: [order], total: 1 };
      } else if (String(url).includes("/admin-print")) payload = { packing: { configured: true, available: true } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }
  if (exerciseFulfillment) {
    let order = { id: "22222222-2222-4222-8222-222222222222", order_number: "T1B-TEST", status: "PROCESSING", payment_status: "PAID", fulfillment_status: "PACKED", fulfillment_method: "SHIP", customer_name: "Test Customer", customer_email: "test@example.com", total: 100, payment_amount_received: 100, items: [], allocations: [] };
    window.fetch = async (url, options = {}) => {
      let payload = {};
      if (String(url).includes("/admin-orders")) {
        if (options.method === "PATCH") {
          fulfillmentRequest = JSON.parse(options.body);
          order = { ...order, fulfillment_method: fulfillmentRequest.fulfillmentMethod, fulfillment_status: "READY_TO_PICK" };
          payload = { order };
        } else payload = { orders: [order], total: 1 };
      } else if (String(url).includes("/admin-print")) payload = { packing: { configured: true, available: true } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }
  let paymentRequest;
  if (exercisePaymentEmail) {
    let order = { id: "22222222-2222-4222-8222-222222222222", order_number: "T1B-PAYMENT-TEST", status: "PAID", payment_status: "PAID", fulfillment_status: "ON_HOLD", backorder_pending: true, fulfillment_method: "SHIP", customer_name: "Test Customer", customer_email: "test@example.com", total: 180, payment_amount_received: 72, items: [], allocations: [], paymentEmails: [{ id: "old", payment_amount_received: 72, status: "SENT" }] };
    window.fetch = async (url, options = {}) => {
      let payload = {};
      if (String(url).includes("/admin-orders")) {
        if (options.method === "PATCH") {
          paymentRequest = JSON.parse(options.body);
          order = { ...order, payment_amount_received: Number(paymentRequest.paymentAmountReceived), paymentEmails: [...order.paymentEmails, { id: "new", payment_amount_received: Number(paymentRequest.paymentAmountReceived), status: "ERROR" }] };
          payload = { order, paymentEmail: { state: "QUEUED", sent: false, warning: "Payment is saved. The staff payment email is queued for automatic retry." } };
        } else payload = { orders: [order], total: 1 };
      } else if (String(url).includes("/admin-print")) payload = { packing: { configured: true, available: true } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }
  let inventoryRequest;
  if (exerciseInventory) {
    window.fetch = async (url, options = {}) => {
      let payload = {};
      if (String(url).includes("/admin-inventory")) {
        if (options.method === "POST") {
          inventoryRequest = JSON.parse(options.body);
          payload = { lot: { lot_number: "T1B-2ABC", received_quantity: inventoryRequest.quantity } };
        } else payload = { products: [{ product_id: "klow", product_name: "KLOW", dose: "80 mg", lots: [] }], movements: [] };
      }
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }
  const fixtureDealer = { user_id: fixtureUser.id, display_name: 'David', percent_off: 60, active: true };
  if (exerciseDealer || exerciseDealersAdmin) {
    window.localStorage.setItem('tierone-analytics-consent', 'denied');
    window.fetch = async (url, options = {}) => {
      if (String(url).includes('/validate-discount')) {
        const { code } = JSON.parse(options.body);
        const value = code === 'SAVE10' ? { valid: true, code, type: 'percent', value: 10, label: '10% off' }
          : code === 'FIX5' ? { valid: true, code, type: 'fixed', value: 5, label: '$5 off' }
          : code === 'SHIP4FREE' ? { valid: true, code, type: 'percent', value: 100, label: 'Free shipping' }
          : { valid: false, error: 'Invalid discount code.' };
        return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
      }
      const payload = String(url).includes('/dealers') ? String(url).includes('staff=1')
        ? { dealers: [fixtureDealer], customer: { id: fixtureUser.id, email: fixtureUser.email, full_name: 'David' } }
        : { dealer: fixtureDealer, orders: [], summary: { orders: 0, owed: 0 }, nextOffset: null }
        : String(url).includes('/product-availability') ? { products: PRODUCTS.map(product => ({ id: product.id, available: 50 })) }
        : String(url).includes('/profiles') ? { full_name: 'David', phone: '555-555-1212', address: '123 Test St', city: 'Phoenix', state: 'AZ', zip: '85001' } : {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }
  const transientBodyHits = new Set();
  const bodyObserver = new window.MutationObserver(() => {
    const bodyText = window.document.getElementById("root")?.textContent || "";
    for (const term of forbidBody) if (bodyText.includes(term)) transientBodyHits.add(term);
  });
  bodyObserver.observe(window.document.body, { subtree: true, childList: true, characterData: true });

  const recordForbiddenHeadValue = value => {
    forbidHead.filter(term => String(value).includes(term)).forEach(term => forbiddenHeadHits.add(term));
  };

  // MutationObserver reports the state at callback time, so two synchronous
  // assignments could otherwise collapse into one observation. Intercept the
  // setters as well to capture every title and metadata value exactly when the
  // application writes it.
  const titleDescriptor = Object.getOwnPropertyDescriptor(window.Document.prototype, "title");
  if (!titleDescriptor?.get || !titleDescriptor?.set) {
    errors.push("document.title accessors are unavailable");
  } else {
    Object.defineProperty(window.document, "title", {
      configurable: true,
      get() { return titleDescriptor.get.call(this); },
      set(value) {
        titleHistory.add(String(value));
        recordForbiddenHeadValue(value);
        titleDescriptor.set.call(this, value);
      },
    });
  }

  const setAttribute = window.Element.prototype.setAttribute;
  window.Element.prototype.setAttribute = function setAttributeAndRecord(name, value) {
    if (this.tagName === "META" && name === "content") {
      const key = this.getAttribute("name") || this.getAttribute("property");
      if (key === "robots") {
        robotsHistory.add(String(value));
        if (/^\/admin(?:\/|$)/.test(window.location.pathname)) adminRobotsHistory.add(String(value));
      }
      recordForbiddenHeadValue(value);
    }
    return setAttribute.call(this, name, value);
  };

  // Staff routes start as generic empty shells. Also watch structural changes
  // across the whole mount and anonymous-user redirect.
  const inspectHead = () => {
    titleHistory.add(window.document.title);
    const robots = window.document.head.querySelector('meta[name="robots"]')?.getAttribute("content");
    if (robots) robotsHistory.add(robots);
    const head = `${window.document.title}\n${window.document.head.innerHTML}`;
    recordForbiddenHeadValue(head);
  };
  const headObserver = new window.MutationObserver(inspectHead);
  headObserver.observe(window.document.head, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  inspectHead();

  // Browser APIs jsdom does not implement that this app touches.
  window.scrollTo = () => {};
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {} unobserve() {} disconnect() {}
  };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  if (!window.fetch) window.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  if (!window.crypto?.getRandomValues) {
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: { getRandomValues: (a) => a.fill(1) },
    });
  }

  try {
    window.eval(code);
    // React 19 renders synchronously enough for a mount, but let effects flush.
    await new Promise(r => setTimeout(r, 250));
  } catch (err) {
    errors.push(`THREW: ${err.message}`);
  }

  const root = window.document.getElementById("root");
  const text = (root?.textContent || "").replace(/\s+/g, " ").trim();

  // The age gate must be an overlay, not a replacement: the page underneath is
  // expected to have rendered even while the gate is still up.
  const gateShowing = text.includes("AGE VERIFICATION");
  const hasContent = text.includes(expect);
  const heroBackground = route === "/"
    ? [...window.document.querySelectorAll("div")]
      .find(el => el.style.backgroundImage.includes("hero-lab-corridor-logo-v2.webp"))
    : null;
  const heroFillsDesktop = route !== "/" || (
    heroBackground?.style.backgroundSize === "cover" &&
    heroBackground?.style.backgroundPosition === "center top"
  );

  // Now dismiss the gate the way a visitor would and confirm the page survives.
  let afterDismiss = "";
  try {
    const confirmButton = [...window.document.querySelectorAll("button")]
      .find(b => /yes|18|enter|confirm/i.test(b.textContent || ""));
    if (confirmButton) {
      confirmButton.click();
      await new Promise(r => setTimeout(r, 120));
    }
    afterDismiss = (root?.textContent || "").replace(/\s+/g, " ").trim();
  } catch (err) {
    errors.push(`dismiss threw: ${err.message}`);
  }



  const dismissed = afterDismiss.length > 0 && !afterDismiss.includes("AGE VERIFICATION");
  bodyObserver.disconnect();
  const forbiddenBodyHits = forbidBody.filter(term => text.includes(term) || afterDismiss.includes(term) || transientBodyHits.has(term));
  if (!signedIn && requiresLogin(route) && !route.startsWith("/research")) {
    if (window.location.pathname !== "/login" || new URLSearchParams(window.location.search).get("redirect") !== route) {
      errors.push("Protected URL did not preserve its destination through sign-in");
    }
  }
  const missingBodyTerms = requireBody.filter(term => !afterDismiss.includes(term));
  inspectHead();
  headObserver.disconnect();
  const privateHeadClean = forbiddenHeadHits.size === 0;
  const expectedHeadSeen = !expectHeadTitle || titleHistory.has(expectHeadTitle);
  const expectedRobotsSeen = !expectHeadRobots || robotsHistory.has(expectHeadRobots);
  const privateRobotsClean = !expectHeadRobots
    || [...adminRobotsHistory].every(value => value === expectHeadRobots);
  const publicBodyClean = forbiddenBodyHits.length === 0 && missingBodyTerms.length === 0;
  if (exerciseDealer) {
    try {
      const add = [...window.document.querySelectorAll('button')].find(button => button.textContent === 'Add product');
      add.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const quote = dealerQuote([{ id: PRODUCTS[0].id, qty: 1 }], 60);
      const dealerText = root.textContent;
      for (const value of [quote.customerTotal, quote.dealerTotal, quote.retained]) {
        if (!dealerText.includes(`$${value.toFixed(2)}`)) throw new Error('Dealer quote does not reconcile with shared pricing');
      }
      const deliverySelect = [...window.document.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === 'LOCAL_HANDOFF'));
      if (deliverySelect.value !== 'LOCAL_HANDOFF') throw new Error('Dealer pickup is not the default');
      deliverySelect.value = 'SHIP_TO_CUSTOMER';
      deliverySelect.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 80));
      const tick = () => new Promise(resolve => setTimeout(resolve, 80));
      const button = label => [...window.document.querySelectorAll('button')].find(element => element.textContent === label);
      const applyCode = async code => {
        const input = window.document.querySelector('input[aria-label="Dealer discount code"]');
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, code);
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        await tick(); button('Apply code').click(); await tick();
      };
      await applyCode('INVALID');
      if (!root.textContent.includes('Invalid discount code.')) throw new Error('Invalid dealer code has no error');
      await applyCode('SAVE10');
      const discounted = dealerQuote([{ id: PRODUCTS[0].id, qty: 1 }], 60, 'SHIP_TO_CUSTOMER', { discount: { type: 'percent', value: 10 } });
      for (const amount of [discounted.customerTotal, discounted.dealerTotal, discounted.retained]) {
        if (!root.textContent.includes(`$${amount.toFixed(2)}`)) throw new Error('Discounted dealer quote is incorrect');
      }
      await applyCode('SHIP4FREE');
      if (!root.textContent.includes('Shipping: $0.00')) throw new Error('Dealer shipping code did not waive shipping');
      button('Remove code SAVE10').click(); await tick();
      await applyCode('FIX5');
      const fixed = dealerQuote([{ id: PRODUCTS[0].id, qty: 1 }], 60, 'SHIP_TO_CUSTOMER', { discount: { type: 'fixed', value: 5 }, freeShipping: true });
      for (const amount of [fixed.customerTotal, fixed.dealerTotal, fixed.retained]) {
        if (!root.textContent.includes(`$${amount.toFixed(2)}`)) throw new Error('Fixed dealer quote is incorrect');
      }
      button('Remove code FIX5').click(); button('Remove code SHIP4FREE').click(); await tick();
      if (!root.textContent.includes('Recipient name')) throw new Error('Direct shipping form is missing');
      deliverySelect.value = 'LOCAL_HANDOFF';
      deliverySelect.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 80));
      if (process.env.DEALER_PREVIEW_DIR) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(`${process.env.DEALER_PREVIEW_DIR}/dealer.html`, window.document.documentElement.outerHTML.replace('<head>', '<head><meta charset="utf-8">'));
      }
    } catch (error) { errors.push(error.message); }
  }
  if (exerciseDealersAdmin) {
    try {
      [...window.document.querySelectorAll('button')].find(button => button.textContent.includes('David · 60% off')).click();
      await new Promise(resolve => setTimeout(resolve, 80));
      if (!root.textContent.includes('Save dealer settings')) throw new Error('Dealer settings did not open');
      if (process.env.DEALER_PREVIEW_DIR) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(`${process.env.DEALER_PREVIEW_DIR}/admin-dealers.html`, window.document.documentElement.outerHTML.replace('<head>', '<head><meta charset="utf-8">'));
      }
    } catch (error) { errors.push(error.message); }
  }
  if (exercisePaymentEmail) {
    try {
      const button = label => [...window.document.querySelectorAll("button")].find(el => el.textContent === label);
      const tick = () => new Promise(resolve => setTimeout(resolve, 80));
      if (!root.textContent.includes("Sent to sales@tierone.bio")) throw new Error("Sent payment email state is missing");
      button("Edit Amount Received").click();
      await tick();
      const input = window.document.querySelector('input[aria-label="Actual amount received"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "64");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      await tick();
      button("Save Amount").click();
      await tick();
      if (paymentRequest?.action !== "update_payment_amount" || paymentRequest?.expectedPaymentAmount !== 72 || Number(paymentRequest?.paymentAmountReceived) !== 64) throw new Error("Incorrect amount correction request");
      if (!root.textContent.includes("Payment is saved. The staff payment email is queued for automatic retry.")) throw new Error("Saved-payment email warning is missing");
      if (!root.textContent.includes("Queued for automatic retry")) throw new Error("Persistent email retry status is missing");
      if (window.document.querySelector('[aria-label="Actual amount received"]')) throw new Error("Email failure kept the saved-payment dialog open");
    } catch (error) { errors.push(`Payment email UI: ${error.message}`); }
  }
  if (exerciseFulfillment) {
    try {
      const clickButton = label => {
        const button = [...window.document.querySelectorAll("button")].find(el => el.textContent === label);
        if (!button || button.disabled) throw new Error(`Missing enabled button: ${label}`);
        button.click();
      };
      const tick = () => new Promise(resolve => setTimeout(resolve, 80));
      clickButton("Change Delivery Method");
      await tick();
      window.document.querySelectorAll('input[name^="delivery-method-"]')[1].click();
      await tick();
      clickButton("Save Delivery Method");
      await tick();
      if (fulfillmentRequest?.action !== "update_fulfillment_method" || fulfillmentRequest?.expectedFulfillmentMethod !== "SHIP" || fulfillmentRequest?.fulfillmentMethod !== "LOCAL_HANDOFF") throw new Error("Incorrect fulfillment update request");
      if (!root.textContent.includes("changed to local handoff")) throw new Error("Saved handoff missing");
      clickButton("Change Delivery Method");
      await tick();
      window.document.querySelectorAll('input[name^="delivery-method-"]')[0].click();
      await tick();
      clickButton("Save Delivery Method");
      await tick();
      if (fulfillmentRequest?.expectedFulfillmentMethod !== "LOCAL_HANDOFF" || fulfillmentRequest?.fulfillmentMethod !== "SHIP") throw new Error("Incorrect reverse fulfillment update");
      if (!root.textContent.includes("changed to shipping")) throw new Error("Saved shipping missing");
    } catch (error) { errors.push(`Fulfillment switch: ${error.message}`); }
  }
  if (exerciseLotAssignment) {
    try {
      const tick = () => new Promise(resolve => setTimeout(resolve, 80));
      const button = label => [...window.document.querySelectorAll("button")].find(el => el.textContent === label);
      if (button("Mark Picked")) throw new Error("Picking available before lot assignment");
      if (!button("Print Packing Slip")?.disabled) throw new Error("Printing available before lot assignment");
      const oldInput = window.document.querySelector('input[aria-label="Vials from lot OLD-LOT for glp3rt-10"]');
      const newInput = window.document.querySelector('input[aria-label="Vials from lot NEW-LOT for glp3rt-10"]');
      if (!oldInput || oldInput.value !== "0" || newInput?.value !== "0") throw new Error("Multiple lots must require explicit quantities");
      oldInput.closest("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await tick();
      if (lotRequest || !root.textContent.includes("Assign exactly 3 vials")) throw new Error("Incorrect quantity reached server");
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(oldInput, "3");
      oldInput.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      oldInput.closest("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await tick();
      if (lotRequest?.action !== "assign_lots" || lotRequest?.expectedLotAssignmentVersion !== 0 || lotRequest?.assignments.length !== 1 || lotRequest?.assignments[0].quantity !== 3 || lotRequest?.assignments[0].lotId !== "33333333-3333-4333-8333-333333333333") throw new Error("Incorrect lot assignment request");
      if (!button("Mark Picked") || button("Print Packing Slip")?.disabled || !root.textContent.includes("shipment lots saved") || !root.textContent.includes("automatically queued in PrintNode")) throw new Error("Lot selection did not queue printing and unlock picking");
      if (button("Change Lots") || button("Save Lot Assignment")) throw new Error("Lots remained editable after automatic print lock");
    } catch (error) { errors.push(`Lot assignment: ${error.message}`); }
  }
  if (exerciseInventory) {
    try {
      const tick = () => new Promise(resolve => setTimeout(resolve, 80));
      [...window.document.querySelectorAll("button")].find(el => el.textContent.includes("RECEIVE A NEW LOT")).click();
      await tick();
      if (root.textContent.includes("Supplier batch ID") || !root.textContent.includes("Expires two years") || !root.textContent.includes("Tier One BioSystems HQ")) throw new Error("Receiving defaults missing");
      const checkbox = window.document.querySelector('input[type="checkbox"]');
      if (!checkbox.checked || !root.textContent.includes("T1B-XXXX")) throw new Error("Automatic lot ID is not the default");
      checkbox.click();
      await tick();
      if (!window.document.querySelector('input[aria-label="Lot number"]')) throw new Error("Manual option missing");
      checkbox.click();
      await tick();
      const select = window.document.querySelector("select");
      select.value = "klow";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
      const quantity = window.document.querySelector('input[type="number"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(quantity, "500");
      quantity.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      quantity.closest("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await tick();
      if (inventoryRequest?.lotNumber !== "" || inventoryRequest?.quantity !== 500 || inventoryRequest?.productId !== "klow") throw new Error("Incorrect receive request");
      if (!root.textContent.includes("Lot T1B-2ABC received: 500 vials added.")) throw new Error("Assigned ID missing from confirmation");
    } catch (error) { errors.push(`Automatic lot receipt: ${error.message}`); }
  }
  if (exerciseLogin) {
    try {
      const setInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      for (const [id, value] of [["auth-email", fixtureUser.email], ["auth-password", "mock-password-only"]]) {
        const input = window.document.getElementById(id);
        setInput.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      }
      window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 250));
      if (window.location.pathname !== route || !root.textContent.includes("RESEARCH PROFILE")) errors.push("Successful sign-in did not return to the requested product");
      window.history.pushState(null, "", "/account");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      await new Promise(resolve => setTimeout(resolve, 120));
      const signOut = [...window.document.querySelectorAll("button")].find(button => button.textContent === "Sign Out");
      if (!signOut) throw new Error("Sign Out button was not available");
      signOut.click();
      await new Promise(resolve => setTimeout(resolve, 150));
      window.history.pushState(null, "", route);
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      await new Promise(resolve => setTimeout(resolve, 120));
      if (window.location.pathname !== "/login" || root.textContent.includes("RESEARCH PROFILE")) errors.push("Signing out failed to close the product gate");
      if (JSON.parse(window.localStorage.getItem("t1b-cart"))[0]?.qty !== 2) errors.push("Sign-in/sign-out lost the saved cart");
    } catch (error) { errors.push(`Login journey: ${error.message}`); }
  }
  const ok = hasContent && gateShowing && dismissed && heroFillsDesktop && privateHeadClean && publicBodyClean && expectedHeadSeen && expectedRobotsSeen && privateRobotsClean && errors.length === 0;
  if (!ok) failures++;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${route.padEnd(38)} ${signedIn ? "signed-in " : "signed-out "}` +
    `content:${hasContent ? "y" : "N"} gate:${gateShowing ? "y" : "N"} dismissed:${dismissed ? "y" : "N"} ` +
    `head:${privateHeadClean && expectedHeadSeen && expectedRobotsSeen && privateRobotsClean ? "y" : "N"} ` +
    `${text.length}→${afterDismiss.length} chars`
  );
  if (!hasContent) console.log(`      ! expected to find "${expect}"`);
  if (!heroFillsDesktop) console.log("      ! hero background no longer fills the desktop viewport");
  if (!privateHeadClean) console.log(`      ! private head metadata appeared: ${[...forbiddenHeadHits].join(", ")}`);
  if (forbiddenBodyHits.length) console.log(`      ! hidden product references appeared: ${forbiddenBodyHits.join(", ")}`);
  if (missingBodyTerms.length) console.log(`      ! expected product details disappeared: ${missingBodyTerms.join(", ")}`);
  if (!expectedHeadSeen) console.log(`      ! expected the title history to include "${expectHeadTitle}"`);
  if (!expectedRobotsSeen) console.log(`      ! expected the robots history to include "${expectHeadRobots}"`);
  if (!privateRobotsClean) console.log(`      ! staff route exposed other robots values: ${[...adminRobotsHistory].join(", ")}`);
  for (const e of errors.slice(0, 4)) console.log(`      ! ${e.slice(0, 300)}`);
  dom.window.close();
}

console.log(failures === 0 ? "\nALL ROUTES RENDERED" : `\n${failures} ROUTE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
