#!/usr/bin/env node
// Build guard: fails the build if a server-only secret reaches the browser
// bundle. Runs after `vite build`, so it fires on Netlify deploys too and the
// site never goes live carrying a key it shouldn't.
//
// WHY THIS EXISTS
//   The publishable Supabase key is meant to ship to the browser; the
//   service_role key bypasses Row-Level Security entirely and must never
//   leave the server. The two sit next to each other in the Supabase
//   dashboard, and swapping one for the other makes RLS-blocked queries
//   start working immediately — which is exactly what makes the mistake easy
//   to make and hard to notice. This check is the backstop.
//
// Run manually with:  node scripts/check-bundle-secrets.js

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const SCAN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".html", ".css", ".json", ".map", ".txt"]);

// Show enough of a match to identify it, never enough to use it. This output
// can land in a public Netlify build log.
function redact(value) {
  const str = String(value);
  return str.length <= 12 ? `${str.slice(0, 4)}…` : `${str.slice(0, 8)}…${str.slice(-2)} (${str.length} chars)`;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCAN_EXTENSIONS.has(path.extname(full))) out.push(full);
  }
  return out;
}

// Legacy Supabase keys are JWTs. The anon/publishable one is fine to ship; the
// service_role one is not. They are indistinguishable by shape, so the payload
// has to be decoded and the role read out.
function findServiceRoleJwts(text) {
  const hits = [];
  const jwtPattern = /eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;
  for (const match of text.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (payload && payload.role === "service_role") hits.push(match[0]);
    } catch {
      // Not a JWT we can read — the literal patterns below still apply.
    }
  }
  return hits;
}

const PATTERNS = [
  {
    label: "Supabase secret key (sb_secret_…)",
    regex: /sb_secret_[A-Za-z0-9_-]{8,}/g,
    fix: "Remove it from the browser code and rotate it in Supabase → Settings → API Keys.",
  },
  {
    label: "Supabase service_role key name",
    regex: /SUPABASE_SERVICE_ROLE_KEY/g,
    fix: "Server-only. Read it in a Netlify Function, never in code that Vite bundles.",
  },
  {
    label: "Resend API key (re_…)",
    regex: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}/g,
    fix: "Remove it from the browser code and rotate it in the Resend dashboard.",
  },
  {
    label: "Shippo API token",
    regex: /shippo_(?:live|test)_[A-Za-z0-9_-]{12,}/gi,
    fix: "Remove it from browser code and rotate it in Shippo. Keep SHIPPO_API_TOKEN server-only in Netlify.",
  },
  {
    label: "Shippo server-only key name",
    regex: /SHIPPO_API_TOKEN/g,
    fix: "Shippo calls belong in a Netlify Function; never read this environment variable from the Vite app.",
  },
  {
    label: "PrintNode server-only key name",
    regex: /PRINTNODE_API_KEY/g,
    fix: "PrintNode calls belong in a Netlify Function; never read this environment variable from the Vite app.",
  },
  {
    label: "Turnstile secret key name",
    regex: /TURNSTILE_SECRET_KEY/g,
    fix: "Turnstile siteverify belongs in a Netlify Function; never read this environment variable from the Vite app.",
  },
  {
    label: "EmailJS private key name",
    regex: /EMAILJS_PRIVATE_KEY/g,
    fix: "Order receipts are sent by Resend from create-order. Do not put EmailJS keys in browser code.",
  },
  {
    label: "EmailJS browser send client",
    regex: /emailjs\.send|@emailjs\/browser/g,
    fix: "Order receipts are sent by the Resend outbox in create-order. Do not call EmailJS from browser code.",
  },
  {
    label: "Postgres connection string with credentials",
    regex: /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/g,
    fix: "Database credentials must never reach the browser. Rotate the database password.",
  },
];

// Key formats can change, and PrintNode keys do not have a dependable public
// prefix. When Netlify exposes a configured value to the build process, scan
// for that exact value too. Values are never printed in full.
const CONFIGURED_SERVER_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "SHIPPO_API_TOKEN",
  "PRINTNODE_API_KEY",
  "EMAILJS_PRIVATE_KEY",
  "TURNSTILE_SECRET_KEY",
].flatMap(name => {
  const value = process.env[name];
  return typeof value === "string" && value.length >= 8 ? [{ name, value }] : [];
});

if (!existsSync(DIST)) {
  console.error("check-bundle-secrets: dist/ not found — run `vite build` first.");
  process.exit(1);
}

const findings = [];
const files = walk(DIST);

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const relative = path.relative(process.cwd(), file);

  for (const { label, regex, fix } of PATTERNS) {
    for (const match of text.matchAll(regex)) {
      findings.push({ file: relative, label, sample: redact(match[0]), fix });
    }
  }

  for (const jwt of findServiceRoleJwts(text)) {
    findings.push({
      file: relative,
      label: "Supabase service_role JWT",
      sample: redact(jwt),
      fix: "Swap it back to the publishable key and rotate the service_role key in Supabase → Settings → API Keys.",
    });
  }

  for (const secret of CONFIGURED_SERVER_SECRETS) {
    if (text.includes(secret.value)) {
      findings.push({
        file: relative,
        label: `${secret.name} configured value`,
        sample: redact(secret.value),
        fix: `Remove it from browser code and rotate ${secret.name} before deploying.`,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("");
  console.error("  BUILD BLOCKED — a server-only secret is in the browser bundle");
  console.error("  " + "─".repeat(62));
  for (const f of findings) {
    console.error(`  ${f.label}`);
    console.error(`    in:    ${f.file}`);
    console.error(`    match: ${f.sample}`);
    console.error(`    fix:   ${f.fix}`);
    console.error("");
  }
  console.error("  Anything in dist/ is downloadable by every visitor. Treat a key");
  console.error("  that got this far as compromised and rotate it, even if the site");
  console.error("  was never deployed — the build log above is not the only copy.");
  console.error("");
  console.error("  Common cause: an env var named VITE_… — Vite inlines those into");
  console.error("  the bundle. Server-only values must NOT use the VITE_ prefix.");
  console.error("");
  process.exit(1);
}

console.log(`check-bundle-secrets: scanned ${files.length} files in dist/ — clean`);
