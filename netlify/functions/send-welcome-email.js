// Netlify Function: mints a single-use welcome discount code and emails it.
//
// TRIGGER — this is not called by the browser. It is the target of a Supabase
// Database Webhook on auth.users UPDATE. Supabase Auth has no "after email
// confirmation" template, so the welcome email cannot be a Supabase template;
// it has to be sent by us when email_confirmed_at flips from null to a value.
//
// Required env vars (Netlify UI → Site configuration → Environment variables):
//   SUPABASE_URL               https://nmafhetkofrekabqawgb.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role key — NOT the publishable key. It
//                              bypasses RLS, which is required to write the
//                              discount_codes table. Never expose to a browser.
//   RESEND_API_KEY             from the Resend dashboard
//   WELCOME_WEBHOOK_SECRET     any long random string; also set as the
//                              x-webhook-secret header on the Supabase webhook
// Optional:
//   WELCOME_DISCOUNT_PERCENT   default 10
//   WELCOME_DISCOUNT_DAYS      default 30

import { createClient } from "@supabase/supabase-js";
import { randomInt, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// Ambiguous glyphs removed: no I/O/0/1, so a code read off a phone screen and
// typed into checkout can't fail on an l-versus-1 mistake.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_PREFIX = "T1B-WELCOME-";

function generateCode() {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return CODE_PREFIX + out;
}

// Constant-time comparison so the secret can't be recovered by timing the
// response to progressively-closer guesses.
function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// The HTML lives in email-templates/ so it stays editable as a real file.
// netlify.toml's included_files ships it into the function bundle; the
// candidate list covers the runtime cwd differing between local dev and deploy.
let cachedTemplate = null;
function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const candidates = [
    path.join(process.cwd(), "email-templates", "welcome-discount.html"),
    path.join(process.cwd(), "..", "email-templates", "welcome-discount.html"),
    path.resolve("email-templates/welcome-discount.html"),
  ];
  for (const candidate of candidates) {
    try {
      cachedTemplate = readFileSync(candidate, "utf8");
      return cachedTemplate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("welcome-discount.html not found in the function bundle");
}

function renderTemplate(html, vars) {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameFrom(record) {
  const full =
    record?.raw_user_meta_data?.full_name ||
    record?.user_metadata?.full_name ||
    "";
  const first = String(full).trim().split(/\s+/)[0];
  return first || "there";
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!secretMatches(event.headers?.["x-webhook-secret"], process.env.WELCOME_WEBHOOK_SECRET)) {
    console.warn("send-welcome-email: rejected request with bad or missing secret");
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    console.error("send-welcome-email: missing required env vars");
    return { statusCode: 500, body: JSON.stringify({ error: "Not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const record = payload.record || {};
  const oldRecord = payload.old_record || {};

  // Only the null → timestamp transition counts. Every other update to
  // auth.users (password change, metadata edit, last_sign_in_at bump) also
  // fires this webhook, and none of them should mint a code.
  const justConfirmed = !oldRecord.email_confirmed_at && !!record.email_confirmed_at;
  if (!justConfirmed) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not a confirmation event" }) };
  }

  const userId = record.id;
  const email = record.email;
  if (!userId || !email) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "no user id or email" }) };
  }

  const percent = Number(process.env.WELCOME_DISCOUNT_PERCENT || 10);
  const days = Number(process.env.WELCOME_DISCOUNT_DAYS || 30);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const label = `${percent}% off`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Insert first, send second. If the insert loses the idempotency race we
  // stop here rather than sending a second email with a code that was never
  // stored. Retry only on a code collision, not on the one-per-user index.
  let code = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode();
    const { error } = await supabase.from("discount_codes").insert({
      code: candidate,
      user_id: userId,
      type: "percent",
      value: percent,
      label,
      source: "welcome",
      expires_at: expiresAt.toISOString(),
    });

    if (!error) {
      code = candidate;
      break;
    }
    if (error.code === "23505") {
      // Unique violation. Which one matters: the partial index means this user
      // already has a welcome code, so the email already went out.
      if (String(error.message).includes("one_welcome_per_user")) {
        return { statusCode: 200, body: JSON.stringify({ skipped: "welcome code already issued" }) };
      }
      continue; // primary-key collision on the code itself — draw another
    }
    console.error("send-welcome-email: insert failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not create code" }) };
  }

  if (!code) {
    console.error("send-welcome-email: could not generate a unique code after 5 attempts");
    return { statusCode: 500, body: JSON.stringify({ error: "Could not create code" }) };
  }

  const html = renderTemplate(loadTemplate(), {
    FIRST_NAME: escapeHtml(firstNameFrom(record)),
    DISCOUNT_CODE: escapeHtml(code),
    DISCOUNT_LABEL: escapeHtml(label),
    EXPIRY_DATE: expiresAt.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tier One BioSystems <noreply@tierone.bio>",
      to: [email],
      reply_to: "info@tierone.bio",
      subject: `Welcome to Tier One — here's ${label} your first order`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The code row stays. The customer keeps a valid code even though the mail
    // failed, and support can read it out of the table rather than re-mint.
    console.error(`send-welcome-email: Resend returned ${res.status}: ${detail}`);
    return { statusCode: 502, body: JSON.stringify({ error: "Email send failed" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ sent: true }) };
};
