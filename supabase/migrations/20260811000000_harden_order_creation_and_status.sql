begin;

-- New orders start in the owner's requested workflow state. Existing rows keep
-- their historical values.
alter table public.orders alter column status set default 'PROCESSING';

-- The browser may read its own rows, but order writes are server-only.
drop policy if exists "Users can insert their own orders" on public.orders;
revoke all privileges on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;

drop policy if exists "Orders are viewable by their owner" on public.orders;
create policy "Orders are viewable by their owner"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

-- Use explicit roles and evaluate auth.uid() once per statement rather than
-- once per row. Keep the same customer-visible behavior.
drop policy if exists "Profiles are viewable by their owner" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
revoke all privileges on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
create policy "Profiles are viewable by their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Discount codes are viewable by their owner" on public.discount_codes;
revoke all privileges on table public.discount_codes from anon, authenticated;
grant select on table public.discount_codes to authenticated;
create policy "Discount codes are viewable by their owner"
  on public.discount_codes for select to authenticated
  using ((select auth.uid()) = user_id);

-- Validate the existing accounting constraints now that all current rows have
-- been checked and found clean.
alter table public.orders validate constraint orders_amounts_nonneg;
alter table public.orders validate constraint orders_discount_sane;
alter table public.orders validate constraint orders_total_matches;

alter table public.orders
  add constraint orders_status_valid
  check (status in (
    'AWAITING PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED',
    'CANCELLED', 'REFUNDED', 'CONFIRMED'
  )) not valid;
alter table public.orders validate constraint orders_status_valid;

create index if not exists orders_staff_queue_idx
  on public.orders (created_at desc, id desc);
create index if not exists orders_staff_status_queue_idx
  on public.orders (status, created_at desc, id desc);

-- Insert the order and consume a personal code in the same transaction. A
-- failed redemption raises and rolls the new insert back. A replay returns the
-- existing row; create-order.js checks that every immutable field matches
-- before returning any data to the caller.
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

revoke execute on function public.create_order_transaction(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_order_transaction(jsonb, text)
  to service_role;

-- This event-trigger helper needs elevated rights, so it must never be
-- directly executable through the public API roles.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

commit;
