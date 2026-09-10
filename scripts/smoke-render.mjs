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
    requireBody: ["RESEARCH PROFILE"],
    forbidBody: PRODUCT_REFERENCE_LABELS,
    signedIn: true,
  })),
  ...["/products", ...PRODUCTS.map(p => `/product/${p.id}`), "/lab-results", "/cart", "/calculator", "/checkout"].map(path => ({
    path,
    expect: "SIGN IN",
    exerciseLogin: path === "/product/bpc157-10",
    forbidBody: ["RESEARCH PROFILE", "ADD TO CART", "CERTIFICATES OF ANALYSIS", "Aliquot", "Continue as guest", ...PRODUCTS.map(p => p.name)],
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
  { path: "/lab-results", expect: "CERTIFICATES OF ANALYSIS", signedIn: true },
  { path: "/cart", expect: "Your cart is empty", signedIn: true },
  { path: "/calculator", expect: "Aliquot", signedIn: true },
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
  const fixtureUser = { id: "11111111-1111-4111-8111-111111111111", email: "researcher@example.com", role: "authenticated", app_metadata: {}, user_metadata: {}, email_confirmed_at: "2026-01-01T00:00:00Z" };
  const fixtureSession = {
    access_token: "smoke-access-token", refresh_token: "smoke-refresh-token", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: fixtureUser,
  };
  if (signedIn) {
    window.localStorage.setItem("sb-nmafhetkofrekabqawgb-auth-token", JSON.stringify(fixtureSession));
  }
  if (exerciseLogin) window.localStorage.setItem("t1b-cart", JSON.stringify([{ id: "bpc157-10", qty: 2 }]));
  window.fetch = async url => new Response(JSON.stringify(
    String(url).includes("/token") ? fixtureSession : String(url).includes("/orders") ? [] : {}
  ), { status: 200, headers: { "Content-Type": "application/json" } });
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
