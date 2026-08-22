-- ============================================================================
-- Tier One Bio — Supabase schema reference
-- ============================================================================
--
-- WHAT THIS IS
--   A written record of the database structure that backs customer accounts.
--   The live schema lives in the Supabase dashboard, not in this repo; without
--   this file there would be no reference at all if that project were lost.
--
-- VERIFIED
--   The columns, defaults, constraints, grants, policies, indexes and checkout
--   function below were checked against the live database on 2026-08-11.
--   Recheck them after any dashboard-side schema change with:
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
  email      text,
  full_name  text,
  phone      text,
  address    text,
  city       text,
  state      text,
  zip        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A customer may read only their own profile row.
create policy "Profiles are viewable by their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- A customer may create only a profile row belonging to themselves.
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

-- A customer may edit only their own row, and may not re-point it at someone
-- else. Both clauses are required: `using` governs which rows are targetable,
-- `with_check` governs what the row is allowed to look like afterwards.
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

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
  user_id         uuid references auth.users (id) on delete set null,
  order_number    text not null unique,
  status          text not null default 'PROCESSING',
  items           jsonb not null default '[]'::jsonb,
  items_text      text,            -- human-readable rendering, used in emails
  subtotal        numeric(10,2) not null default 0,
  discount_code   text,
  discount_amount numeric(10,2) not null default 0,
  shipping        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
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
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

-- Order creation is server-only. The browser cannot insert, update or delete
-- rows even if it calls the Supabase API directly.
revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;

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
-- These constraints apply to the service role and the dashboard too. CHECK
-- constraints are not bypassed by RLS-exempt roles.

alter table public.orders
  add constraint orders_amounts_nonneg
    check (subtotal >= 0 and discount_amount >= 0 and shipping >= 0 and total >= 0),
  add constraint orders_discount_sane
    check (discount_amount <= subtotal),
  add constraint orders_total_matches
    check (abs(total - (subtotal - discount_amount + shipping)) < 0.01),
  add constraint orders_status_valid
    check (status in ('AWAITING PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED','CONFIRMED'));

-- Product-price validation lives in create-order.js, which imports the same
-- catalog as the storefront. The browser never supplies authoritative totals.

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
  on public.discount_codes for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.discount_codes from anon, authenticated;
grant select on table public.discount_codes to authenticated;

-- One welcome code per customer. This constraint IS the idempotency guard —
-- Supabase retries webhook deliveries, and the function relies on catching the
-- 23505 from this index rather than on checking-then-inserting, which would
-- race two concurrent deliveries.
create unique index if not exists discount_codes_one_welcome_per_user
  on public.discount_codes (user_id)
  where source = 'welcome';

create index if not exists discount_codes_user_id_idx
  on public.discount_codes (user_id);

-- ─── Atomic order creation and personal-code redemption ────────────────────
-- Callable only by the server's service role. SECURITY INVOKER means the
-- function receives no privilege beyond its caller. If a personal code cannot
-- be redeemed, the exception rolls the order insert back as part of the same
-- transaction.
create or replace function public.create_order_transaction(
  order_payload jsonb,
  personal_discount_code text default null
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_order public.orders;
  existing_order public.orders;
  redeemed_rows integer;
begin
  if jsonb_typeof(order_payload) <> 'object'
     or coalesce(order_payload->>'order_number', '') !~ '^T1B-[0-9]{6}-[0-9]{6}$' then
    raise exception 'invalid_order_payload';
  end if;

  insert into public.orders (
    user_id, order_number, status, items, items_text, subtotal, discount_code,
    discount_amount, shipping, total, payment_method, customer_name,
    customer_email, customer_phone, ship_address, ship_city, ship_state, ship_zip
  ) values (
    nullif(order_payload->>'user_id', '')::uuid,
    order_payload->>'order_number',
    'PROCESSING',
    coalesce(order_payload->'items', '[]'::jsonb),
    order_payload->>'items_text',
    coalesce((order_payload->>'subtotal')::numeric, 0),
    nullif(order_payload->>'discount_code', ''),
    coalesce((order_payload->>'discount_amount')::numeric, 0),
    coalesce((order_payload->>'shipping')::numeric, 0),
    coalesce((order_payload->>'total')::numeric, 0),
    order_payload->>'payment_method',
    order_payload->>'customer_name',
    order_payload->>'customer_email',
    order_payload->>'customer_phone',
    order_payload->>'ship_address',
    order_payload->>'ship_city',
    order_payload->>'ship_state',
    order_payload->>'ship_zip'
  )
  on conflict (order_number) do nothing
  returning * into inserted_order;

  if inserted_order.id is not null then
    if personal_discount_code is not null then
      update public.discount_codes
      set redeemed_at = now(), order_number = inserted_order.order_number
      where code = personal_discount_code
        and user_id = inserted_order.user_id
        and redeemed_at is null
        and (expires_at is null or expires_at > now());
      get diagnostics redeemed_rows = row_count;
      if redeemed_rows <> 1 then
        raise exception 'discount_code_not_redeemable';
      end if;
    end if;
    return inserted_order;
  end if;

  select * into existing_order
  from public.orders
  where order_number = order_payload->>'order_number';
  return existing_order;
end;
$$;

revoke execute on function public.create_order_transaction(jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order_transaction(jsonb, text) to service_role;

-- Checkout receipts: see supabase/migrations/20260820220000_order_receipt_outbox.sql
-- for the durable Resend outbox (one row per order_id) and the
-- enqueue/claim/complete/fail RPCs. Those objects are service_role only.


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
