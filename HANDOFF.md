# Handoff — pick up here

Written 2026-08-07, updated 2026-08-11. Read this before starting work; it
records state that is not obvious from the code or the git log.

---

## The citations are fixed — but the count was worse than this file said

Every citation in `site_1.jsx` now resolves to the paper it names. Verified:

```
node scripts/check-citations.js --all     # 41 citations verified, exits clean
```

**The real number was 53, not 22.** The original count only covered the article
region, because that is all `--all` used to sweep. The per-compound `REFERENCES`
block that feeds the **product pages** sits *above* `ARTICLES:START` and was
never audited — and it held roughly thirty of the bad citations, on the exact
pages that sell the compound being cited. `--all` now reads the whole file.
That change is the durable part of this fix; the rest was research.

Two failure shapes, both fixed:

- **Real PMID, unrelated paper.** "Thymosin β4 and tissue repair…" resolved to
  "Granzyme A activates another way to die." Nothing looks wrong to a reader.
- **Right paper, wrong masthead.** Citations that passed the gate on title still
  printed the wrong journal or year — NAD+ ageing was labelled *Cell Metab 2020*
  when it is *Nat Rev Mol Cell Biol 2021*. The gate only compares titles, so
  this class is still invisible to it.

Method, if this ever has to be redone: resolve each cited *title* through Europe
PMC and NCBI, then rebuild the whole citation — journal, title, year, ID,
authors, URL — from the record. Do not just swap the number. Crossref will
happily match "Thymosin α1: from bench to bedside" to a 2025 book called *From
Bench to Bedside* with a perfect similarity score, so a fuzzy match is a
starting point for a lookup, never evidence.

Where no such paper existed, the citation was replaced with a real one that
supports the same claim. Two of those were substantive:

- **KPV** was cited to a title asserting it works "via the melanocortin
  pathway." No such paper exists, and the claim is wrong — the real literature
  finds KPV acts *independently* of melanocortin receptors, which is what the
  site's own article text already said. Now cited to Brzoska 2008 (*Endocr Rev*).
- **TB-500** was cited to a fabricated "clinical trials — a critical
  evaluation." Now cited to Ruff 2010, the actual placebo-controlled human
  safety trial — which is what the articles' "human evidence is limited"
  caveats should have been pointing at all along.

### Known-unsupported, left alone deliberately

The compound-specific stability windows in
`reconstituting-storing-research-peptides` (BPC-157 ~4 weeks, GHK-Cu ~2 weeks,
Epitalon ~6 weeks…) have no published source. They are vendor convention. The
article frames them as approximate standard practice and tells the reader to
follow supplier documentation, and no citation is attached to them, so nothing
is being falsely attributed. Worth revisiting if the framing ever hardens.

---

## What was built this session

### Welcome email + single-use discount codes — DONE, verified end to end

Signup → confirm → Supabase trigger → Netlify function → code minted → Resend →
inbox → applied at checkout → burned on use → refused on reuse. All of it was
exercised against production on 2026-08-07.

- `netlify/functions/send-welcome-email.js` — mints and sends
- `netlify/functions/create-order.js` — creates the order and burns a personal
  code atomically in Postgres
- `netlify/functions/validate-discount.js` — env codes first, then per-customer codes
- `public.discount_codes` table — RLS on, SELECT-only policy, no write policy at all
- Setup and troubleshooting: `email-templates/README.md` §3

Root cause of the failures during testing was an invalid `RESEND_API_KEY`. There
are now **two separate Resend keys** — see the warning in that README before
revoking anything.

### Build guard — DONE

`scripts/check-bundle-secrets.js` runs inside `npm run build` and exits non-zero
if a service-role key, Resend key or Postgres URL reaches `dist/`. Netlify fails
the deploy rather than shipping it. Verified in both directions.

### Checkout and database hardening — DONE 2026-08-11

- New orders default to `PROCESSING`; legacy statuses remain readable.
- Browser roles have SELECT-only access to their own orders. The former direct
  INSERT policy and excess table grants were removed.
- The order insert and personal-code redemption now happen in one transaction.
- Order payloads have size, field, email, payment, item and code validation;
  public endpoints use Netlify's durable rate limits.
- Replayed order numbers return data only when every immutable field matches.
- Netlify Forms and EmailJS now use the server-confirmed totals and item text.
- RLS policies use explicit authenticated roles and one-time `auth.uid()`
  evaluation; the public `rls_auto_enable()` execution grant was removed.
- Staff queue indexes, validated accounting constraints and a status constraint
  are present in production.
- Fingerprinted assets are immutable-cached and CSP allows only this Supabase
  project rather than every `*.supabase.co` host.

### Canonical URL bug — FIXED

`index.html` hardcoded `<link rel="canonical" href="https://www.tierone.bio/">`
and nothing updated it, so **every article told Google it was a duplicate of the
homepage** — an instruction to drop it from the index. Fixed in `7534b7d`, along
with `og:image`, which had never appeared anywhere because the old helper only
wrote to tags already present in the HTML.

### Scheduled article publishing — DONE

An article with a future `date` ships in the bundle but stays hidden until that
date, checked in the browser on each visit. No deploy, no build, no cron. Queued
articles 404 rather than render, since slugs are guessable.

Note: hidden means hidden from the UI, **not secret** — the text is in the JS
bundle. Fine for articles; do not queue anything commercially sensitive.

### Automated-article gates — 2 of 3 built

| Gate | File | Status |
|---|---|---|
| Diff scope | `scripts/check-diff-scope.js` | DONE, 4 cases verified |
| Citations | `scripts/check-citations.js` | DONE, 4 cases verified |
| Claims lint | — | NOT BUILT |

Gate 1 confines an article PR to the `ARTICLES` region (delimited by
`// ARTICLES:START` / `// ARTICLES:END` sentinels) plus `public/sitemap.xml`.
This is the gate that matters: the article agent browses the web for citations,
so it reads untrusted text every run, and a page can carry instructions aimed at
the model. Removing a sentinel fails the check **closed**.

Gate 2 resolves every new PMID/PMCID through NCBI E-utilities and compares the
cited title against the real one. Existence alone is insufficient — that is
exactly how the fabricated citations above would have passed.

On a PR it checks added lines anywhere in the diff, so product-page references
are covered. Only the `--all` sweep was ever region-scoped, and that is fixed.

---

## Outstanding work

1. **Claims lint** — gate 3. Fail on explicit medical claims ("cures", "treats
   X disease", "FDA approved") in the article region. Keep patterns
   high-precision; a gate with false positives gets ignored.
2. **GitHub Actions workflow** — run all gates plus build/lint on `research/*`
   PRs, auto-merge on green so no human approval is needed in the happy path.
3. **The scheduled agent itself** — writes an article every 3 days, dated ~9 days
   out so the publish queue doubles as a review window.
4. **Consider checking journal and year, not just title,** in gate 2. Every
   mis-labelled masthead found this round passed the existing check. Europe PMC
   returns both fields in the same response the gate already makes, so the cost
   is small — the work is picking a comparison lenient enough not to fail on
   `NAT REV MOL CELL BIOL` vs `Nature reviews. Molecular cell biology`.

### Needs the owner, cannot be done from code

- **Branch protection on `main`** — block direct pushes, tick "do not allow
  bypassing". Without it the agent can skip every gate above.
- **Fine-grained PAT** scoped to this repo only, Contents: write.
- **Paste 5 dashboard templates.** 4 Supabase auth emails + the EmailJS order
  confirmation (`template_i9k8u2a`). The repo is ahead of what is live: wide logo,
  Gmail dark-mode fix, `sales@`/`admin@` addresses, and the discount-code row on
  the receipt. `welcome-discount.html` needs no pasting — the function reads it.
- **Netlify form notifications** to `sales@tierone.bio`, so orders arrive by email
  instead of requiring a dashboard login.
- **Set Supabase email OTP expiry to 3600 seconds or less.** Dashboard →
  Authentication → Providers → Email → OTP expiry → `3600` → Save. This is the
  one remaining security-advisor item that cannot be changed from the repo.
- **Delete test data**: order `T1B-260807-986209` ($400 → $360) and its test
  account. Deleting the auth user cascades to the order and its discount code.

---

## Known limits, deliberately accepted

- **Discount codes are blocked during a sitewide sale.** `isSaleActive()` disables
  all codes, welcome codes included, so someone signing up mid-sale holds a code
  they cannot use while its 30-day clock runs. Not yet exempted.
- **Sitemap is static.** A queued article must stay out of `public/sitemap.xml`
  until it publishes, or Google crawls a soft 404.
- **Welcome codes require sign-in.** They are bound to a `user_id`, so guest
  checkout cannot redeem one. Deliberate — it stops codes being shared.

---

## Verifying before you push

```
npm run verify         # lint + 84 tests + 12-route smoke + full production build
node scripts/check-citations.js --all
```

Run `npm install` first on a fresh machine — `node_modules` is not tracked.
