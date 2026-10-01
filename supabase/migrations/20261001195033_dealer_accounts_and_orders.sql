-- Server-managed accounts: a customer cannot promote themselves or edit rates.
create table public.dealer_accounts (
  user_id uuid primary key references auth.users(id),
  display_name text not null check (length(display_name) between 1 and 120),
  percent_off numeric(5,2) not null check (percent_off > 0 and percent_off < 100),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.dealer_accounts enable row level security;
revoke all on public.dealer_accounts from public, anon, authenticated;
grant select, insert, update on public.dealer_accounts to service_role;

alter table public.orders add column dealer_sale jsonb;
alter table public.orders add constraint dealer_sale_shape check (
  dealer_sale is null or coalesce((
    jsonb_typeof(dealer_sale) = 'object'
    and dealer_sale ?& array['dealerId','dealerName','percentOff','customerReference','delivery','retailItems','dealerItems','customerTotal','dealerTotal','retained']
    and dealer_sale->>'dealerId' = user_id::text
    and (dealer_sale->>'dealerTotal')::numeric = total
    and (dealer_sale->>'customerTotal')::numeric = total + (dealer_sale->>'retained')::numeric
    and (dealer_sale->>'retained')::numeric >= 0
    and dealer_sale->>'delivery' in ('LOCAL_HANDOFF','SHIP_TO_DEALER','SHIP_TO_CUSTOMER')
  ), false)
);
create index orders_dealer_created_idx on public.orders (user_id, created_at desc, id desc) where dealer_sale is not null;

-- Reuse the existing inventory/backorder/expiry transaction. The outer RPC
-- holds the account lock across insertion and saves the snapshot atomically.
alter function public.create_order_transaction(jsonb,text) rename to create_order_transaction_before_dealers;
create function public.create_order_transaction(order_payload jsonb, personal_discount_code text default null)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare
  saved public.orders;
  account public.dealer_accounts;
  sale jsonb := order_payload->'dealer_sale';
  created boolean;
begin
  -- Serialize even the first insertion/retry of the same order number.
  perform pg_advisory_xact_lock(hashtextextended(order_payload->>'order_number', 0));
  select * into saved from public.orders where order_number = order_payload->>'order_number';
  created := saved.id is null;
  if created and sale is not null and sale <> 'null'::jsonb then
    select * into account from public.dealer_accounts
      where user_id = (order_payload->>'user_id')::uuid for share;
    if account.user_id is null or not account.active then raise exception 'dealer_not_active'; end if;
    if account.percent_off <> (sale->>'percentOff')::numeric then raise exception 'dealer_rate_changed'; end if;
    if sale->>'dealerId' <> account.user_id::text or personal_discount_code is not null
       or coalesce(order_payload->>'discount_code','') <> '' then raise exception 'invalid_dealer_order'; end if;
  end if;
  saved := public.create_order_transaction_before_dealers(order_payload, personal_discount_code);
  if created and sale is not null and sale <> 'null'::jsonb then
    update public.orders set dealer_sale = sale,
      fulfillment_method = case when sale->>'delivery' = 'LOCAL_HANDOFF' then 'LOCAL_HANDOFF' else 'SHIP' end
      where id = saved.id returning * into saved;
    insert into public.order_events(order_id,event_type,actor_user_id,details)
      values(saved.id,'DEALER_ORDER_PLACED',saved.user_id,sale);
  end if;
  return saved;
end;
$$;
revoke all on function public.create_order_transaction(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_order_transaction(jsonb,text) to service_role;
revoke all on function public.create_order_transaction_before_dealers(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_order_transaction_before_dealers(jsonb,text) to service_role;

-- Protect historical economics even if later staff workflow updates the order.
create function public.protect_dealer_sale() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.dealer_sale is not null and new.dealer_sale is distinct from old.dealer_sale then
    raise exception 'dealer_sale_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_dealer_sale() from public,anon,authenticated;
create trigger protect_dealer_sale before update on public.orders for each row execute function public.protect_dealer_sale();

create table public.dealer_account_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.dealer_accounts(user_id),
  actor_user_id uuid not null references auth.users(id),
  before_settings jsonb,
  after_settings jsonb not null,
  created_at timestamptz not null default now()
);
create index dealer_account_events_user_idx on public.dealer_account_events(user_id,created_at desc);
create index dealer_account_events_actor_idx on public.dealer_account_events(actor_user_id);
alter table public.dealer_account_events enable row level security;
revoke all on public.dealer_account_events from public,anon,authenticated;
grant select,insert on public.dealer_account_events to service_role;
create trigger dealer_account_events_immutable before update or delete on public.dealer_account_events
for each row execute function public.prevent_audit_mutation();

create function public.save_dealer_account(p_user_id uuid,p_name text,p_percent_off numeric,p_active boolean,p_actor uuid)
returns public.dealer_accounts language plpgsql security invoker set search_path = '' as $$
declare previous public.dealer_accounts; saved public.dealer_accounts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));
  select * into previous from public.dealer_accounts where user_id=p_user_id for update;
  insert into public.dealer_accounts(user_id,display_name,percent_off,active)
    values(p_user_id,p_name,p_percent_off,p_active)
    on conflict(user_id) do update set display_name=excluded.display_name,percent_off=excluded.percent_off,active=excluded.active,updated_at=now()
    returning * into saved;
  insert into public.dealer_account_events(user_id,actor_user_id,before_settings,after_settings)
    values(p_user_id,p_actor,case when previous.user_id is null then null else to_jsonb(previous) end,to_jsonb(saved));
  return saved;
end;
$$;
revoke all on function public.save_dealer_account(uuid,text,numeric,boolean,uuid) from public,anon,authenticated;
grant execute on function public.save_dealer_account(uuid,text,numeric,boolean,uuid) to service_role;

create function public.dealer_account_summary(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'orders', count(*),
    'customerSales', coalesce(sum((dealer_sale->>'customerTotal')::numeric),0),
    'retained', coalesce(sum(case when payment_status='PAID' then (dealer_sale->>'retained')::numeric else 0 end),0),
    'paid', coalesce(sum(case when payment_status='PAID' then coalesce(payment_amount_received,total) else 0 end),0),
    'owed', coalesce(sum(case when payment_status='PAID' then greatest(0,total-coalesce(payment_amount_received,total)) else total end),0)
  ) from public.orders where user_id=p_user_id and dealer_sale is not null and payment_status not in ('CANCELLED','REFUNDED');
$$;
revoke all on function public.dealer_account_summary(uuid) from public,anon,authenticated;
grant execute on function public.dealer_account_summary(uuid) to service_role;
