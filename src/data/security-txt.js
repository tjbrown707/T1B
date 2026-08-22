// RFC 9116 security.txt checks. Shared by unit tests and the build integrity
// guard so an expired Expires date cannot sit unnoticed.

export const SECURITY_TXT_CONTACT = "mailto:sales@tierone.bio";
export const SECURITY_TXT_CANONICAL = "https://www.tierone.bio/.well-known/security.txt";
export const SECURITY_TXT_POLICY = "https://www.tierone.bio/security";

// RFC 9116 recommends Expires be no more than a year ahead. A 366-day window
// covers leap years without letting a forgotten 2028 date linger.
export const SECURITY_TXT_MAX_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;

export function parseSecurityTxt(text) {
  const fields = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const name = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!fields[name]) fields[name] = [];
    fields[name].push(value);
  }
  return fields;
}

export function securityTxtExpiresAt(text) {
  const fields = parseSecurityTxt(text);
  const raw = fields.Expires?.[0] || "";
  const expires = Date.parse(raw);
  return Number.isFinite(expires) ? expires : NaN;
}

export function securityTxtProblems(text, now = new Date()) {
  const fields = parseSecurityTxt(text);
  const problems = [];
  if (!fields.Contact?.includes(SECURITY_TXT_CONTACT)) {
    problems.push("security.txt must list Contact: mailto:sales@tierone.bio.");
  }
  if (!fields.Canonical?.includes(SECURITY_TXT_CANONICAL)) {
    problems.push("security.txt must include the live Canonical URL.");
  }
  if (fields.Policy?.length) {
    if (!fields.Policy.includes(SECURITY_TXT_POLICY)) {
      problems.push("security.txt Policy must point at /security, not a substitute page.");
    }
  }
  const expires = securityTxtExpiresAt(text);
  if (!Number.isFinite(expires)) {
    problems.push("security.txt must include a parseable RFC 9116 Expires timestamp.");
    return problems;
  }
  const nowMs = now.getTime();
  if (expires <= nowMs) {
    problems.push("security.txt Expires date has passed — renew it.");
  } else if (expires - nowMs > SECURITY_TXT_MAX_LIFETIME_MS) {
    problems.push("security.txt Expires is more than one year ahead.");
  }
  return problems;
}
