# Security and privacy rollout

Status: **code only — not deployed, migration not applied, pull request not merged**.

This release adds a durable checkout-receipt outbox, Cloudflare Turnstile at
checkout, opt-in analytics with Cookie Settings, and the public security
disclosure files. The production database migration is additive: it creates a
new table and four service-role-only functions, and does not alter existing
orders, inventory, lots, fulfillment, or the processed-order email outbox.

## Rollout checklist

Complete these in order. Do not merge the pull request until steps 1–3 are
finished.

### 1. Create the production Turnstile widget

1. Sign in to Cloudflare and open **Turnstile**.
2. Click **Add widget**.
3. Name it `Tier One checkout`.
4. Add both allowed hostnames: `tierone.bio` and `www.tierone.bio`.
5. Choose the **Managed** widget type and save.
6. Copy the **Site Key** and **Secret Key**. The site key is public; the secret
   key must remain server-only.

### 2. Add the Netlify environment variables

1. In Netlify, open the Tier One site.
2. Go to **Project configuration → Environment variables**.
3. Add `VITE_TURNSTILE_SITE_KEY` with the Cloudflare **Site Key**. Make it
   available to **Builds** in the **Production** deploy context.
4. Add `TURNSTILE_SECRET_KEY` with the Cloudflare **Secret Key**. Make it
   available to **Functions** in the **Production** deploy context. Do not add
   `VITE_` to this secret.
5. Confirm the existing `RESEND_API_KEY`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` remain available to Functions. Do not rotate or
   rename them for this release.
6. For a Netlify Deploy Preview, use Cloudflare's public always-pass test pair
   in the **Deploy Previews** context only:

   - `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`
   - `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`

   Never put the test pair in the Production context.

### 3. Apply only the new Supabase migration

Production migration history was checked read-only on 2026-08-25. It records
the existing migrations under server-generated version numbers that differ
from some repository filenames. For that reason, **do not run a blind
`supabase db push`**.

1. Keep the pull request unmerged.
2. In Codex with the connected Supabase project `nmafhetkofrekabqawgb`, apply
   [the migration](./supabase/migrations/20260825183632_add_order_receipt_outbox.sql)
   once with the migration name `add_order_receipt_outbox`.
3. Confirm the migration list now contains `add_order_receipt_outbox` exactly
   once.
4. Run these read-only checks:

```sql
select relrowsecurity
from pg_class
where oid = 'public.order_receipt_outbox'::regclass;

select
  has_table_privilege('anon', 'public.order_receipt_outbox', 'select') as anon_can_read,
  has_table_privilege('authenticated', 'public.order_receipt_outbox', 'select') as authenticated_can_read,
  has_function_privilege('anon', 'public.enqueue_order_receipt(uuid)', 'execute') as anon_can_enqueue,
  has_function_privilege('authenticated', 'public.enqueue_order_receipt(uuid)', 'execute') as authenticated_can_enqueue;

select status, count(*)
from public.order_receipt_outbox
group by status;
```

Expected results: `relrowsecurity` is `true`; all four privilege checks are
`false`; the status query returns no rows before the website deploy.

5. Run the Supabase security advisor. The expected notices are the existing
   informational `RLS Enabled No Policy` messages for server-only operational
   tables. The new outbox may appear as another intentional informational
   notice because browser roles have no policy or grants.

### 4. Merge and deploy

1. Merge the pull request only after steps 1–3 pass.
2. Netlify will build from `main` automatically.
3. Wait for the Production deploy to show **Published**. There is no manual
   Netlify deploy step.
4. Confirm the deploy used the production Turnstile keys, not the test pair.

### 5. Verify the public security and consent behavior

1. Open `https://www.tierone.bio/.well-known/security.txt`. Confirm it is plain
   text and lists `sales@tierone.bio`, the `/security` policy URL, the canonical
   URL, and the future expiry.
2. Open `https://www.tierone.bio/security`. Confirm the disclosure page and
   footer link render.
3. Open a private browser window and DevTools → **Network**. Filter for
   `googletagmanager` and load the homepage. Confirm there is no analytics
   request before a choice.
4. Click **Accept analytics**. Confirm the gtag request appears.
5. In the footer click **Cookie Settings → Reject analytics**. In DevTools →
   **Application → Cookies**, confirm `_ga` and `_ga_HY1FDLSRTJ` are gone. The
   cart must remain intact.

### 6. Verify checkout without disturbing live inventory

1. Place one controlled test order for one vial and choose Zelle so checkout
   stays on the confirmation screen rather than opening another payment app.
2. Complete the Turnstile widget and place the order.
3. Confirm the page shows the saved order number and the emailed-receipt result.
4. Confirm the customer receipt and the existing staff alert arrive. The
   receipt must include the current Zelle wording and server-confirmed total.
5. Run this read-only query using that order number:

```sql
select o.order_number, r.status, r.attempt_count, r.provider_message_id, r.sent_at
from public.order_receipt_outbox r
join public.orders o on o.id = r.order_id
where o.order_number = 'REPLACE_WITH_TEST_ORDER_NUMBER';
```

Expected result: one row with `status = 'SENT'`, one provider message ID, and no
duplicate outbox row.

6. In `/admin/orders`, cancel the unpaid test order so its reservation returns
   to available inventory. Do not confirm payment for this test.

## Rollback checklist

Use the application rollback first. The additive database objects are safe to
leave in place and preserve the receipt audit trail.

### Immediate application rollback

1. In Netlify open **Deploys**.
2. Open the last known-good production deploy from before this pull request.
3. Choose **Publish deploy** and confirm.
4. Verify checkout no longer requires Turnstile and that order creation uses
   the previous function bundle.
5. Leave `order_receipt_outbox` and its functions in Supabase. Leaving them is
   the safest rollback because it loses no queued or sent receipt records.
6. Leave the Turnstile environment variables in Netlify until the rollback is
   verified. They are inert in the old bundle and can be removed afterward.

Note: rolling back the entire deploy also restores the previous analytics
behavior, removes Cookie Settings, and removes the new security page. If only
one feature is faulty, prefer a small follow-up pull request over a full deploy
rollback.

### Full database teardown — only if explicitly required

1. Keep the old application deploy live.
2. Check for unsent receipts:

```sql
select status, count(*)
from public.order_receipt_outbox
where status <> 'SENT'
group by status;
```

3. If any row is returned, stop. Restore the new function bundle long enough to
   drain the queue or handle those customers manually. Do not drop the table.
4. If there are no unsent rows and the audit history has been exported, create
   a **new versioned rollback migration** with the following SQL; do not edit or
   delete the already-applied migration:

```sql
begin;
drop function if exists public.fail_order_receipt(uuid, uuid, text, boolean);
drop function if exists public.complete_order_receipt(uuid, uuid, text);
drop function if exists public.claim_order_receipt(uuid);
drop function if exists public.enqueue_order_receipt(uuid);
drop table if exists public.order_receipt_outbox;
commit;
```

5. Apply that rollback migration once through the connected Supabase migration
   tool and verify the table no longer exists.
6. Remove `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY` from Netlify.
7. Disable or delete the `Tier One checkout` widget in Cloudflare.

No production migration, deploy, merge, or rollback action is part of this pull
request.
