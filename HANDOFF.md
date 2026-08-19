# Handoff — pick up here

Written 2026-08-07, updated 2026-08-14. Read this before starting work; it
records state that is not obvious from the code or the git log.

---

## Checkout no longer requires a return after payment — BUILT, VERIFIED

Added 2026-08-18. The customer-facing `I HAVE SENT PAYMENT` step is gone. On
the final checkout screen the Cash App/Venmo action now creates the real order,
reserves inventory, sends the normal order notifications, and only then opens
the selected payment service using the server-confirmed total. The page says
plainly that the customer does not need to return because staff independently
verifies every payment.

Someone who clicks the payment action but does not pay will now appear as an
unpaid order with reserved stock. Use the existing **Cancel Unpaid** action to
release that reservation. This is intentional: a paid customer can no longer
send money yet leave no durable order behind by forgetting a second website
click.

`npm run verify` is green with 125 tests, all route smoke tests, the production
build, secret scan, and site-integrity check. The final Cash App and Venmo
screens were also inspected locally at desktop and 390-pixel mobile widths
without creating an order.

---

## Inventory/fulfillment build — DATABASE AND WEBSITE LIVE

### Processed-order email + branded packing slip — DATABASE AND WEBSITE LIVE

Added on 2026-08-14. Normal orders now produce one branded packing slip with
the horizontal Tier One logo plus the internal lot, storage-location,
quantity, and verification fields. Continuation pages remain available only
for unusually large orders, so no fulfillment data is clipped to force a
single sheet.

For shipping orders, the customer tracking email is queued only after both the
packing slip and shipping label return positive PrintNode job IDs. For local
handoff, the same branded packing slip is available and its positive PrintNode
job ID alone queues a separate no-tracking confirmation email. Both use the
existing Netlify `RESEND_API_KEY` and are idempotent across reprints and retries.
Shippo's returned `test` flag is
persisted with the label; test and unknown-mode labels never email customers,
even after the environment token changes. A protected Supabase outbox and a
five-minute Netlify scheduled function recover temporary mail failures without
making a successful print look failed. PrintNode acceptance confirms spooler
submission, not that paper physically exited the printer.

Migrations: `20260814170438_order_processed_email_outbox.sql`,
`20260814174429_order_notification_outbox_actor_index.sql`,
`20260814175636_harden_order_processed_email_queue.sql`,
`20260814193000_local_handoff_packing_email.sql`, and
`20260814203000_require_local_handoff_print_before_delivery.sql`. No historical
orders are backfilled. Local **Mark Handed Off** stays locked until the positive
PrintNode packing-slip audit and version-2 email outbox row both exist.

### August 10 inventory cutoff — DATABASE AND WEBSITE LIVE

Migration `20260813052015_protect_precounted_legacy_orders.sql` and commit
`a842a2e` went live on 2026-08-12. The nine orders placed through the end of
August 10 in Arizona are persisted as `PRECOUNTED_LEGACY`; confirming their
outstanding payments records the amount/method/fulfillment choice but skips all
inventory reservation, commitment, counter, and movement writes. The two newer
orders remain `TRACKED` and use normal automatic inventory accounting.

The owner had already corrected the one earlier duplicate deduction manually,
so the migration deliberately performed no restoration or inventory adjustment.
Production inventory was 1,438 on hand, 1 reserved, and 1,437 available both
immediately before and after the migration. No unpaid pre-counted order had a
live reservation. The server-only RPC remains unavailable to `anon` and
`authenticated`; the security advisor has only the intentional INFO notices.
Live UI verification confirmed both the cutoff warning and the newer-order
tracking label without confirming or modifying either order. `npm run verify`
is green with 99 tests and a clean secret scan.

### Actual amount received — DATABASE AND WEBSITE LIVE

Migration `20260813051208_record_payment_amount_received.sql` and commit
`138304d` went live on 2026-08-12. Payment confirmation now asks for **Amount
received**, defaulting to the immutable order total. Every paid order exposes
**Edit Amount Received** under its fulfillment details, including orders that
were already confirmed. Corrections change neither the original total nor
inventory, use optimistic locking, and append an immutable
`PAYMENT_AMOUNT_CORRECTED` event with old/new values and the staff actor.

All three production paid orders were safely backfilled to their original
totals. Live read-only UI verification found the new value and edit control on
all three without changing an order. The RPC is unavailable to `anon` and
`authenticated` and executable only by `service_role`. Supabase's post-change
security advisor reports only the intentional INFO notices for the seven
server-only RLS tables. `npm run verify` is green: zero lint problems, 98 tests,
route smoke, build, integrity, and secret scan.

### Local handoff + retail inventory value — DATABASE AND WEBSITE LIVE

Added on 2026-08-11 in migration
`20260812051446_local_handoff_and_inventory_value.sql`, which is already applied
to production. Payment confirmation now records the actual received-via channel
(Cash App, Venmo, Cash, or Other) and either shipping or local handoff. Local
handoff orders can print the branded packing slip and send a processed-order
confirmation after PrintNode accepts that slip. **Mark Handed Off** unlocks only
after that accepted print and durable email queue are recorded. Pre-counted
cutoff orders with no allocation print their original order items with an honest
legacy no-lot marker and never change inventory. Shippo rates, shipping-label
printing/purchases, and postage remain blocked in the UI, server code, and
database trigger.

The inventory overview also calculates current
on-hand retail value from the active single-vial catalog prices. Existing nine
orders were preserved as shipping orders. The final `npm run verify` is green:
zero lint problems, 97 tests, route smoke, build, and secret scan.

Commit `aca7263` was pushed to `main` and deployed successfully by Netlify on
2026-08-11. Live signed-in verification confirmed the payment modal choices and
the local-handoff no-print explanation without changing an order. The adjusted
production inventory currently shows 1,440 units on hand and a $98,095 retail
value across 27 products.

Built on branch `codex/new_inventory_managent` on 2026-08-11. The owner applied
the full inventory migration and the protected staff-role SQL successfully on
2026-08-11. A live read-only verification found 27 products, 27 provisional
lots, 1,350 on hand, zero reserved, 1,350 available, and one staff role. Direct
`anon` and `authenticated` read/write privileges are false on all seven
operational tables. Supabase's security advisor returned only the intentional
INFO notices for RLS tables with no customer policies.

Commit `8521604` was pushed to `main` and deployed successfully by Netlify on
2026-08-11. The live `/admin/inventory` page served the exact verified bundle
hash, and the unauthenticated inventory endpoint returned the intended HTTP
401 response. Shippo's token and sender-address variables were configured and
redeployed on 2026-08-11. PrintNode variables have not yet been confirmed; its
controls fail closed until those are added.
The remaining owner setup is in `INVENTORY_FULFILLMENT_SETUP.md`.

- All 27 variants initialize at 50 active units in provisional lots; there is
  no setup mode.
- Checkout reserves stock atomically. Staff payment confirmation commits the
  reservation and deducts on-hand units; unpaid cancellation releases it.
- New staff UI: `/admin/inventory`; `/admin/orders` now uses explicit workflow
  actions rather than arbitrary status edits or permanent deletion.
- One branded packing slip combines customer/order details with internal
  lot/location verification fields. The superseding 2026-08-14 release above
  removes the redundant mandatory second page.
- Direct server-side Shippo rating/4×6 label purchase and PrintNode printing.
  Shippo platform sync is not used.
- Server-only RLS tables, protected `app_metadata` roles, row locks,
  compare-and-set transitions, immutable audit triggers, request bounds and
  rate limits are in place. The browser-bundle scanner now covers Shippo and
  PrintNode secrets too.
- `npm run verify` is green: zero lint problems, 97 tests, route smoke, build,
  secret scan and integrity check.
- Package defaults: 9 × 4.25 × **0.5** inches, 1.9 oz. The 0.5-inch thickness
  is an explicit temporary assumption and remains editable per shipment.

The migration file is
`supabase/migrations/20260811120000_inventory_fulfillment_foundation.sql` and
has already been run. Do not run it twice. The older “New orders default to
PROCESSING” historical production note below is superseded by this section.

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
- **Set Supabase email OTP expiry to 1800 seconds.** Dashboard → Authentication
  → Providers → Email → OTP expiry → `1800` → Save. This is the
  one remaining security-advisor item that cannot be changed from the repo.
- **Delete test data**: order `T1B-260807-986209` ($400 → $360) and its test
  account. Delete the order explicitly first; deleting the Auth user removes
  its profile and discount code, but intentionally preserves order history by
  clearing `orders.user_id` rather than deleting the order.

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
