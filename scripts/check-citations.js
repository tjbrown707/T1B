#!/usr/bin/env node
// Gate 2 of the automated-article pipeline: every citation a PR adds must
// point at a record that actually exists.
//
// WHY
//   A language model asked for sources will produce PMIDs that look exactly
//   like real ones. On a page selling the compound being cited, a fabricated
//   reference is the worst failure this pipeline could ship -- it is the thing
//   a reader is least able to check and most likely to trust. So the check is
//   not "does this look like a citation" but "does NCBI return this record".
//
// Resolution goes through NCBI E-utilities rather than scraping the public
// pages, because a 200 from pubmed.ncbi.nlm.nih.gov does not mean the record
// exists -- unknown IDs still render a page.
//
// Usage:  node scripts/check-citations.js [baseRef]

import { execFileSync } from "node:child_process";

const BASE_REF = process.argv[2] || "origin/main";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

// Only added lines matter. Citations already on main were reviewed when they
// landed, and re-checking them would fail the build for reasons unrelated to
// this PR (a record withdrawn upstream, say).
const addedLines = git(["diff", `${BASE_REF}...HEAD`])
  .split("\n")
  .filter(l => l.startsWith("+") && !l.startsWith("+++"))
  .map(l => l.slice(1));

const pmids = new Set();
const pmcids = new Set();
// id -> the title the article claims for it, so a real-but-wrong ID is caught.
const claimedTitles = new Map();

for (const line of addedLines) {
  const titleMatch = line.match(/title:\s*"((?:[^"\\]|\\.)*)"/);
  const claimed = titleMatch ? titleMatch[1] : null;
  const idsOnLine = [];
  for (const m of line.matchAll(/PMID:\s*(\d{4,9})/g)) { pmids.add(m[1]); idsOnLine.push(m[1]); }
  for (const m of line.matchAll(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})/g)) { pmids.add(m[1]); idsOnLine.push(m[1]); }
  for (const m of line.matchAll(/\b(PMC\d{5,9})\b/g)) { pmcids.add(m[1]); idsOnLine.push(m[1]); }
  if (claimed) for (const id of idsOnLine) if (!claimedTitles.has(id)) claimedTitles.set(id, claimed);
}

// Compare on significant words rather than exact strings. Real citations differ
// from NCBI's record in punctuation, subtitle, and trailing period, and failing
// on that would make the gate noise. A genuinely different paper shares almost
// no vocabulary, so the signal survives a lenient threshold.
const STOPWORDS = new Set(["the","a","an","of","and","or","in","on","for","to","with","by","via","its","is","are","as","at","from","that","this"]);
function significantWords(text) {
  return new Set(
    String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}
function titleOverlap(claimed, actual) {
  const a = significantWords(claimed);
  const b = significantWords(actual);
  if (a.size === 0 || b.size === 0) return 1; // nothing to compare; don't fail on it
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}
const TITLE_MATCH_THRESHOLD = 0.4;

if (pmids.size === 0 && pmcids.size === 0) {
  console.log("check-citations: no new citations in this diff");
  process.exit(0);
}

async function resolve(db, ids) {
  // One batched request rather than one per ID: NCBI asks for no more than a
  // few requests per second, and a 12-source article would otherwise sail past
  // that and start getting throttled responses that look like failures.
  const url = `${ESUMMARY}?db=${db}&id=${[...ids].join(",")}&retmode=json`;
  const res = await fetch(url, { headers: { "User-Agent": "tierone-bio-citation-check" } });
  if (!res.ok) {
    throw new Error(`NCBI returned ${res.status} for db=${db}`);
  }
  const data = await res.json();
  const result = data?.result || {};
  const found = new Map();
  for (const id of ids) {
    const key = db === "pmc" ? id.replace(/^PMC/, "") : id;
    const record = result[key];
    // An unknown ID comes back either absent or carrying an error field.
    if (record && !record.error) found.set(id, record.title || "(no title)");
  }
  return found;
}

const missing = [];
const mismatched = [];
const verified = [];

function record(id, kind, found) {
  if (!found.has(id)) {
    missing.push({ id, kind });
    return;
  }
  const actual = found.get(id);
  const claimed = claimedTitles.get(id);
  if (claimed && titleOverlap(claimed, actual) < TITLE_MATCH_THRESHOLD) {
    mismatched.push({ id, kind, claimed, actual });
    return;
  }
  verified.push({ id, title: actual });
}

try {
  if (pmids.size > 0) {
    const found = await resolve("pubmed", pmids);
    for (const id of pmids) record(id, "PMID", found);
  }
  if (pmcids.size > 0) {
    const found = await resolve("pmc", pmcids);
    for (const id of pmcids) record(id, "PMCID", found);
  }
} catch (err) {
  // A network failure is not evidence the citations are good. Fail closed:
  // an unreachable NCBI means we cannot verify, and unverified is the state
  // this gate exists to prevent from merging.
  console.error("");
  console.error("  BLOCKED — could not reach NCBI to verify citations");
  console.error("  " + "─".repeat(62));
  console.error(`  ${err.message}`);
  console.error("  Citations are unverified, so this PR cannot be auto-merged.");
  console.error("");
  process.exit(1);
}

if (missing.length > 0 || mismatched.length > 0) {
  console.error("");
  console.error("  BLOCKED — citation problems");
  console.error("  " + "─".repeat(62));
  for (const m of missing) {
    console.error(`  ${m.kind} ${m.id} — NCBI has no such record`);
  }
  for (const m of mismatched) {
    // The dangerous case: the ID is real, so it links somewhere and looks
    // checked, but it points at a different paper than the one described.
    console.error(`  ${m.kind} ${m.id} — real record, but a different paper`);
    console.error(`      cited as: ${m.claimed.slice(0, 78)}`);
    console.error(`      actually: ${m.actual.slice(0, 78)}`);
  }
  console.error("");
  console.error("  A fabricated citation on a page selling the compound it cites is");
  console.error("  the most damaging thing this pipeline can publish. Rewrite the");
  console.error("  article with sources that resolve.");
  console.error("");
  process.exit(1);
}

console.log(`check-citations: ${verified.length} citation(s) verified against NCBI`);
for (const v of verified) {
  console.log(`  ${v.id}  ${v.title.slice(0, 72)}`);
}
