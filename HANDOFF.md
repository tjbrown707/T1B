# Handoff — pick up here

Written 2026-08-07. Read this before starting work; it records state that is not
obvious from the code or the git log.

---

## THE URGENT ONE: 22 of 40 citations point at the wrong paper

Live on the site right now, on pages that sell the compounds being cited.

These are **not** made-up ID numbers. They are real PMIDs attached to completely
unrelated research, so they resolve, they link, and they look verified. That is
what makes them worse than obvious fabrications — nothing looks wrong.

```
selank-semax-russian-nootropic-peptides      4/4   every citation wrong
tissue-repair-peptide-blends-research        4/4   every citation wrong
thymosin-alpha-1-immune-research             3/3   every citation wrong
ghk-cu-copper-peptide-research               2/2   every citation wrong
reconstituting-storing-research-peptides     2/2   every citation wrong
tesamorelin-growth-hormone-research          2/2   every citation wrong
bpc-157-vs-tb-500-tissue-repair              2/3
nad-plus-supplementation-research            2/3
mots-c-mitochondrial-peptide-research        1/2
cjc-1295-ipamorelin-growth-hormone-stack     1/3
```

Examples of the failure shape:

| Cited as | Actually is |
|---|---|
| "Thymosin β4 and tissue repair…" | "Granzyme A activates another way to die." |
| "α-MSH-derived tripeptide KPV…" | "Verruciform xanthoma — 282 oral lesions" |
| "NAD+ Metabolism and Its Roles in Ageing" | "Cadaver Lab in Podiatric Surgery Residency Programs" |

Only two articles are clean: `bpc-157-mechanism-of-action` and
`epitalon-telomerase-pineal-peptide-research`. Both lean on **PMC** IDs, and every
PMC citation in the library checks out. The PMIDs are the problem.

Reproduce the full list any time:

```
node scripts/check-citations.js --all
```

**Fixing this is real research, not find-and-replace.** Each claim in the prose
needs a source that actually supports it; where no such paper exists, the
sentence has to change. Re-run the command until it exits clean.

---

## What was built this session

### Welcome email + single-use discount codes — DONE, verified end to end

Signup → confirm → Supabase trigger → Netlify function → code minted → Resend →
inbox → applied at checkout → burned on use → refused on reuse. All of it was
exercised against production on 2026-08-07.

- `netlify/functions/send-welcome-email.js` — mints and sends
- `netlify/functions/redeem-discount.js` — burns the code after checkout
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
exactly how the 22 bad citations above would have passed.

---

## Outstanding work

1. **Fix the 22 citations.** Highest value; everything else is downstream.
2. **Claims lint** — gate 3. Fail on explicit medical claims ("cures", "treats
   X disease", "FDA approved") in the article region. Keep patterns
   high-precision; a gate with false positives gets ignored.
3. **GitHub Actions workflow** — run all gates plus build/lint on `research/*`
   PRs, auto-merge on green so no human approval is needed in the happy path.
4. **The scheduled agent itself** — writes an article every 3 days, dated ~9 days
   out so the publish queue doubles as a review window.

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
- **Delete test data**: order `T1B-260807-986209` ($400 → $360) and its test
  account. Deleting the auth user cascades to the order and its discount code.

---

## Known limits, deliberately accepted

- **Discount codes are blocked during a sitewide sale.** `isSaleActive()` disables
  all codes, welcome codes included, so someone signing up mid-sale holds a code
  they cannot use while its 30-day clock runs. Not yet exempted.
- **Redemption is not transactional with the order.** Two tabs racing can both
  place a discounted order; only one redemption lands. Same accepted tradeoff as
  the order-total caveat in `supabase/schema.sql` — payment is confirmed manually
  before anything ships.
- **Sitemap is static.** A queued article must stay out of `public/sitemap.xml`
  until it publishes, or Google crawls a soft 404.
- **Welcome codes require sign-in.** They are bound to a `user_id`, so guest
  checkout cannot redeem one. Deliberate — it stops codes being shared.

---

## Verifying before you push

```
npm run build          # vite build + secret scan; non-zero fails the deploy
npx eslint .           # baseline is 1 error + 1 warning, both pre-existing
node scripts/check-citations.js --all
```

Run `npm install` first on a fresh machine — `node_modules` is not tracked.
