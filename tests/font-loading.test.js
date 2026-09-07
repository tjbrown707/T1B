import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync("src/main.jsx", "utf8");
const siteSource = readFileSync("site_1.jsx", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const requiredWeights = {
  rajdhani: [300, 400, 500, 600, 700],
  orbitron: [400, 500, 600, 700, 800, 900],
};

test("every typography weight is bundled locally through the Vite entry point", () => {
  for (const [family, weights] of Object.entries(requiredWeights)) {
    for (const weight of weights) {
      assert.match(
        mainSource,
        new RegExp(`import ['"]@fontsource/${family}/${weight}\\.css['"]`),
        `${family} ${weight} must be included in the local font bundle`,
      );
    }
  }

  assert.equal(packageJson.dependencies["@fontsource/rajdhani"], "5.3.0");
  assert.equal(packageJson.dependencies["@fontsource/orbitron"], "5.3.0");
});

test("the application no longer injects an external font stylesheet", () => {
  assert.doesNotMatch(siteSource, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.doesNotMatch(siteSource, /Fonts via CDN/);
  assert.match(siteSource, /font-family:\s*'Rajdhani',\s*sans-serif/);
  assert.match(siteSource, /fontFamily:\s*"'Orbitron', sans-serif"/);
  assert.match(siteSource, /button, input, select, textarea \{ font-family: inherit; \}/);
});
