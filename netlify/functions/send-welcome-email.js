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

// The name is whatever the customer typed at signup, so it is untrusted input
// on two axes: it is escaped before going into the HTML, and it is capped so a
// pathologically long "name" can't bloat the email or blow the greeting layout.
function firstNameFrom(record) {
  const full =
    record?.raw_user_meta_data?.full_name ||
    record?.user_metadata?.full_name ||
    "";
  const first = String(full).trim().split(/\s+/)[0];
  if (!first) return "there";
  return first.length > 40 ? first.slice(0, 40) : first;
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

  // The hook is configured on auth.users. Anything else is a misconfigured
  // webhook or a forged body, and its record shape can't be trusted.
  if (payload.schema && payload.table && !(payload.schema === "auth" && payload.table === "users")) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "unexpected table" }) };
  }

  // Cheap pre-filter: only the null → timestamp transition is interesting.
  // Every other update to auth.users (password change, metadata edit,
  // last_sign_in_at bump) also fires this webhook.
  const justConfirmed = !oldRecord.email_confirmed_at && !!record.email_confirmed_at;
  if (!justConfirmed) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not a confirmation event" }) };
  }

  const userId = record.id;
  if (!userId) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "no user id" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Re-read the user from the database instead of trusting the request body.
  // The shared secret is the only thing between this endpoint and the open
  // internet. If it ever leaks, a forged body must not be able to turn this
  // into a spam relay — without this lookup, an attacker could name any
  // recipient they liked and have it sent from noreply@tierone.bio, burning
  // the domain's sending reputation. Recipient and confirmed-state now come
  // from Postgres; the payload only supplies which user to look up.
  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
  const authUser = authData?.user;
  if (authErr || !authUser) {
    console.error("send-welcome-email: user lookup failed:", authErr);
    return { statusCode: 200, body: JSON.stringify({ skipped: "unknown user" }) };
  }
  if (!authUser.email_confirmed_at) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "email not confirmed" }) };
  }
  const email = authUser.email;
  if (!email) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "no email on record" }) };
  }

  // Load the template before minting anything. If the HTML is missing from the
  // deployed bundle this fails — and because the one-per-user index is what
  // makes retries idempotent, a code inserted first would permanently block the
  // retry that would otherwise have delivered the email.
  let template;
  try {
    template = loadTemplate();
  } catch (err) {
    console.error("send-welcome-email:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Template unavailable" }) };
  }

  // A typo'd env var must not mint a NaN discount that fails the value > 0
  // check on every signup, or a 900% one that pays customers to order.
  const rawPercent = Number(process.env.WELCOME_DISCOUNT_PERCENT || 10);
  const percent = Number.isFinite(rawPercent) && rawPercent > 0 && rawPercent <= 50 ? rawPercent : 10;
  const rawDays = Number(process.env.WELCOME_DISCOUNT_DAYS || 30);
  const days = Number.isFinite(rawDays) && rawDays > 0 && rawDays <= 365 ? rawDays : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const label = `${percent}% off`;

  // Insert first, send second. If the insert loses the idempotency race we
  // stop rather than sending a second email with a code that was never stored.
  let code = null;
  let codeLabel = label;
  let codeExpiresAt = expiresAt;

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
      // Unique violation on the one-welcome-per-user index: this customer
      // already has a code. That alone is NOT a reason to stop. If a previous
      // attempt minted the code but the send failed, they are holding a code
      // nobody ever told them about, and skipping here would make that
      // permanent. email_sent_at is what distinguishes the two cases.
      if (String(error.message).includes("one_welcome_per_user")) {
        const { data: existing, error: fetchErr } = await supabase
          .from("discount_codes")
          .select("code, label, expires_at, redeemed_at, email_sent_at")
          .eq("user_id", userId)
          .eq("source", "welcome")
          .maybeSingle();

        if (fetchErr || !existing) {
          console.error("send-welcome-email: could not read existing code:", fetchErr);
          return { statusCode: 500, body: JSON.stringify({ error: "Could not read existing code" }) };
        }
        if (existing.email_sent_at || existing.redeemed_at) {
          return { statusCode: 200, body: JSON.stringify({ skipped: "welcome email already sent" }) };
        }

        // Minted but never delivered — re-send the same code.
        code = existing.code;
        codeLabel = existing.label || label;
        codeExpiresAt = existing.expires_at ? new Date(existing.expires_at) : expiresAt;
        break;
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

  const html = renderTemplate(template, {
    FIRST_NAME: escapeHtml(firstNameFrom(authUser)),
    DISCOUNT_CODE: escapeHtml(code),
    DISCOUNT_LABEL: escapeHtml(codeLabel),
    EXPIRY_DATE: codeExpiresAt.toLocaleDateString("en-US", {
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
      reply_to: "admin@tierone.bio",
      subject: `Welcome to Tier One — here's ${codeLabel} your first order`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    // The code row stays, with email_sent_at still null, so the next delivery
    // re-sends this same code instead of skipping.
    //
    // The provider's own message is echoed back in the response body, not just
    // written to the function log. Supabase records the webhook response in
    // net._http_response, so a failure explains itself where the failure is
    // visible instead of requiring a separate hunt through Netlify's logs.
    // Resend does not echo the API key in errors, so this is safe to surface.
    console.error(`send-welcome-email: Resend returned ${res.status}: ${detail}`);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Email send failed", resend_status: res.status, resend_detail: detail }),
    };
  }

  // Delivered. Record it so a duplicate webhook doesn't send a second copy.
  const { error: markErr } = await supabase
    .from("discount_codes")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("code", code);
  if (markErr) console.error("send-welcome-email: could not mark email_sent_at:", markErr);

  return { statusCode: 200, body: JSON.stringify({ sent: true, code_issued: true }) };
};
