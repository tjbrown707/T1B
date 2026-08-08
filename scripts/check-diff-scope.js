#!/usr/bin/env node
// Gate 1 of the automated-article pipeline: confines a research-article PR to
// the article data and nothing else.
//
// WHY THIS IS THE IMPORTANT ONE
//   The article agent browses the web to find real citations, so every run
//   feeds it untrusted text, and a web page can contain instructions aimed at
//   the model reading it. Telling the agent "only touch articles" is a
//   suggestion. This is the enforcement: even a fully hijacked agent cannot
//   land a change to checkout, the discount functions, the CSP or
//   supabaseClient.js, because the diff is rejected before it can merge.
//
// Usage:  node scripts/check-diff-scope.js [baseRef]
// Default baseRef is origin/main.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE_REF = process.argv[2] || "origin/main";

// site_1.jsx is allowed only between the sentinels; sitemap.xml is allowed
// wholesale because a new article needs its <url> entry.
const ALLOWED_FILES = new Set(["site_1.jsx", "public/sitemap.xml"]);
const START_MARKER = "// ARTICLES:START";
const END_MARKER = "// ARTICLES:END";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function articlesBounds() {
  const lines = readFileSync("site_1.jsx", "utf8").split("\n");
  const start = lines.findIndex(l => l.startsWith(START_MARKER));
  const end = lines.findIndex(l => l.startsWith(END_MARKER));
  if (start === -1 || end === -1 || end <= start) {
    // Removing the markers must fail closed, not open. Otherwise deleting one
    // line would disable the whole check.
    throw new Error(
      "ARTICLES:START / ARTICLES:END markers missing or out of order in site_1.jsx.\n" +
      "  They delimit the only region an automated article PR may modify."
    );
  }
  return { start: start + 1, end: end + 1 }; // 1-indexed to match git
}

const failures = [];

// --- Which files changed? ----------------------------------------------------
const changedFiles = git(["diff", "--name-only", `${BASE_REF}...HEAD`])
  .split("\n").map(s => s.trim()).filter(Boolean);

if (changedFiles.length === 0) {
  console.error("check-diff-scope: no changes against " + BASE_REF);
  process.exit(1);
}

for (const file of changedFiles) {
  if (!ALLOWED_FILES.has(file)) {
    failures.push({
      file,
      detail: "file is outside the article scope; only site_1.jsx (article region) and public/sitemap.xml may change",
    });
  }
}

// --- Which lines of site_1.jsx changed? --------------------------------------
if (changedFiles.includes("site_1.jsx")) {
  const { start, end } = articlesBounds();

  // --unified=0 so each hunk header names exactly the changed lines rather
  // than a window of surrounding context.
  const diff = git(["diff", "--unified=0", `${BASE_REF}...HEAD`, "--", "site_1.jsx"]);

  for (const line of diff.split("\n")) {
    const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!header) continue;
    const firstLine = Number(header[1]);
    const count = header[2] === undefined ? 1 : Number(header[2]);
    if (count === 0) continue; // pure deletion; the -range check below covers it
    const lastLine = firstLine + count - 1;

    if (firstLine < start || lastLine > end) {
      failures.push({
        file: "site_1.jsx",
        detail: `changed lines ${firstLine}-${lastLine} fall outside the article region (lines ${start}-${end})`,
      });
    }
  }

  // A deletion leaves no added lines, so it produces a +N,0 hunk that the
  // check above skips. Catch those separately using the pre-image range.
  const preImage = git(["diff", "--unified=0", `${BASE_REF}...HEAD`, "--", "site_1.jsx"]);
  for (const line of preImage.split("\n")) {
    const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
    if (!header) continue;
    const addedCount = header[3] === undefined ? 1 : Number(header[3]);
    if (addedCount !== 0) continue; // handled above
    const delStart = Number(header[1]);
    const delCount = header[2] === undefined ? 1 : Number(header[2]);
    const delEnd = delStart + delCount - 1;
    // Compare against the base file's own markers, not the head's.
    const baseFile = git(["show", `${BASE_REF}:site_1.jsx`]).split("\n");
    const bStart = baseFile.findIndex(l => l.startsWith(START_MARKER)) + 1;
    const bEnd = baseFile.findIndex(l => l.startsWith(END_MARKER)) + 1;
    if (bStart === 0 || bEnd === 0 || delStart < bStart || delEnd > bEnd) {
      failures.push({
        file: "site_1.jsx",
        detail: `deleted lines ${delStart}-${delEnd} fall outside the article region`,
      });
    }
  }
}

if (failures.length > 0) {
  console.error("");
  console.error("  BLOCKED — this PR changes more than research articles");
  console.error("  " + "─".repeat(62));
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.detail}`);
    console.error("");
  }
  console.error("  An automated article PR may only add entries to the ARTICLES array");
  console.error("  and their sitemap URLs. Anything else needs a human.");
  console.error("");
  process.exit(1);
}

console.log(`check-diff-scope: ${changedFiles.length} file(s) changed, all within article scope`);
