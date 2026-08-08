// Renders the real application in jsdom and reports what each route produced.
// The point is to catch the failure the build and the linter cannot see: a
// runtime throw that leaves the page blank.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

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
    rollupOptions: {
      input: "src/main.jsx",
      output: { format: "iife", entryFileNames: "app.js", inlineDynamicImports: true },
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
  { path: "/product/tesamorelin", expect: "re-checked" },   // withheld-summary notice
  { path: "/research", expect: "Research" },
  { path: "/research/bpc-157-mechanism-of-action", expect: "BPC-157" },
  { path: "/lab-results", expect: "Under re-verification" }, // the withheld panel
  { path: "/cart", expect: "Your cart is empty" },
  { path: "/calculator", expect: "Aliquot" },                 // relabelled calculator
  { path: "/login", expect: "Sign" },
  { path: "/no-such-page", expect: "PAGE NOT FOUND" },
];
let failures = 0;

for (const { path: route, expect } of ROUTES) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(`jsdomError: ${e.message}`));
  virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.join(" ")}`));

  const dom = new JSDOM(
    `<!doctype html><html><head></head><body><div id="root"></div></body></html>`,
    { url: `https://www.tierone.bio${route}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole }
  );
  const { window } = dom;

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
  const ok = hasContent && gateShowing && dismissed && errors.length === 0;
  if (!ok) failures++;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${route.padEnd(38)} ` +
    `content:${hasContent ? "y" : "N"} gate:${gateShowing ? "y" : "N"} dismissed:${dismissed ? "y" : "N"} ` +
    `${text.length}→${afterDismiss.length} chars`
  );
  if (!hasContent) console.log(`      ! expected to find "${expect}"`);
  for (const e of errors.slice(0, 4)) console.log(`      ! ${e.slice(0, 300)}`);
  dom.window.close();
}

console.log(failures === 0 ? "\nALL ROUTES RENDERED" : `\n${failures} ROUTE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
