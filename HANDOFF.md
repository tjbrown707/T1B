# Handoff — pick up here

Written 2026-08-07, updated 2026-09-07. Read this before starting work; it
records state that is not obvious from the code or the git log.

---

## Cancelled-order reopening + research-library pause — DATABASE AND WEBSITE LIVE

Migration `20260907161104_reopen_cancelled_orders.sql` was applied to production
on 2026-09-07. `/admin/orders` now offers **Uncancel Order** for fully cancelled,
unpaid orders. The service-role-only `reopen_cancelled_order` RPC atomically
restores a tracked order's exact released lot reservations after validating the
order, line items, saved reservations, immutable ledger, lot counters, and
current availability. Any mismatch or shortage fails without a partial change.
A successful reopen writes immutable audit records and creates a fresh 24-hour
reservation deadline. Pre-counted legacy orders reopen without touching
inventory, and repeated cancel/reopen cycles use distinct idempotency keys.

Joshua Taylor's order `T1B-260902-227087`
(`9c0bfb15-dd17-405d-8ec5-fd0b274ed5ee`) had been automatically cancelled after
its unpaid 24-hour reservation expired. The payment had actually arrived and
the order had already been hand-delivered. On 2026-09-07 it was reopened, its
original six lot allocations were re-reserved, and the full `$2,233.12` payment
was recorded via Zelle with `LOCAL_HANDOFF` fulfillment before it was marked
delivered. Final database state is `DELIVERED` / `PAID` / `DELIVERED`; payment
confirmation committed the reservations and deducted inventory exactly once.
The required packing-slip job completed and the customer handoff confirmation
email was sent.

The public research library is intentionally paused through
`RESEARCH_LIBRARY_ENABLED = false`, and product-page citation panels are paused
through `PRODUCT_REFERENCES_ENABLED = false`. Research navigation and footer
links, client routes, prerendered pages, sitemap entries, and every product's
"Peer-reviewed research" / "Sources & References" panel are absent. Direct
research URLs return a genuine 404 with `noindex`. Article and vetted citation
source data are retained for possible future use; product descriptions,
molecular specifications, COAs, and required research-use-only language remain.
Existing indexed research URLs will disappear as search engines recrawl them.
Do not re-enable either research surface or resume research automation unless
the owner explicitly asks.

The font swap was caused by Google Fonts timing out, not by a typography edit.
Rajdhani weights 300–700 and Orbitron weights 400–900 are now pinned through
Fontsource and bundled by Vite as same-origin assets. The application no longer
injects a Google Fonts stylesheet, and CSP no longer allows either Google font
host. Do not restore the external dependency.

PR #12 passed `npm run verify` with 174 tests, route smoke checks, lint,
production build, secret scan, and site-integrity checks before merge.
Production verification confirmed the uncancel workflow, research 404/noindex
behavior, research-free 40-URL sitemap, and Joshua's final order and inventory
state. Supabase's post-migration security and performance advisors report zero
errors and zero warnings.

---

## Remaining security hygiene — 2026-08-26 follow-up

PR #8 merged the receipt outbox, Turnstile, consent controls, and security
disclosure pages; PR #9 subsequently redesigned the staff order alert. Do not
merge the old PR #6 branch over those releases. PR #5 is separate research-copy
work and is deliberately unchanged by this security follow-up.

The remaining cleanup removes the HSTS `preload` opt-in and keeps the one-year
`includeSubDomains` policy. `netlify.toml` handles static files; the narrowly
scoped `netlify/edge-functions/transport-security.js` adds the identical header
to function responses and the `/checkout` redirect without consuming bodies,
changing status codes, or changing redirect destinations. Netlify-generated
responses before the edge handler (for example firewall/rate-limit blocks) are
still controlled by the platform, not by this code. No preload submission, DNS,
secret, database, or payment-flow change is required.

`/admin`, `/admin/orders`, and `/admin/inventory` now build as empty application
shells with `noindex, nofollow`, a generic title, and no public page snapshot or
social metadata. The app still loads normally and existing server authorization
is unchanged. The build guard checks these shells and the smoke suite now
checks signed-out navigation through all three staff URLs.

Local verification: 163 tests, all 14 smoke routes, build, secret scan, and site
integrity passed. Lint passed with the unrelated untracked `.codex-worktrees/`
and `outputs/` archives excluded. Verify the public response headers and all
three admin shells after production deploy before closing PR #6 as superseded.

**Deployment workflow has changed:** GitHub's active `Protect main` ruleset
requires a pull request and an up-to-date successful `verify` check, with no
bypass. Use a `codex/` branch and merge only after those checks pass. This
supersedes the older direct-push instructions and outstanding branch-protection
note below.

---

## Checkout security hardening — LIVE IN PRODUCTION

Customer receipts and staff new-order alerts now originate inside
`create-order.js` through the existing server-only Netlify `RESEND_API_KEY`.
The browser EmailJS dependency, public service/template/key values, Netlify
order form post, hidden order form, and EmailJS CSP allowance are gone. The
contact form deliberately remains on Netlify Forms. `email-template.html` is
now bundled as the runtime checkout-receipt template rather than pasted into
EmailJS. Resend idempotency keys are tied to the immutable database order ID.

New orders receive a durable `reservation_expires_at` deadline 24 hours after
creation. An hourly Netlify scheduled function calls the existing atomic
`cancel_unpaid_order` workflow after that deadline. Existing unpaid orders are
grandfathered with a null deadline, so deploying this change cannot cancel the
current backlog without review. Profile UPDATE is now granted only for
`full_name`, `phone`, `address`, `city`, `state`, and `zip`. Order-number
generation fails closed if secure browser randomness is unavailable.

Migrations: `20260825151157_restrict_profile_updates.sql` and
`20260825151207_add_unpaid_reservation_expiry.sql`.

Both migrations were applied to production before commit `e27e602` was pushed
to `main`. Release verification is green: 138 tests, all route smoke tests,
production build, secret scan, site-integrity scan, and lint on the real project
tree. The live asset is `index-DNbFTPd2.js`; it contains the new receipt-result
and secure-random handling and contains none of the former EmailJS identifiers.
The live CSP and prerendered HTML also contain no EmailJS API allowance or
hidden order form.

---

## Zelle checkout — LIVE IN PRODUCTION

Added 2026-08-24. Zelle is a third customer checkout option beside Cash App
and Venmo. The durable order and inventory reservation are created first; the
confirmation screen then shows the owner's exact business QR image, amount,
order-number memo, and same-device lookup instructions for `TierOneBio` /
`TIER ONE BIO LLC`. The unmodified bank image lives at
`public/zelle-tier-one-bio-qr.jpg`; CSS crops the surrounding screenshot so the
QR stays large without altering its encoded pixels.

Staff can select Zelle in **Confirm Payment**, and the server and database use
the same explicit payment vocabulary. Migration
`20260824200440_add_zelle_payment_method.sql` is already applied to production.
Live verification found Zelle in both the check constraint and payment RPC,
`service_role` execute access true, and `anon`/`authenticated` execute access
false. The post-change security advisor has only the existing intentional INFO
notices for server-only RLS tables.

Release verification is green: 132 tests, all route smoke tests, production
build, secret scan, site-integrity scan, and lint on the actual project tree.
The checkout and QR confirmation screens were visually inspected at desktop
and 390-pixel mobile widths. Repo-wide `npm run verify` itself sees archived
untracked `.codex-worktrees/` and lints their built bundles; the equivalent
release commands passed with that local archive excluded.

The owner updated EmailJS template `template_i9k8u2a` from
`email-template.html`, and commit `062c10c` was pushed to `main` on 2026-08-24.
Netlify deployed it successfully. Live verification found the Zelle checkout
code in production asset `index-BMJNkA_j.js`, and the public QR image returned
HTTP 200 as `image/jpeg`.

The stale tracked edits that were present before this work were safely shelved
as `stash@{0}: pre-zelle tracked local edits 2026-08-24` before fast-forwarding
to production. Their feature content was already represented in newer deployed
commits; the shelf was deliberately retained as a recoverable backup.

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
- At that release, Netlify Forms and EmailJS used server-confirmed totals; the
  2026-08-25 hardening above supersedes both browser-side sends.
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

### Scheduled article publishing — DISABLED / HISTORICAL

An article with a future `date` ships in the bundle but stays hidden until that
date, checked in the browser on each visit. No deploy, no build, no cron. Queued
articles 404 rather than render, since slugs are guessable.

This implementation is currently unreachable while
`RESEARCH_LIBRARY_ENABLED = false`; do not resume it unless the owner explicitly
reopens the public research-library work.

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

Research automation is intentionally paused. Do not build the claims lint,
research CI/auto-merge workflow, or scheduled article agent unless the owner
explicitly reopens this work.

### Needs the owner, cannot be done from code

- **Paste 4 dashboard templates.** These are the Supabase auth emails only.
  Checkout receipts and staff alerts are now read and sent by Netlify code;
  nothing needs pasting into EmailJS and no Netlify order-form notification is
  required. `welcome-discount.html` also needs no pasting.
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
npm run verify         # lint + 174 tests + route smoke + full production build
node scripts/check-citations.js --all
```

Run `npm install` first on a fresh machine — `node_modules` is not tracked.
