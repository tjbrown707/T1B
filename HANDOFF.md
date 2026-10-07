# Handoff — pick up here

Written 2026-08-07, updated 2026-09-09. Read this before starting work; it
records state that is not obvious from the code or the git log.

---

## Dealer Desk discount codes — release approved 2026-10-07

The owner requested normal discount-code entry in Dealer Desk. Codes reduce the
customer's product total first, then David retains 60% and pays Tier One 40%.
Shipping passes through separately. The change includes server verification,
fixed/percentage/free-shipping codes, single-use personal-code redemption,
immutable retry pricing, and the discounted totals on both dealer dashboards.

The owner authorized merging PR #32. Production migration
`20261007190000_allow_dealer_discount_codes.sql` is applied and verified.
Read `DEALER_DISCOUNT_CODES_ROLLOUT.md` for pricing, rounding and release steps.
Do not run a blind `supabase db push`. Historical snapshots are retained; the
separate owner-authorized corrections to David's orders are recorded below.
Validation: `npm run verify` passed with zero lint issues, 258 tests and 89
render scenarios, including applying/removing percent, fixed and shipping codes.
The disposable PostgreSQL suite passed with discounted dashboard accounting,
single-use redemption, rollback on failed redemption, retries and reopening.
The branch includes the payment-record-removal safeguards, and both combined
suites pass. A rollback-only production check verified 25% off a $165 product:
customer $123.75, David keeps $74.25, Tier One $49.50, one reservation on retry,
and payment confirmation. No test order, payment email, or stock movement was
left committed. Production security advisors report no warnings/errors.

---

## David dealer history and payment correction — 2026-10-07

Owner-authorized live corrections are saved with immutable before/after audits:
`T1B-261007-765050` (Ray west) now quotes $337.50 to the customer after 25% off,
$202.50 retained by David, and $135 owed to Tier One. It remains unpaid.
`T1B-261001-915174` (two KLOW, legacy order) is now in David's dealer history:
the existing 25% customer discount gives $247.50, David retains $148.50, and
Tier One is owed $99. The owner explicitly removed its erroneous $100 Zelle
payment record. It is AWAITING_PAYMENT / ON_HOLD, with a fresh 24-hour hold and
its original two vials RESERVED. Total dealer balance is $234 at correction time.

Migration `20261007220751_remove_order_payment_record.sql` is applied to production.
The server-only `remove_order_payment_record` RPC records an immutable reversal,
returns committed stock and reserves the same vials atomically, and clears the
current payment fields. It refuses picked/completed orders, purchased/in-flight
postage, unresolved email jobs, stale amounts, and unreconciled stock. No physical
refund is performed. Existing printed lot locks, documents, emails, and historical
payment audits are preserved. After the new payment, manually use **Print Packing
Slip** for the imported order: the original printed document remains historical
and suppresses automatic duplicate printing. No corrected email was sent.

Confirm Payment uses a new immutable sale key after each audited payment removal;
its paid retries still deduct nothing. Cancellation/reopening accepts a reversed
sale only when its immutable stock ledger balances to zero. Permissions remain
service-role only. No new website UI, environment setting, or owner dashboard
configuration is required. Full verify and isolated PostgreSQL reversal,
reconfirmation, repeated-reversal, retry, cancellation/reopening and access tests
pass. A production rollback-only rehearsal also confirmed the imported $99 order
can be paid through the actual RPC without double deduction or duplicate retries.
Production read-back confirmed one import/reversal audit, reserved stock, zero
recorded payment, and the $234 balance. Security advisors report no warnings/errors.

---

## Staff payment detail emails — 2026-10-04

Confirm Payment and real changes through Edit Amount Received now queue a staff
notice to sales@tierone.bio in the same transaction as the immutable payment
audit. Each audit event has one saved notice and its own Resend key, so a
$72 → $64 → $72 correction sends all three notices. No-op edits and payment
retries produce no additional notices. Historical payments are not backfilled.
The notice shows the saved amount, original total, short/overpayment difference,
method, customer, timestamp and previous amount for corrections.

The exact provider payload is saved before sending and preserved across retries,
amount/fulfillment changes and deployments. The existing five-minute email
worker retries transient failures with backoff; expired leases recover interrupted
sends. Eight attempts or a 23-hour retry window stop automatic sends to avoid
reusing an expired provider key. Permanent failures become NEEDS_REVIEW.
Admin → Orders → View fulfillment details → Payment & totals shows each staff
email as sent, queued for retry or needing attention. A failed send returns a
separate warning while payment and packing-slip progress remain saved. Sent means
accepted by Resend, not proof of inbox delivery. Exhausted/expired notices need
operator investigation; there is no unsafe automatic resend after key expiry.

Migration `20261005010811_staff_payment_email_outbox.sql` is applied to production.
It adds a service-role-only RLS outbox, immutable snapshots/payloads, a trigger
on new PAYMENT_CONFIRMED/PAYMENT_AMOUNT_CORRECTED audits, and protected claim,
prepare, complete and fail RPCs. No new environment variables, email templates,
customer email changes or dashboard actions are required.

Validation: npm run verify passes with 253 tests and 89 smoke scenarios,
including the actual amount editor closing after a saved payment with an email
warning. Disposable PostgreSQL lifecycle checks cover atomic rollback, no-op
and repeated-value changes, frozen payloads, lease/backoff/token behavior,
permanent failures, retry limits, expiry and customer access denial. The same
payment-email lifecycle check passed in production and rolled back all test
records; read-back found zero test orders/notices. Supabase advisors report no
warnings/errors; remaining notices are informational, including intentional
server-only RLS tables. Release uses PR #31 and the required verify check.

---

## Packing slips after payment — 2026-10-03

Checkout no longer requests a print job, including dealer orders and order retries.
**Confirm Payment** now queues the paid packing slip after payment commits. If an
order needs a manual lot choice, printing waits for **Save Lot Assignment**;
paid backorders wait for **Allocate stock** and any required lot choice. The
printed document includes the final shipment lots and freezes them before its
allocation snapshot is read. Single-lot orders print on payment confirmation.

Printer/configuration failures leave payment, stock allocation, and lot assignment
saved and show a separate warning. **Print Packing Slip** remains available for
explicit retries. Existing manual unpaid copies remain optional. Prior unpaid
order-copy print records do not suppress the paid fulfillment print. Existing
paid fulfillment print records suppress automatic duplicates; concurrent retries
use a distinct stable payment-print key. Unrecorded automatic retries expire
23 hours after the immutable document/picking lock (legacy orders use payment
time), allowing old paid backorders to print when stock finally arrives.
The existing fulfillment audit and shipping/local-handoff email rules still apply.
No migration, environment change, historical print job, or dashboard action is
required. The September 18 order-arrival printing workflow below is superseded.

Validation covers checkout without printer calls, payment/lot/backorder triggers,
retry deduplication, expired retries, manual reprints, print-audit failures and
payment preservation when printers are unavailable, plus the actual React
lot-save/print-lock interaction. Full `npm run verify` passes with zero lint
problems, 236 tests, 88 route scenarios, build, secret scan and site integrity.
Release uses a pull request with the required GitHub verify check.

---

## Manual shipment-lot assignment — 2026-10-03

Products with multiple stocked/allocated lots now require a staff choice after
payment (and after **Allocate stock** for paid backorders) before picking or
printing a fulfillment packing slip. In **Admin → Orders → View fulfillment
details → Assign shipment lots**, enter the vial quantity from each lot and click
**Save Lot Assignment**. Multiple lots can be used for one product; every ordered
product must have its exact quantity assigned. Single-lot products continue
automatically. Unpaid copies remain available only through manual printing.

The original allocator prioritizes dated expiration records before undated lots;
that is why the new GLP-3RT lot was selected over the old lot. Checkout still holds
stock and payment still commits it. Manual assignment atomically returns the
previously committed stock and deducts the chosen stock, preserving payment and
order totals. Other orders' reservations stay unavailable. Immutable ledger and
`SHIPMENT_LOTS_ASSIGNED` events record the change. Version checks prevent stale
edits; identical retries do not deduct twice.

**Change Lots** is available on paid, unpicked orders until picking or opening a
fulfillment PDF/printing locks the assignment. Document generation freezes the
assignment before reading its allocation snapshot, including single-lot orders,
so concurrent edits cannot disagree with paperwork. Failed printer jobs retain
this lock and can be retried. Real, unexpired lot records are required for manual
selection. Completed, picked, packed, and previously printed orders retain their
existing allocations; this release does not retroactively correct delivered
orders.

Migration `20261004013723_manual_order_lot_assignment.sql` adds the confirmation,
version and document-lock fields plus service-role-only choice/assignment RPCs.
The migration is applied to production and a rollback-only production lifecycle
check verified manual selection, stock transfer, document blocking and locking.
Supabase security/performance advisors report no warnings or errors.
No dashboard settings or new environment variables are needed. Release via PR
and required `verify` check. Validation includes unit tests, the actual React
assignment/save/unlock journey, and disposable PostgreSQL stock-transfer,
split-lot, stale-edit, retry, cancellation/reopening, paid-backorder, and document
lock lifecycle tests.

---

## Dealer Desk — 2026-10-01

The owner authorized David's existing account as a dealer at **60% off** the
current catalog/quantity/sale price. David collects the quoted customer total,
keeps the merchandise difference before his expenses, and pays Tier One the
dealer total. Existing ordinary orders are not converted or repriced. Dealer
orders must be placed in **My Account → Dealer Desk** (`/dealer`); the ordinary
storefront cart retains ordinary pricing.

Default delivery is **dealer pickup and hand-delivery**, with no shipping charge.
Shipping to the dealer's saved account address or directly to a named customer
is also supported. Shipping uses the existing $10 / $200-free-shipping rule on
the dealer merchandise subtotal and passes through equally to both totals.
Other discount codes cannot stack onto dealer orders.

**Admin → Dealers** (`/admin/dealers`) finds existing accounts by exact email,
enables/pauses ordering, changes each dealer's percentage, and shows order history,
quoted customer sales, margin on paid orders, actual payments received, and the
remaining amount owed. Use **Open order to confirm payment / fulfill** for the
existing staff workflow. The amount to confirm is the dealer total. Paid orders
with an amount correction below that total continue to contribute the difference
to the balance. Cancelled/refunded orders are excluded. Customer sales/margins
are quoted figures, not verification that the dealer collected customer payment.

Migration `20261001195033_dealer_accounts_and_orders.sql` is applied to production
and David's 60% rate is enabled. It adds server-only dealer settings and immutable
settings audits, immutable `orders.dealer_sale` snapshots, a protected summary RPC,
and an atomic wrapper around the existing inventory/backorder/expiry transaction.
David has no staff role. The new `dealers` function verifies account ownership
server-side; only existing staff can change dealer settings. Historical snapshots
survive rate changes, cancellation/reopening, and retries. A pending submission
is retained in sessionStorage so refreshes reuse the original order reference.
Recovery shows payment instructions only for an unpaid order; already-paid
orders show their recorded payment state, and cancelled/refunded orders refuse
a payment retry and direct the dealer to start a new order.

The verified dealer email is always the order-notification recipient, including
direct customer shipments. Downstream customers are not emailed dealer invoices.
Dealer packing slips omit all prices, including optional unpaid order
copies. The dealer rate is applied per vial and rounded to cents before summing;
the server checks the displayed quote and rejects stale prices before insertion.

Validation: full `npm run verify`, dealer authorization/pricing/checkout tests,
signed-in/out dealer and admin route smoke checks with pickup/direct-shipping
interaction, desktop/390px layout inspection, and isolated PostgreSQL lifecycle
tests alongside the existing stock/fulfillment tests. The GitHub verify job also
runs `tests/sql/dealers.sql`. Supabase advisors report no warnings/errors; the
new server-only tables intentionally have RLS with no client policies.
Website release uses the required PR + successful verify check workflow.
No new environment variable, SMTP template, or owner dashboard action is needed.

---

## Per-order shipping / handoff changes — 2026-09-27

Admin → Orders → expand an order → Customer & delivery → **Change Delivery
Method** now allows switching shipping/local handoff before payment, on backorder,
and during picking/packing. Saving preserves all money and inventory and records
an immutable `FULFILLMENT_METHOD_CHANGED` event. Switching a picked/packed order
to handoff returns fulfillment to READY_TO_PICK. Payment confirmation starts
with the currently saved method. Print an updated packing slip after switching;
contact the customer directly if an earlier email described different plans.

Completed/cancelled/refunded orders and purchased/in-flight postage are locked.
An in-flight customer email also temporarily blocks switching. Draft quotes can
remain attached but cannot be purchased while the order is local handoff. Queued
emails for the old method pause; printing after switching back resumes them with
the original idempotency key and retry limits. Sent emails are preserved, and a
handoff email no longer prevents a later shipping email. Staff sees the email for
the current method. Reprints never create duplicate messages for that method.

Migration `20260928022149_order_fulfillment_method_changes.sql` has been applied
to production. It adds the service-role-only change RPC, serializes shipment
writes against method changes, and makes processed emails unique per method.
No existing order choices are changed by the migration. Website release is via
PR and required verify check. Verification: 214 tests, route smoke including
both directions through the actual order UI, production build/secret/integrity
checks, and disposable PostgreSQL lifecycle tests including email and postage.

---

## Packing slips on order arrival — 2026-09-18 (superseded)

New checkout orders automatically request an order-copy packing slip before payment,
including backorders. Payment confirmation no longer prints. Unpaid/backorder
copies display their status and use the original order items without claiming
allocated lots. `ORDER_PACKING_SLIP_PRINTED` audits are separate from fulfillment
print events and never unlock handoff or queue processed-order emails. Staff can
reprint before payment; after payment and allocation, the existing paid packing
slip still supplies real lots and triggers the established email workflow.

Checkout failures/replays cannot print arbitrary orders. Printer failures do not
fail checkout; staff can see whether the order-copy print was recorded and retry
manually. PrintNode order-id keys and print audits suppress automatic duplicates;
unrecorded automatic retries expire after 23 hours. No historical print backfill,
schema migration, or environment setting is involved.

---

## Print logo contrast — 2026-09-18

Packing slips and 4x6 local-handoff labels now embed `public/logo-print.png`,
a white-on-black print variant, preserving the owner's preferred black background. The website's dark-background logo made its red
triangle disappear on monochrome printers. Both PDF generators and the Netlify
function asset bundle use the new image. Existing website branding is unchanged.
Regenerate documents through the dashboard to get the corrected logo; previously
downloaded PDFs and already queued jobs retain the old artwork.

---

## Backorder purchasing — database applied 2026-09-18

Out-of-stock product pages read authenticated live availability and show **On
Backorder**, **Backorder Now**, and an estimated ship date 14 calendar days from
today in Arizona. Checkout also detects requested quantities above availability.
An inventory outage never claims a product is out of stock. The final payment
screen explains the backorder policy before payment.

Migration `20260918211456_product_backorders.sql` adds `backorder_pending` and
`estimated_ship_date` to orders. A shortage places the **whole order** on hold:
all partial reservations roll back, with no fictional inventory or negative
stock. The estimate freezes at order creation and appears on the confirmation,
customer receipt, staff email, and customer order history. Normal orders retain
their existing reservation behavior. Payment can be recorded on a backorder,
but it remains ON_HOLD and automatic printing is deferred.

After replenishment: **Admin → Inventory → Receive lot**, then **Admin → Orders
→ open the paid backorder → Allocate stock → Print Packing Slip**. Allocation
requires enough stock for the entire order, commits once, and is safe to retry.
Real lot numbers are still required before printing. There are no split shipments
or automatic stock allocation; staff chooses which paid backorder to allocate.
The usual 24-hour unpaid cancellation applies. Reopening an unallocated backorder
preserves its original estimated date and restarts the payment window.

The migration was applied to production as `20260918212056_product_backorders`
on September 18; the local CLI-generated migration filename is retained above.
Existing orders were unchanged and security advisors found no warnings or errors.
Release order: merge the website PR only after the required verify check passes.
Old server code stays strict until the new create-order function explicitly opts
into backorders. New RPCs remain service-role only; no RLS policy is widened.
`node scripts/test-backorders-db.mjs` runs a disposable PostgreSQL lifecycle test;
the required GitHub verify job runs it in addition to `npm run verify`.

---


## Automatic packing slip on payment confirmation — 2026-09-10 (superseded)

Confirm Payment now invokes the shared packing-slip print service after the
payment RPC commits. Print failures return a separate warning with the paid
order; Print Packing Slip remains available for explicit reprints. Existing lot,
allocation, local-handoff email, and shipping-email rules still apply. No schema
or environment changes are required. The print audit marks this job automatic.

Payment RPC retries can return the same paid order. The print service checks
existing print audits, uses a stable PrintNode idempotency key for concurrent
requests, and refuses unrecorded automatic retries after 23 hours (PrintNode
keys expire at 24 hours). Explicit reprints do not reuse the automatic key.

Validation: automatic-packing-slip tests cover success, replay, manual reprints,
printer/configuration/data failures, provisional lots, expired retries, payment
failure, amount corrections, and post-update hydration failure.
---

## Catalog login gate — implemented 2026-09-09

The owner requested login before viewing products and research. `/products`,
`/product/:id`, `/lab-results`, `/calculator`, `/cart`, and `/checkout` now
require an existing Supabase account session. The public homepage replaces
featured products with sign-in/create-account links. Account creation, password
recovery, contact, company information, and policies remain available. Direct
links preserve their destination through login/signup, and signing out closes
the gate without deleting the saved cart. The existing age gate remains.

The research library and product references remain disabled. The dormant
research routes are also inside the login boundary if the owner later restores
them. No research content or navigation has been re-enabled.

Guest checkout is removed. `create-order` requires a server-verified Supabase
user and refuses absent/invalid/expired/anonymous sessions before creating an
order or sending email. No database migration, new secret, or dashboard setting
is required. Prerendered catalog/resource pages contain only a generic noindex
sign-in prompt, with no product metadata, prices, or structured data; the
sitemap now contains only 10 public informational URLs.

Scope: this is a storefront browsing gate plus server-enforced order login,
not researcher qualification or a legal-compliance certification. Catalog data
and static assets still ship in the client application and public repository;
this change does not make that source material confidential. Truly private
content would require a separate authenticated data/asset delivery design.

Local verification passed: 194 tests, signed-in and signed-out route smoke
checks (including the complete login/logout/cart-retention journey), production
build, secret scan, site integrity, and lint with unrelated `.codex-worktrees/`
and `outputs/` archives excluded. Desktop and 390-pixel mobile sign-in layouts
were visually inspected. Deployment follows the required PR + `verify` workflow.

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

## Packing-slip printer readiness — 2026-09-08

The 4×6 label printer and Letter packing-slip printer are separate PrintNode
destinations. A packing-slip incident on September 8 was downstream of the
website: Netlify generated the PDFs, PrintNode accepted the jobs, and Windows
spooled them, but the installed Brother HL-L2460DW WSD queue was offline and
its saved network endpoint was unreachable. The owner asked to retain all four
queued packing slips; do not clear that queue without a new explicit request.

The admin order page now reads authenticated, redacted PrintNode readiness for
both printer roles. A definitively missing, offline, disconnected, or
authentication-failed packing printer disables only **Print Packing Slip** and
shows an actionable explanation; the server repeats the readiness check after
validating the order and before generating/submitting the PDF. Transient status
lookup failures remain fail-open so a monitoring hiccup cannot disable a
working printer. Successful UI copy says the job was *queued in PrintNode*, not
physically printed—PrintNode acceptance cannot prove paper output. Printer IDs,
names, computer details, and credentials never reach the browser.

The regression suite covers the exact split-printer case, definitive offline
blocking with no print/audit side effects, uncertain status fail-open behavior,
credential failures, and response redaction. `npm run verify` is green with 191
tests, all route smoke checks, the production build, bundle-secret scan, and
site-integrity checks. NCBI verified all 29 retained citations, and both the
production-only and full npm dependency audits report zero vulnerabilities.

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


## BAC Water catalog addition — 2026-09-28

Added `bac-water`: BAC Water 10 mL at $10 per vial (also $10 for 5+).
The matching image uses stacked BAC / Water and a red 0.9% benzyl alcohol
line. Product specs display composition and Liquid; no purity or lot-tested
claim and no fabricated lab report. Product routes derive from the catalog.
The additive inventory migration registers the product with no opening stock.
Receive the actual lot and count through Admin → Inventory → Receive lot.

Validation: npm run verify passed (lint, unit tests, signed-in/out route
smoke, production build, secret scan, integrity). Owner applied the inventory SQL in the Supabase dashboard on September 28;
read-back confirmed bac-water / BAC Water / 10 mL. No stock was invented.
The connected MCP remains read-only and the local CLI has no access token.

## Automatic lot IDs and receiving defaults — 2026-09-28

New lots default to an automatically assigned T1B-XXXX identifier when saved.
The first suffix character is 2–9, followed by three uppercase letters/digits
excluding ambiguous I/O/0/1. Database uniqueness covers all products, manual
entries and metadata edits; automatic collisions retry before any receipt audit.
A manual-ID option remains. The receipt confirmation displays the saved ID.

Supplier batch and storage input fields are removed. New lots default to
Tier One BioSystems HQ and expiration two calendar years after their Arizona
creation date. Existing dates, stock and lot names are unchanged. Existing
metadata can still be corrected, including expiration. Supplier metadata is
preserved internally for historical records and existing integrations.

Migration 20260929041110_automatic_lot_numbers.sql was applied to production
via the write-enabled Supabase connection. Full verification and disposable
PostgreSQL tests passed, including forced collisions, cross-product duplicates,
metadata-edit rejection, defaults, audit counts and service-only permissions.
The same transactional checks passed in production and rolled back all test
stock. Security advisors report only the existing informational RLS notices.
