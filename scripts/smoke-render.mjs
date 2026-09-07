// Renders the real application in jsdom and reports what each route produced.
// The point is to catch the failure the build and the linter cannot see: a
// runtime throw that leaves the page blank.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { SITE_NAME } from "../src/data/site.js";
import { RESEARCH_LIBRARY_ENABLED } from "../src/data/routes.js";

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
const ROUTES = [
  { path: "/", expect: "Tier One" },
  { path: "/products", expect: "BPC-157" },
  { path: "/product/bpc157-10", expect: "BPC-157" },
  { path: "/product/tesamorelin", expect: "CERTIFICATE OF ANALYSIS" }, // summary now reconciles
  {
    path: "/research",
    expect: RESEARCH_LIBRARY_ENABLED ? "BPC-157: Mechanism of Action" : "PAGE NOT FOUND",
    expectHeadRobots: RESEARCH_LIBRARY_ENABLED ? "" : "noindex, follow",
    forbidHead: RESEARCH_LIBRARY_ENABLED ? [] : ["Peer-reviewed research summaries"],
  },
  {
    path: "/research/bpc-157-mechanism-of-action",
    expect: RESEARCH_LIBRARY_ENABLED ? "BPC-157" : "PAGE NOT FOUND",
    expectHeadRobots: RESEARCH_LIBRARY_ENABLED ? "" : "noindex, follow",
    forbidHead: RESEARCH_LIBRARY_ENABLED ? [] : ["BPC-157: Mechanism of Action"],
  },
  { path: "/lab-results", expect: "CERTIFICATES OF ANALYSIS" },
  { path: "/cart", expect: "Your cart is empty" },
  { path: "/calculator", expect: "Aliquot" },                 // relabelled calculator
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
  inspectHead();
  headObserver.disconnect();
  const privateHeadClean = forbiddenHeadHits.size === 0;
  const expectedHeadSeen = !expectHeadTitle || titleHistory.has(expectHeadTitle);
  const expectedRobotsSeen = !expectHeadRobots || robotsHistory.has(expectHeadRobots);
  const privateRobotsClean = !expectHeadRobots
    || [...adminRobotsHistory].every(value => value === expectHeadRobots);
  const ok = hasContent && gateShowing && dismissed && heroFillsDesktop && privateHeadClean && expectedHeadSeen && expectedRobotsSeen && privateRobotsClean && errors.length === 0;
  if (!ok) failures++;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${route.padEnd(38)} ` +
    `content:${hasContent ? "y" : "N"} gate:${gateShowing ? "y" : "N"} dismissed:${dismissed ? "y" : "N"} ` +
    `head:${privateHeadClean && expectedHeadSeen && expectedRobotsSeen && privateRobotsClean ? "y" : "N"} ` +
    `${text.length}→${afterDismiss.length} chars`
  );
  if (!hasContent) console.log(`      ! expected to find "${expect}"`);
  if (!heroFillsDesktop) console.log("      ! hero background no longer fills the desktop viewport");
  if (!privateHeadClean) console.log(`      ! private head metadata appeared: ${[...forbiddenHeadHits].join(", ")}`);
  if (!expectedHeadSeen) console.log(`      ! expected the title history to include "${expectHeadTitle}"`);
  if (!expectedRobotsSeen) console.log(`      ! expected the robots history to include "${expectHeadRobots}"`);
  if (!privateRobotsClean) console.log(`      ! staff route exposed other robots values: ${[...adminRobotsHistory].join(", ")}`);
  for (const e of errors.slice(0, 4)) console.log(`      ! ${e.slice(0, 300)}`);
  dom.window.close();
}

console.log(failures === 0 ? "\nALL ROUTES RENDERED" : `\n${failures} ROUTE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
