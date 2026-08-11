# Staff order management

The site now has a staff-only order console at:

`https://www.tierone.bio/admin/orders`

It provides server-side search, status filtering, 50-order cursor pagination,
expandable order details, and guarded status changes. If two staff members load
the same order, the second person's stale change is stopped rather than silently
overwriting the first person's work. Staff can also permanently delete test
orders without typing an order number.

## Database setup

The queue indexes, status constraint and server-only order permissions were
applied to the live database on 2026-08-11. There is no database setup left for
the owner to run.

## One-time access setup for each staff member

Staff use normal Tier One accounts. Their extra permission is stored in
Supabase `app_metadata`, which customers cannot edit themselves.

1. Have the staff member create an account on the Tier One site and confirm the
   email address.
2. Open **Supabase** and select the Tier One project.
3. In the left sidebar, click **SQL Editor**, then **New query**.
4. Paste the query below. Replace `staff@example.com` with the exact email used
   for the staff account.

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"order_manager"}'::jsonb
where lower(email) = lower('staff@example.com')
returning email, raw_app_meta_data;
```

5. Click **Run**. One row should be returned, and its metadata should contain
   `"role": "order_manager"`. If no row is returned, recheck the email.
6. Have the staff member sign out of Tier One and sign in again. This refreshes
   the permission in their session.
7. Open `/account`. The **Manage Orders** button is visible only to authorized
   staff, or the staff member can bookmark `/admin/orders` directly.

The Netlify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables already
used by checkout are also used by this function; no new Netlify setting is
required.

## Removing access

Run this in **Supabase → SQL Editor**, again replacing the email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
where lower(email) = lower('staff@example.com')
returning email, raw_app_meta_data;
```

Then have that person sign out. Existing access tokens expire automatically;
for urgent removal, also use **Supabase → Authentication → Users** to sign out
or ban the account.

## Status meanings

- **Awaiting payment (legacy)** — retained for older rows; new orders no longer
  start here.
- **Paid** — payment has been verified.
- **Processing** — the default for every new order; it is being prepared.
- **Shipped** — the package has left fulfillment.
- **Delivered** — delivery is complete.
- **Cancelled** — the order will not be fulfilled.
- **Refunded** — money was returned.
- **Confirmed (legacy)** — an older status retained so pre-existing orders can
  be found and moved into the current workflow.

## Deleting a test order

1. Change the order's status to **Cancelled** and click **Update**.
2. Expand **View fulfillment details**.
3. Click **Delete Order**.
4. Review the order number, customer and total in the warning, then click
   **Permanently Delete**. Click **Keep Order** or press Escape to back out.

Deletion is permanent: the order also disappears from the customer's account.
If the order used a personal discount code, deleting the order does not restore
that code. The server checks staff access again and refuses to delete an order
that is not still cancelled.
