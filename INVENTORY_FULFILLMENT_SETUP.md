# Inventory and fulfillment launch guide

The secure inventory, order workflow, and fulfillment code went live on 2026-08-11. The database migration and first protected staff role are also complete. **Do not run either SQL statement again.** Shippo, PrintNode, real lot identifiers, and the end-to-end test remain to be completed below.

## What the system does

- Every one of the 27 catalog products starts with 50 units of active inventory.
- Those opening units sit in clearly marked provisional lots until their real lot and supplier batch IDs are entered.
- Placing an order immediately reserves the required units so two customers cannot buy the same last vial.
- Clicking **Confirm Payment** in the staff order screen commits the reserved units and reduces on-hand inventory.
- Cancelling an unpaid order releases its reservation.
- Pick tickets and customer packing slips are generated together as a private two-page PDF.
- Fulfillment documents and shipping labels stay blocked until payment is confirmed and every allocated vial has a real lot number.
- Shippo is called directly by the secure server function. Supabase does not need to appear in Shippo's platform-sync list.
- A purchased Shippo 4×6 label can print automatically through PrintNode.

The default parcel is 9 × 4.25 × 0.5 inches and 1.9 ounces. The 0.5-inch thickness is a temporary assumption because Shippo requires all three dimensions. Staff can change dimensions and weight before requesting each rate.

## Security model

- Supabase, Shippo, and PrintNode secret keys exist only in server-side Netlify environment variables. Never give any of them a `VITE_` prefix.
- The browser sends a normal Supabase session token. Every staff function validates it with Supabase and then checks protected `app_metadata.role` for `admin` or `order_manager`.
- Inventory tables have Row Level Security enabled and explicitly grant no access to `anon` or `authenticated` users.
- Order placement, discount redemption, and stock reservation occur in one database transaction with row locks.
- Payment confirmation and stock deduction occur in one database transaction with compare-and-set status checks.
- Inventory quantities cannot fall below reserved quantities.
- Quantity changes require a written reason. Quantity changes, lot metadata changes, order transitions, label purchases, and print jobs are retained in append-only audit tables.
- Orders are cancelled, never permanently deleted.
- Shippo label purchase is locked before the charge is attempted. An uncertain network result is not retried automatically, preventing accidental duplicate postage charges.
- The production build scans for Supabase, Shippo, PrintNode, and Resend secrets and fails before deployment if one reaches the browser bundle.

## 1. Supabase migration — complete

This was successfully applied and verified live: 27 products, 27 provisional lots, 1,350 units available, and zero units reserved at launch. There is no setup mode. Do not paste or run the migration again.

## 2. First staff account — complete

The first staff role was successfully applied and verified. Sign out of the Tier One website and sign back in once so the browser session receives the protected role. The permission remains in `app_metadata`, not customer-editable `user_metadata`.

For a future fulfillment employee, open **Supabase → SQL Editor**, replace the email below, and run it once:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where lower(email) = lower('OWNER_EMAIL_HERE');
```

Use `order_manager` instead of `admin` for a fulfillment employee who should manage orders and inventory but should not be treated as the owner elsewhere.

## 3. Configure Shippo in Netlify

Shippo's “sync orders from a platform” screen can be skipped. This app sends paid orders directly to Shippo through its API.

1. In Shippo, create or copy an API token. Use a test token for the first test shipment and a live token only when ready to buy real postage.
2. In Netlify, open the Tier One site.
3. Go to **Project configuration → Environment variables**.
4. Add the variables below. Set their scope so Functions can read them. Do not add `VITE_` to any name.

```text
SHIPPO_API_TOKEN
SHIP_FROM_NAME
SHIP_FROM_COMPANY
SHIP_FROM_STREET1
SHIP_FROM_STREET2          optional
SHIP_FROM_CITY
SHIP_FROM_STATE
SHIP_FROM_ZIP
SHIP_FROM_COUNTRY          use US
SHIP_FROM_PHONE
SHIP_FROM_EMAIL
```

5. Save the variables. Netlify will use them on the next deploy.

The customer address, parcel measurements, and selected rate are sent only from the server. The Shippo token is never sent to the browser.

### Local handoff orders

When confirming payment in `/admin/orders`, choose the actual payment channel
and select **Hand directly to customer**. Inventory is committed normally, but
the order permanently blocks fulfillment PDFs, PrintNode jobs, Shippo rates,
and postage. Use **Mark Handed Off** when the customer receives it.

The inventory overview's **Retail Value** is the current on-hand quantity times
the active single-vial price displayed by the website. It is a retail-value
estimate, not inventory cost or profit.

## 4. Configure PrintNode in Netlify

1. Install the PrintNode desktop client on the always-on computer connected to the printers.
2. Sign in to the client and confirm both printers show online in PrintNode.
3. In PrintNode, note the numeric ID of the normal letter-size printer and the 4×6 thermal label printer.
4. In **Netlify → Project configuration → Environment variables**, add:

```text
PRINTNODE_API_KEY
PRINTNODE_FULFILLMENT_PRINTER_ID
PRINTNODE_LABEL_PRINTER_ID
```

5. Save the variables. Never put the API key in the website code or in a variable beginning with `VITE_`.

The fulfillment printer receives the two-page pick-ticket/packing-slip PDF. The label printer receives Shippo's 4×6 PDF label.

## 5. Replace provisional lots

1. Sign in to the website with the staff account.
2. Open `/admin/inventory`.
3. Expand each product marked **real lot ID needed**.
4. Enter its real lot number, supplier batch ID, expiration date, and physical storage location.
5. Click **Save Lot Details**.

Orders can reserve the starting inventory immediately, even while lot IDs are provisional. Printing and label purchase remain blocked for affected orders until their allocated provisional lots are renamed.

## 6. Test before using a real order

1. Place a small test order with Cash App or Venmo.
2. Confirm the inventory screen shows those units as **Reserved** while on-hand remains unchanged.
3. In `/admin/orders`, click **Confirm Payment**.
4. Confirm reserved decreases and on-hand decreases by the ordered quantity.
5. Open the fulfillment PDF and verify item, quantity, lot, location, and address.
6. Click **Mark Picked**, then **Mark Packed** after completing those steps.
7. With a Shippo test token, request rates and create a test label.
8. Confirm the pick packet goes to the letter printer and the label goes to the 4×6 printer.
9. Cancel a separate unpaid test order and confirm its reserved units return to available stock.

## Before the first live label

- Confirm the actual package thickness. The current editable default is 0.5 inch.
- Confirm 1.9 ounces still reflects the packed shipment. Enter the real packed weight whenever it changes; the UI refuses anything above 16 ounces under this package profile.
- Switch from the Shippo test token to the live token only after the test label works.
- Keep the PrintNode computer awake, online, and signed in.
