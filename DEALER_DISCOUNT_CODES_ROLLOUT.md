# Dealer Desk discount codes

Status: prepared for review; not deployed and the production migration is not applied.

Dealer Desk accepts the same validated merchandise and free-shipping codes as
regular checkout. A merchandise code reduces the customer's product total first.
David retains 60% of that adjusted product total and pays Tier One the remaining
40%, plus any shipping. For example, $100 with a 10% code becomes $90: David keeps
$54 and pays Tier One $36. Shipping passes through equally and earns no dealer
share. Its existing free-shipping threshold uses the adjusted Tier One product
amount. Code availability during a sitewide sale follows regular checkout.

The server verifies codes, account ownership, current dealer terms and the shown
quote. Personal codes are restricted to the signed-in dealer and redeemed in the
same transaction as the order and inventory reservation. Saved orders keep their
original code and economics on retries, even if the code expires or is removed,
or the dealer rate changes. Both dashboards use the saved discounted totals.
Existing ordinary orders are not converted into dealer orders.

With a merchandise code, the retained share is rounded once to the nearest cent
on the adjusted product basket. Tier One receives the remaining cents. Pre-code
dealer line totals are apportioned in cents and displayed without per-vial
estimates; the code reduction appears separately. Orders without merchandise
codes retain the established per-vial calculation. Historical snapshots never
change.

## Before merging or deploying

The existing database function rejects dealer discount codes. Apply only
`supabase/migrations/20261007190000_allow_dealer_discount_codes.sql` to the Tier One
Supabase project before deploying this application change. Do not run a blind
`supabase db push`: production migration versions differ from some repository
filenames.

If using the Supabase dashboard:

1. Open Supabase and select the Tier One project.
2. Open **SQL Editor**, then **New query**.
3. Paste the complete new migration file above and click **Run** once.
4. Confirm the query succeeds before merging the website pull request.

The migration replaces only the dealer order transaction wrapper, keeps it
server-only, and supports legacy no-code application payloads. It creates no
new credentials or settings and changes no historical orders. Prefer applying
through the connected Supabase migration tool when available so migration
history records the change.

## Validation and release

Run `npm run verify` and `node scripts/test-backorders-db.mjs` before release.
The latter runs a disposable PostgreSQL database, including the dealer code
tests; it never uses production. In the prepared cloud workspace, use the scoped
Docker readiness helper described in its startup instructions when needed.

After the database migration succeeds, merge through the repository's required
verification process. Netlify builds and deploys the release branch automatically.
Check the published deploy before asking David to use the feature. He should open
**My Account → Dealer Desk**, add products, enter his usual code and click
**Apply code**. The quote shows what his customer pays, what he keeps, and what
Tier One receives. Record a real order only when intended; do not create live
test orders solely to verify the display.
