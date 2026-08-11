-- ============================================================================
-- Tier One Bio — Supabase schema reference
-- ============================================================================
--
-- WHAT THIS IS
--   A written record of the database structure that backs customer accounts.
--   The live schema lives in the Supabase dashboard, not in this repo; without
--   this file there would be no reference at all if that project were lost.
--
-- WHAT IS VERIFIED vs RECONSTRUCTED
--   VERIFIED (read directly from the live database on 2026-08-04):
--     - Row-Level Security is ENABLED on both public.orders and public.profiles
--     - Every policy below matches pg_policies exactly, including which of
--       qual / with_check each one populates
--   RECONSTRUCTED (inferred from the application code, types are best-guess):
--     - The CREATE TABLE column lists. Column NAMES are accurate — they come
--       from the insert in site_1.jsx — but the exact types, defaults, and
--       nullability were not read from the live database.
--
--   Before trusting this file to rebuild anything, regenerate the authoritative
--   version by running this in the SQL editor and pasting the result over the
--   CREATE TABLE blocks below:
--
--     select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--     where table_schema = 'public' and table_name in ('orders','profiles')
--     order by table_name, ordinal_position;
--
-- THE RULE THAT MATTERS
--   Any new table holding customer data must have RLS enabled the day it is
--   created. A table without RLS is readable by anyone holding the publishable
--   key, which ships in the browser bundle and is public by design. Policies
--   alone are NOT sufficient — they are inert until RLS is switched on.
-- ============================================================================


-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per customer, keyed to the Supabase Auth user. Populated at signup
-- from the metadata passed to supabase.auth.signUp(), and editable by the
-- customer on the account page.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  address    text,
  city       text,
  state      text,
  zip        text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A customer may read only their own profile row.
create policy "Profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

-- A customer may create only a profile row belonging to themselves.
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- A customer may edit only their own row, and may not re-point it at someone
-- else. Both clauses are required: `using` governs which rows are targetable,
-- `with_check` governs what the row is allowed to look like afterwards.
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- NOTE: there is deliberately no DELETE policy. Profile rows are removed by
-- the cascade from auth.users, not by the customer.
--
-- WARNING — read before adding columns to this table.
--   The UPDATE policy authorises the ROW, not individual COLUMNS. A customer
--   can write any column in their own row. Adding a privilege column here
--   (is_admin, role, credit_balance, discount_tier, …) would therefore create
--   self-service privilege escalation: any signed-in user could grant it to
--   themselves with a single API call.
--   Keep privilege and money fields in a separate table that has no
--   user-writable policy at all.


-- ─── orders ─────────────────────────────────────────────────────────────────
-- Durable order history. Signed-in orders carry the customer's user id and
-- appear in their account; guest orders carry a null user id but are still
-- recorded for staff fulfillment by the server-side checkout function.

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  order_number    text not null,
  status          text not null default 'CONFIRMED',
  items           jsonb,           -- structured line items
  items_text      text,            -- human-readable rendering, used in emails
  subtotal        numeric(10,2) not null,
  discount_code   text,
  discount_amount numeric(10,2) not null default 0,
  shipping        numeric(10,2) not null default 0,
  total           numeric(10,2) not null,
  payment_method  text,
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  ship_address    text,
  ship_city       text,
  ship_state      text,
  ship_zip        text,
  created_at      timestamptz not null default now()
);

alter table public.orders enable row level security;

-- A customer may read only their own orders.
create policy "Orders are viewable by their owner"
  on public.orders for select
  using (auth.uid() = user_id);

-- A customer may create orders only under their own user_id.
create policy "Users can insert their own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- NOTE: there are deliberately no UPDATE or DELETE policies. Under RLS, a
-- command with no policy is denied, which makes order history append-only from
-- the customer's side — they cannot retroactively alter or erase an order.
-- Staff edits go through netlify/functions/admin-orders.js. It revalidates the
-- staff user's protected app_metadata role before using the server-only service
-- key. Customers never receive an UPDATE policy or the service key.


-- ─── Order integrity constraints ────────────────────────────────────────────
-- RLS answers "whose row is this"; it says nothing about whether the contents
-- are sane. Order rows are written by the browser, so every amount in them is
-- client-supplied. Without these checks a signed-in customer could insert a
-- fully-formed order with total = 0.
--
-- Added NOT VALID so pre-existing development rows are grandfathered. NOT VALID
-- still enforces on every INSERT and UPDATE from this point forward; it only
-- skips the backfill scan.
--
-- These constraints apply to the service role and the dashboard too. CHECK
-- constraints are not bypassed by RLS-exempt roles.

alter table public.orders
  add constraint orders_amounts_nonneg
    check (subtotal >= 0 and discount_amount >= 0 and shipping >= 0 and total >= 0)
    not valid,
  add constraint orders_discount_sane
    check (discount_amount <= subtotal)
    not valid,
  add constraint orders_total_matches
    check (abs(total - (subtotal - discount_amount + shipping)) < 0.01)
    not valid;

-- Optional. Extend the list before running if you use other status words —
-- a status not named here will be rejected in the dashboard as well as the app.
-- alter table public.orders
--   add constraint orders_status_valid
--     check (status in ('AWAITING PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED','CONFIRMED'))
--     not valid;

-- LIMIT OF THESE CHECKS
--   They enforce internal arithmetic consistency only. Because product prices
--   live in the JavaScript bundle rather than in Postgres, the database has
--   nothing to compare a line item against — an order claiming subtotal 0 for
--   real items still satisfies every constraint above. Closing that gap needs
--   either a products table in Postgres or moving the insert into a Netlify
--   function that recomputes the price server-side. It is currently accepted
--   risk: payment is confirmed manually via Venmo / Cash App before anything
--   ships, so a forged row is a bookkeeping problem, not free product.

-- The staff console pages by (created_at, id), and its busiest queue is a
-- single status ordered newest-first. These indexes keep those reads bounded
-- as the order table grows instead of sorting the full table on each refresh.
create index if not exists orders_staff_queue_idx
  on public.orders (created_at desc, id desc);

create index if not exists orders_staff_status_queue_idx
  on public.orders (status, created_at desc, id desc);


-- ─── discount_codes ─────────────────────────────────────────────────────────
-- Per-customer single-use codes. Currently only the welcome code, minted by
-- netlify/functions/send-welcome-email.js when a customer confirms their email.
--
-- Applied to the live database on 2026-08-05 (migration: create_discount_codes),
-- so unlike the tables above this block is VERIFIED, not reconstructed.
--
-- This is the "separate table with no user-writable policy" that the warning on
-- profiles calls for. Value and redeemed_at are money fields: if they lived on
-- profiles, the customer's own UPDATE policy would let them set their discount
-- to 99% and un-redeem a spent code.

create table if not exists public.discount_codes (
  code         text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         text not null default 'percent' check (type in ('percent','fixed')),
  value        numeric(10,2) not null check (value > 0),
  label        text,
  source       text not null default 'welcome',
  expires_at    timestamptz,
  redeemed_at   timestamptz,          -- null = unspent
  order_number  text,                 -- the order that consumed it
  email_sent_at timestamptz,          -- null = minted but never delivered
  created_at    timestamptz not null default now()
);

-- WHY email_sent_at EXISTS (added 2026-08-07, after it bit us in testing).
--   "A code row exists" and "the customer knows about it" are different facts.
--   Resend rejected the first live send with 401, the code row stayed, and the
--   one-welcome-per-user index below made every retry skip -- leaving a
--   customer holding a code nothing could ever tell them about. The send path
--   now re-sends when this column is null and only skips once it is set.

alter table public.discount_codes enable row level security;

-- Read-only to the owner. There are deliberately no INSERT, UPDATE or DELETE
-- policies: under RLS a command with no policy is denied, so only the service
-- role used by the Netlify Functions can mint a code or mark one redeemed.
create policy "Discount codes are viewable by their owner"
  on public.discount_codes for select
  using (auth.uid() = user_id);

-- One welcome code per customer. This constraint IS the idempotency guard —
-- Supabase retries webhook deliveries, and the function relies on catching the
-- 23505 from this index rather than on checking-then-inserting, which would
-- race two concurrent deliveries.
create unique index if not exists discount_codes_one_welcome_per_user
  on public.discount_codes (user_id)
  where source = 'welcome';

create index if not exists discount_codes_user_id_idx
  on public.discount_codes (user_id);

-- REDEMPTION IS NOT TRANSACTIONAL WITH THE ORDER.
--   The order row is inserted by the browser; the code is burned by a separate
--   call to redeem-discount.js afterwards. Two checkouts racing in different
--   tabs can therefore both place an order before either redemption lands.
--   The `is redeemed_at null` filter in that function means only one UPDATE
--   wins, so the ledger stays correct, but the second order still went through
--   with the discount applied. Accepted for the same reason as the order-total
--   caveat above: payment is confirmed manually before anything ships.


-- ─── Verifying this file still matches production ───────────────────────────
-- RLS must be true for both tables:
--
--   select c.relname, c.relrowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname in ('orders','profiles');
--
-- Every policy's qual/with_check must reference auth.uid(). A policy whose
-- qual is `true` exposes every customer's name, email, phone and home address
-- to any signed-in user:
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public';
