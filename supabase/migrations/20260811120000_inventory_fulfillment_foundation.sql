begin;

-- Separate payment from fulfillment. The legacy status column remains as the
-- compact customer-facing summary used by the existing account page.
alter table public.orders alter column status set default 'AWAITING PAYMENT';
alter table public.orders
  add column payment_status text not null default 'AWAITING_PAYMENT',
  add column fulfillment_status text not null default 'ON_HOLD',
  add column payment_confirmed_at timestamptz,
  add column updated_at timestamptz not null default now();

update public.orders
set payment_status = case
      when status in ('SHIPPED', 'DELIVERED') then 'PAID'
      when status = 'REFUNDED' then 'REFUNDED'
      when status = 'CANCELLED' then 'CANCELLED'
      else 'AWAITING_PAYMENT'
    end,
    fulfillment_status = case
      when status = 'SHIPPED' then 'SHIPPED'
      when status = 'DELIVERED' then 'DELIVERED'
      when status = 'CANCELLED' then 'CANCELLED'
      else 'ON_HOLD'
    end;

alter table public.orders
  add constraint orders_payment_status_valid
    check (payment_status in ('AWAITING_PAYMENT', 'PAID', 'REFUNDED', 'CANCELLED')),
  add constraint orders_fulfillment_status_valid
    check (fulfillment_status in (
      'ON_HOLD', 'READY_TO_PICK', 'PICKED', 'PACKED', 'LABEL_CREATED',
      'SHIPPED', 'DELIVERED', 'CANCELLED'
    ));

create index orders_payment_queue_idx
  on public.orders (payment_status, created_at desc, id desc);
create index orders_fulfillment_queue_idx
  on public.orders (fulfillment_status, created_at desc, id desc);

-- One row per sellable catalog variant. Product names and doses are snapshots
-- for the staff console; the product id remains the durable join key.
create table public.inventory_products (
  product_id       text primary key,
  product_name     text not null,
  dose             text not null,
  reorder_point    integer not null default 10 check (reorder_point >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint inventory_products_id_valid
    check (product_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  constraint inventory_products_name_valid check (length(product_name) between 1 and 120),
  constraint inventory_products_dose_valid check (length(dose) between 1 and 60)
);

create table public.inventory_lots (
  id                 uuid primary key default gen_random_uuid(),
  product_id         text not null references public.inventory_products (product_id) on delete restrict,
  lot_number         text not null,
  supplier_batch_id  text,
  is_provisional     boolean not null default false,
  received_quantity  integer not null check (received_quantity >= 0),
  on_hand             integer not null check (on_hand >= 0),
  reserved            integer not null default 0 check (reserved >= 0),
  expires_on          date,
  storage_location    text,
  received_at         date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint inventory_lots_reserved_not_overdrawn check (reserved <= on_hand),
  constraint inventory_lots_number_valid check (length(lot_number) between 1 and 80),
  constraint inventory_lots_batch_valid check (supplier_batch_id is null or length(supplier_batch_id) <= 120),
  constraint inventory_lots_location_valid check (storage_location is null or length(storage_location) <= 120),
  unique (product_id, lot_number)
);

create index inventory_lots_allocation_idx
  on public.inventory_lots (product_id, is_provisional, expires_on, received_at, id)
  where on_hand > 0;

create table public.inventory_reservations (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete restrict,
  product_id    text not null references public.inventory_products (product_id) on delete restrict,
  lot_id        uuid not null references public.inventory_lots (id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  state         text not null default 'RESERVED'
    check (state in ('RESERVED', 'COMMITTED', 'RELEASED')),
  created_at    timestamptz not null default now(),
  committed_at  timestamptz,
  released_at   timestamptz,
  unique (order_id, lot_id)
);

create index inventory_reservations_order_idx
  on public.inventory_reservations (order_id, state);
create index inventory_reservations_lot_idx
  on public.inventory_reservations (lot_id, state);

-- Append-only ledger. Current counters live on inventory_lots for fast,
-- locked allocation; this table explains every change to those counters.
create table public.inventory_movements (
  id                  bigint generated always as identity primary key,
  product_id          text not null references public.inventory_products (product_id) on delete restrict,
  lot_id              uuid not null references public.inventory_lots (id) on delete restrict,
  order_id            uuid references public.orders (id) on delete restrict,
  movement_type       text not null check (movement_type in (
    'OPENING_BALANCE', 'RECEIPT', 'RESERVATION', 'RESERVATION_RELEASE',
    'SALE', 'ADJUSTMENT', 'RETURN'
  )),
  on_hand_delta       integer not null default 0,
  reserved_delta      integer not null default 0,
  reason              text,
  actor_user_id       uuid references auth.users (id) on delete set null,
  idempotency_key     text not null unique,
  created_at          timestamptz not null default now(),
  constraint inventory_movements_delta_present
    check (on_hand_delta <> 0 or reserved_delta <> 0),
  constraint inventory_movements_reason_valid
    check (reason is null or length(reason) <= 500),
  constraint inventory_movements_key_valid
    check (length(idempotency_key) between 1 and 240)
);

create index inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc, id desc);
create index inventory_movements_order_idx
  on public.inventory_movements (order_id, created_at, id)
  where order_id is not null;

-- Identifier and location edits do not change stock counters, so they belong
-- in a separate append-only audit stream rather than a zero-delta movement.
create table public.inventory_events (
  id             bigint generated always as identity primary key,
  product_id     text not null references public.inventory_products (product_id) on delete restrict,
  lot_id         uuid not null references public.inventory_lots (id) on delete restrict,
  event_type     text not null check (length(event_type) between 1 and 60),
  actor_user_id  uuid references auth.users (id) on delete set null,
  details        jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at     timestamptz not null default now()
);

create index inventory_events_product_created_idx
  on public.inventory_events (product_id, created_at desc, id desc);

create table public.order_events (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders (id) on delete restrict,
  event_type     text not null check (length(event_type) between 1 and 60),
  actor_user_id  uuid references auth.users (id) on delete set null,
  details        jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at     timestamptz not null default now()
);

create index order_events_order_created_idx
  on public.order_events (order_id, created_at, id);

-- Audit rows are write-once, even for the server role used by the application.
-- A database owner can deliberately disable a trigger for disaster recovery,
-- but ordinary application code cannot rewrite history.
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit_records_are_immutable';
end;
$$;

create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function public.prevent_audit_mutation();

create trigger inventory_events_immutable
before update or delete on public.inventory_events
for each row execute function public.prevent_audit_mutation();

create trigger order_events_immutable
before update or delete on public.order_events
for each row execute function public.prevent_audit_mutation();

create table public.order_shipments (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null unique references public.orders (id) on delete restrict,
  provider                 text not null default 'shippo' check (provider = 'shippo'),
  status                   text not null default 'DRAFT' check (status in (
    'DRAFT', 'PURCHASING', 'LABEL_PURCHASED', 'IN_TRANSIT', 'DELIVERED',
    'VOIDED', 'ERROR'
  )),
  provider_shipment_id     text,
  provider_transaction_id  text unique,
  selected_rate_id         text,
  carrier                  text,
  service_name             text,
  postage_amount           numeric(10,2) check (postage_amount is null or postage_amount >= 0),
  currency                 text,
  tracking_number          text,
  tracking_url             text,
  label_url                text,
  parcel                   jsonb not null default '{}'::jsonb check (jsonb_typeof(parcel) = 'object'),
  rate_quotes              jsonb not null default '[]'::jsonb check (jsonb_typeof(rate_quotes) = 'array'),
  quoted_at                timestamptz,
  purchase_token           uuid,
  purchase_started_at      timestamptz,
  label_purchased_at       timestamptz,
  error_message            text,
  created_by               uuid references auth.users (id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint order_shipments_provider_id_valid
    check (provider_shipment_id is null or length(provider_shipment_id) <= 120),
  constraint order_shipments_transaction_id_valid
    check (provider_transaction_id is null or length(provider_transaction_id) <= 120),
  constraint order_shipments_tracking_valid
    check (tracking_number is null or length(tracking_number) <= 160),
  constraint order_shipments_carrier_valid
    check (carrier is null or length(carrier) <= 80),
  constraint order_shipments_service_valid
    check (service_name is null or length(service_name) <= 120),
  constraint order_shipments_currency_valid
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint order_shipments_urls_valid
    check (
      (tracking_url is null or length(tracking_url) <= 2000)
      and (label_url is null or length(label_url) <= 2000)
    ),
  constraint order_shipments_error_valid
    check (error_message is null or length(error_message) <= 500)
);

create index order_shipments_tracking_idx
  on public.order_shipments (tracking_number)
  where tracking_number is not null;

-- These operational tables are server-only. RLS is defense in depth; there
-- are intentionally no anon/authenticated policies or grants.
alter table public.inventory_products enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_events enable row level security;
alter table public.order_events enable row level security;
alter table public.order_shipments enable row level security;

revoke all on table public.inventory_products from public, anon, authenticated;
revoke all on table public.inventory_lots from public, anon, authenticated;
revoke all on table public.inventory_reservations from public, anon, authenticated;
revoke all on table public.inventory_movements from public, anon, authenticated;
revoke all on table public.inventory_events from public, anon, authenticated;
revoke all on table public.order_events from public, anon, authenticated;
revoke all on table public.order_shipments from public, anon, authenticated;
grant all on table public.inventory_products to service_role;
grant all on table public.inventory_lots to service_role;
grant all on table public.inventory_reservations to service_role;
grant select, insert on table public.inventory_movements to service_role;
grant select, insert on table public.inventory_events to service_role;
grant select, insert on table public.order_events to service_role;
grant all on table public.order_shipments to service_role;
grant usage, select on sequence public.inventory_movements_id_seq to service_role;
grant usage, select on sequence public.inventory_events_id_seq to service_role;
grant usage, select on sequence public.order_events_id_seq to service_role;

insert into public.inventory_products (product_id, product_name, dose) values
  ('glp3rt-5', 'GLP-3RT', '5 mg'),
  ('glp3rt-10', 'GLP-3RT', '10 mg'),
  ('glp3rt-20', 'GLP-3RT', '20 mg'),
  ('glp3rt-30', 'GLP-3RT', '30 mg'),
  ('tesamorelin', 'Tesamorelin', '10 mg'),
  ('cjc-ipa', 'CJC-1295 / Ipamorelin', '5/5 mg'),
  ('bpc157-5', 'BPC-157', '5 mg'),
  ('bpc157-10', 'BPC-157', '10 mg'),
  ('tb500', 'TB-500', '10 mg'),
  ('epitalon', 'Epitalon', '10 mg'),
  ('ghkcu-50', 'GHK-Cu', '50 mg'),
  ('ghkcu-100', 'GHK-Cu', '100 mg'),
  ('ss31', 'SS-31', '10 mg'),
  ('ipamorelin', 'Ipamorelin', '5 mg'),
  ('kisspeptin', 'Kisspeptin', '10 mg'),
  ('motsc', 'MOTS-c', '10 mg'),
  ('selank', 'Selank', '10 mg'),
  ('semax', 'Semax', '10 mg'),
  ('glow', 'GLOW', '70 mg'),
  ('klow', 'KLOW', '80 mg'),
  ('hcg', 'HCG', '5000 IU'),
  ('mt1', 'MT-1', '10 mg'),
  ('mt2', 'MT-2', '10 mg'),
  ('ta1', 'Thymosin Alpha 1', '10 mg'),
  ('nad', 'NAD+', '500 mg'),
  ('igf1lr3', 'IGF-1 LR3', '1 mg'),
  ('kpv', 'KPV', '10 mg');

insert into public.inventory_lots (
  product_id, lot_number, is_provisional, received_quantity, on_hand,
  reserved, storage_location
)
select
  product_id,
  'PROVISIONAL-' || upper(product_id),
  true,
  50,
  50,
  0,
  'Assign physical location'
from public.inventory_products;

insert into public.inventory_movements (
  product_id, lot_id, movement_type, on_hand_delta, reserved_delta,
  reason, idempotency_key
)
select
  product_id,
  id,
  'OPENING_BALANCE',
  50,
  0,
  'Owner supplied opening quantity of 50; real lot and batch identifiers pending',
  'opening-balance:' || product_id
from public.inventory_lots;

-- Allocate earliest-expiring real lots first, then provisional opening lots.
-- Called only inside the server-authoritative order transaction.
create or replace function public.reserve_inventory_for_order(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_row record;
  lot_row record;
  remaining integer;
  allocation integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_inventory_items';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_inventory_items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    where jsonb_typeof(item) is distinct from 'object'
       or coalesce(item->>'id', '') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
       or case
            when coalesce(item->>'qty', '') ~ '^[1-9][0-9]*$'
              then (item->>'qty')::numeric > 999
            else true
          end
  ) then
    raise exception 'invalid_inventory_items';
  end if;
  if exists (select 1 from public.inventory_reservations where order_id = p_order_id) then
    raise exception 'inventory_already_reserved';
  end if;

  for item_row in
    select item->>'id' as product_id, sum((item->>'qty')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(item)
    group by item->>'id'
  loop
    if not exists (
      select 1 from public.inventory_products where product_id = item_row.product_id
    ) then
      raise exception 'unknown_inventory_product:%', item_row.product_id;
    end if;

    remaining := item_row.quantity;
    for lot_row in
      select id, product_id, on_hand, reserved
      from public.inventory_lots
      where product_id = item_row.product_id
        and on_hand > reserved
      order by is_provisional asc, expires_on asc nulls last, received_at asc, id asc
      for update
    loop
      allocation := least(remaining, lot_row.on_hand - lot_row.reserved);
      update public.inventory_lots
      set reserved = reserved + allocation, updated_at = now()
      where id = lot_row.id;

      insert into public.inventory_reservations (
        order_id, product_id, lot_id, quantity
      ) values (
        p_order_id, item_row.product_id, lot_row.id, allocation
      );

      insert into public.inventory_movements (
        product_id, lot_id, order_id, movement_type, on_hand_delta,
        reserved_delta, reason, idempotency_key
      ) values (
        item_row.product_id, lot_row.id, p_order_id, 'RESERVATION', 0,
        allocation, 'Reserved when order was placed',
        'reserve:' || p_order_id::text || ':' || lot_row.id::text
      );

      remaining := remaining - allocation;
      exit when remaining = 0;
    end loop;

    if remaining > 0 then
      raise exception 'insufficient_inventory:%', item_row.product_id;
    end if;
  end loop;
end;
$$;

-- Replace the prior order transaction so a new order, discount redemption,
-- stock reservation and initial audit event succeed or fail together.
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
    user_id, order_number, status, payment_status, fulfillment_status,
    items, items_text, subtotal, discount_code, discount_amount, shipping,
    total, payment_method, customer_name, customer_email, customer_phone,
    ship_address, ship_city, ship_state, ship_zip
  ) values (
    nullif(order_payload->>'user_id', '')::uuid,
    order_payload->>'order_number',
    'AWAITING PAYMENT',
    'AWAITING_PAYMENT',
    'ON_HOLD',
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

    perform public.reserve_inventory_for_order(inserted_order.id, inserted_order.items);
    insert into public.order_events (order_id, event_type, details)
    values (inserted_order.id, 'ORDER_PLACED', jsonb_build_object(
      'payment_status', 'AWAITING_PAYMENT',
      'fulfillment_status', 'ON_HOLD'
    ));
    return inserted_order;
  end if;

  select * into existing_order
  from public.orders
  where order_number = order_payload->>'order_number';
  return existing_order;
end;
$$;

create or replace function public.confirm_order_payment(
  p_order_id uuid,
  p_expected_payment_status text,
  p_actor_user_id uuid
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.orders;
  reservation_row record;
begin
  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;

  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status = 'PAID' then return selected_order; end if;
  if selected_order.payment_status <> p_expected_payment_status
     or selected_order.payment_status <> 'AWAITING_PAYMENT' then
    raise exception 'order_payment_status_conflict';
  end if;
  if not exists (
    select 1 from public.inventory_reservations
    where order_id = p_order_id and state = 'RESERVED'
  ) then
    -- Covers orders created before this migration without bypassing stock checks.
    perform public.reserve_inventory_for_order(selected_order.id, selected_order.items);
  end if;
  if exists (
    select 1
    from (
      select item->>'id' as product_id, sum((item->>'qty')::integer)::integer as quantity
      from jsonb_array_elements(selected_order.items) as entry(item)
      group by item->>'id'
    ) expected
    full join (
      select product_id, sum(quantity)::integer as quantity
      from public.inventory_reservations
      where order_id = p_order_id and state = 'RESERVED'
      group by product_id
    ) reserved using (product_id)
    where coalesce(reserved.quantity, 0) <> coalesce(expected.quantity, 0)
  ) then
    raise exception 'inventory_reservation_mismatch';
  end if;

  for reservation_row in
    select r.id, r.product_id, r.lot_id, r.quantity
    from public.inventory_reservations r
    where r.order_id = p_order_id and r.state = 'RESERVED'
    order by r.id
    for update
  loop
    perform 1
    from public.inventory_lots
    where id = reservation_row.lot_id
      and reserved >= reservation_row.quantity
      and on_hand >= reservation_row.quantity
    for update;
    if not found then raise exception 'inventory_counter_mismatch'; end if;

    update public.inventory_lots
    set on_hand = on_hand - reservation_row.quantity,
        reserved = reserved - reservation_row.quantity,
        updated_at = now()
    where id = reservation_row.lot_id;

    update public.inventory_reservations
    set state = 'COMMITTED', committed_at = now()
    where id = reservation_row.id;

    insert into public.inventory_movements (
      product_id, lot_id, order_id, movement_type, on_hand_delta,
      reserved_delta, reason, actor_user_id, idempotency_key
    ) values (
      reservation_row.product_id, reservation_row.lot_id, p_order_id,
      'SALE', -reservation_row.quantity, -reservation_row.quantity,
      'Payment confirmed; inventory committed', p_actor_user_id,
      'sale:' || p_order_id::text || ':' || reservation_row.lot_id::text
    );
  end loop;

  update public.orders
  set status = 'PAID', payment_status = 'PAID',
      fulfillment_status = 'READY_TO_PICK', payment_confirmed_at = now(),
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (p_order_id, 'PAYMENT_CONFIRMED', p_actor_user_id,
    jsonb_build_object('payment_method', selected_order.payment_method));
  return selected_order;
end;
$$;

create or replace function public.cancel_unpaid_order(
  p_order_id uuid,
  p_expected_payment_status text,
  p_actor_user_id uuid
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.orders;
  reservation_row record;
begin
  select * into selected_order from public.orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status = 'CANCELLED' then return selected_order; end if;
  if selected_order.payment_status <> p_expected_payment_status
     or selected_order.payment_status <> 'AWAITING_PAYMENT' then
    raise exception 'paid_order_requires_refund';
  end if;

  for reservation_row in
    select id, product_id, lot_id, quantity
    from public.inventory_reservations
    where order_id = p_order_id and state = 'RESERVED'
    order by id
    for update
  loop
    perform 1 from public.inventory_lots
    where id = reservation_row.lot_id and reserved >= reservation_row.quantity
    for update;
    if not found then raise exception 'inventory_counter_mismatch'; end if;

    update public.inventory_lots
    set reserved = reserved - reservation_row.quantity, updated_at = now()
    where id = reservation_row.lot_id;
    update public.inventory_reservations
    set state = 'RELEASED', released_at = now()
    where id = reservation_row.id;
    insert into public.inventory_movements (
      product_id, lot_id, order_id, movement_type, on_hand_delta,
      reserved_delta, reason, actor_user_id, idempotency_key
    ) values (
      reservation_row.product_id, reservation_row.lot_id, p_order_id,
      'RESERVATION_RELEASE', 0, -reservation_row.quantity,
      'Unpaid order cancelled', p_actor_user_id,
      'release:' || p_order_id::text || ':' || reservation_row.lot_id::text
    );
  end loop;

  update public.orders
  set status = 'CANCELLED', payment_status = 'CANCELLED',
      fulfillment_status = 'CANCELLED', updated_at = now()
  where id = p_order_id
  returning * into selected_order;
  insert into public.order_events (order_id, event_type, actor_user_id)
  values (p_order_id, 'UNPAID_ORDER_CANCELLED', p_actor_user_id);
  return selected_order;
end;
$$;

create or replace function public.advance_order_fulfillment(
  p_order_id uuid,
  p_expected_fulfillment_status text,
  p_target_fulfillment_status text,
  p_actor_user_id uuid
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.orders;
begin
  select * into selected_order from public.orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status <> 'PAID' then raise exception 'payment_not_confirmed'; end if;
  if selected_order.fulfillment_status <> p_expected_fulfillment_status then
    raise exception 'order_fulfillment_status_conflict';
  end if;
  if not (
    (p_expected_fulfillment_status = 'READY_TO_PICK' and p_target_fulfillment_status = 'PICKED')
    or (p_expected_fulfillment_status = 'PICKED' and p_target_fulfillment_status = 'PACKED')
  ) then
    raise exception 'invalid_fulfillment_transition';
  end if;

  update public.orders
  set status = 'PROCESSING', fulfillment_status = p_target_fulfillment_status,
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;
  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (p_order_id, 'FULFILLMENT_STATUS_CHANGED', p_actor_user_id,
    jsonb_build_object('from', p_expected_fulfillment_status, 'to', p_target_fulfillment_status));
  return selected_order;
end;
$$;

-- Shippo is an external system, so the HTTP purchase cannot be part of a
-- Postgres transaction. Once Shippo returns success, this RPC makes the local
-- shipment, order status, and audit event one atomic database commit.
create or replace function public.complete_shippo_label_purchase(
  p_order_id uuid,
  p_purchase_token uuid,
  p_provider_transaction_id text,
  p_carrier text,
  p_service_name text,
  p_postage_amount numeric,
  p_currency text,
  p_tracking_number text,
  p_tracking_url text,
  p_label_url text,
  p_actor_user_id uuid
)
returns public.order_shipments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_shipment public.order_shipments;
  updated_order_count integer;
begin
  select * into selected_shipment
  from public.order_shipments
  where order_id = p_order_id
  for update;

  if selected_shipment.id is null then raise exception 'shipment_not_found'; end if;
  if selected_shipment.status <> 'PURCHASING'
     or selected_shipment.purchase_token is distinct from p_purchase_token
     or selected_shipment.provider_transaction_id is not null then
    raise exception 'shipment_purchase_conflict';
  end if;
  if p_provider_transaction_id is null or length(p_provider_transaction_id) not between 1 and 120
     or p_tracking_number is null or length(p_tracking_number) not between 1 and 160
     or p_label_url is null or length(p_label_url) not between 1 and 2000
     or p_carrier is null or length(p_carrier) not between 1 and 80
     or p_service_name is null or length(p_service_name) not between 1 and 120
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or p_postage_amount is null or p_postage_amount < 0
     or length(coalesce(p_tracking_url, '')) > 2000 then
    raise exception 'invalid_shipment_result';
  end if;

  update public.order_shipments
  set status = 'LABEL_PURCHASED',
      provider_transaction_id = p_provider_transaction_id,
      carrier = p_carrier,
      service_name = p_service_name,
      postage_amount = p_postage_amount,
      currency = p_currency,
      tracking_number = p_tracking_number,
      tracking_url = nullif(p_tracking_url, ''),
      label_url = p_label_url,
      label_purchased_at = now(),
      purchase_token = null,
      error_message = null,
      updated_at = now()
  where id = selected_shipment.id
  returning * into selected_shipment;

  update public.orders
  set fulfillment_status = 'LABEL_CREATED', status = 'PROCESSING', updated_at = now()
  where id = p_order_id
    and payment_status = 'PAID'
    and fulfillment_status = 'PACKED';
  get diagnostics updated_order_count = row_count;
  if updated_order_count <> 1 then raise exception 'payment_not_confirmed'; end if;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (p_order_id, 'SHIPPING_LABEL_PURCHASED', p_actor_user_id,
    jsonb_build_object(
      'carrier', p_carrier,
      'service', p_service_name,
      'tracking_number', p_tracking_number,
      'postage', p_postage_amount,
      'currency', p_currency
    ));
  return selected_shipment;
end;
$$;

create or replace function public.receive_inventory_lot(
  p_product_id text,
  p_lot_number text,
  p_supplier_batch_id text,
  p_quantity integer,
  p_expires_on date,
  p_storage_location text,
  p_actor_user_id uuid
)
returns public.inventory_lots
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_lot public.inventory_lots;
begin
  if p_quantity <= 0 or p_quantity > 100000 then raise exception 'invalid_quantity'; end if;
  if p_lot_number is null or length(trim(p_lot_number)) not between 1 and 80
     or upper(trim(p_lot_number)) like 'PROVISIONAL-%' then
    raise exception 'invalid_lot_number';
  end if;
  insert into public.inventory_lots (
    product_id, lot_number, supplier_batch_id, is_provisional,
    received_quantity, on_hand, reserved, expires_on, storage_location
  ) values (
    p_product_id, trim(p_lot_number), nullif(trim(p_supplier_batch_id), ''), false,
    p_quantity, p_quantity, 0, p_expires_on, nullif(trim(p_storage_location), '')
  ) returning * into inserted_lot;

  insert into public.inventory_movements (
    product_id, lot_id, movement_type, on_hand_delta, reserved_delta,
    reason, actor_user_id, idempotency_key
  ) values (
    inserted_lot.product_id, inserted_lot.id, 'RECEIPT', p_quantity, 0,
    'New inventory lot received', p_actor_user_id,
    'receipt:' || inserted_lot.id::text
  );
  return inserted_lot;
end;
$$;

create or replace function public.update_inventory_lot_metadata(
  p_lot_id uuid,
  p_expected_updated_at timestamptz,
  p_lot_number text,
  p_supplier_batch_id text,
  p_expires_on date,
  p_storage_location text,
  p_reorder_point integer,
  p_actor_user_id uuid
)
returns public.inventory_lots
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_lot public.inventory_lots;
  previous_details jsonb;
begin
  select * into selected_lot from public.inventory_lots where id = p_lot_id for update;
  if selected_lot.id is null then raise exception 'lot_not_found'; end if;
  if p_expected_updated_at is null or selected_lot.updated_at <> p_expected_updated_at then
    raise exception 'lot_update_conflict';
  end if;
  if p_lot_number is null or length(trim(p_lot_number)) not between 1 and 80
     or upper(trim(p_lot_number)) like 'PROVISIONAL-%' then
    raise exception 'invalid_lot_number';
  end if;
  if p_reorder_point < 0 or p_reorder_point > 100000 then raise exception 'invalid_reorder_point'; end if;

  previous_details := jsonb_build_object(
    'lot_number', selected_lot.lot_number,
    'supplier_batch_id', selected_lot.supplier_batch_id,
    'expires_on', selected_lot.expires_on,
    'storage_location', selected_lot.storage_location,
    'reorder_point', (
      select reorder_point
      from public.inventory_products
      where product_id = selected_lot.product_id
    )
  );

  update public.inventory_lots
  set lot_number = trim(p_lot_number),
      supplier_batch_id = nullif(trim(p_supplier_batch_id), ''),
      is_provisional = false,
      expires_on = p_expires_on,
      storage_location = nullif(trim(p_storage_location), ''),
      updated_at = now()
  where id = p_lot_id
  returning * into selected_lot;
  update public.inventory_products
  set reorder_point = p_reorder_point, updated_at = now()
  where product_id = selected_lot.product_id;

  insert into public.inventory_events (
    product_id, lot_id, event_type, actor_user_id, details
  ) values (
    selected_lot.product_id,
    selected_lot.id,
    'LOT_METADATA_UPDATED',
    p_actor_user_id,
    jsonb_build_object(
      'before', previous_details,
      'after', jsonb_build_object(
        'lot_number', selected_lot.lot_number,
        'supplier_batch_id', selected_lot.supplier_batch_id,
        'expires_on', selected_lot.expires_on,
        'storage_location', selected_lot.storage_location,
        'reorder_point', p_reorder_point
      )
    )
  );

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  select r.order_id, 'LOT_METADATA_UPDATED', p_actor_user_id,
    jsonb_build_object('lot_id', p_lot_id, 'lot_number', selected_lot.lot_number)
  from public.inventory_reservations r
  where r.lot_id = p_lot_id
  group by r.order_id;
  return selected_lot;
end;
$$;

create or replace function public.adjust_inventory_lot(
  p_lot_id uuid,
  p_delta integer,
  p_reason text,
  p_actor_user_id uuid
)
returns public.inventory_lots
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_lot public.inventory_lots;
  movement_key text;
begin
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'invalid_adjustment'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'adjustment_reason_required';
  end if;
  select * into selected_lot from public.inventory_lots where id = p_lot_id for update;
  if selected_lot.id is null then raise exception 'lot_not_found'; end if;
  if selected_lot.on_hand + p_delta < selected_lot.reserved then
    raise exception 'adjustment_would_overdraw_reserved_stock';
  end if;

  update public.inventory_lots
  set on_hand = on_hand + p_delta, updated_at = now()
  where id = p_lot_id
  returning * into selected_lot;
  movement_key := 'adjustment:' || p_lot_id::text || ':' || gen_random_uuid()::text;
  insert into public.inventory_movements (
    product_id, lot_id, movement_type, on_hand_delta, reserved_delta,
    reason, actor_user_id, idempotency_key
  ) values (
    selected_lot.product_id, selected_lot.id, 'ADJUSTMENT', p_delta, 0,
    trim(p_reason), p_actor_user_id, movement_key
  );
  return selected_lot;
end;
$$;

revoke execute on function public.reserve_inventory_for_order(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_order_payment(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_unpaid_order(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.advance_order_fulfillment(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.complete_shippo_label_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.receive_inventory_lot(text, text, text, integer, date, text, uuid) from public, anon, authenticated;
revoke execute on function public.update_inventory_lot_metadata(uuid, timestamptz, text, text, date, text, integer, uuid) from public, anon, authenticated;
revoke execute on function public.adjust_inventory_lot(uuid, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.prevent_audit_mutation() from public, anon, authenticated;
grant execute on function public.reserve_inventory_for_order(uuid, jsonb) to service_role;
grant execute on function public.confirm_order_payment(uuid, text, uuid) to service_role;
grant execute on function public.cancel_unpaid_order(uuid, text, uuid) to service_role;
grant execute on function public.advance_order_fulfillment(uuid, text, text, uuid) to service_role;
grant execute on function public.complete_shippo_label_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, uuid) to service_role;
grant execute on function public.receive_inventory_lot(text, text, text, integer, date, text, uuid) to service_role;
grant execute on function public.update_inventory_lot_metadata(uuid, timestamptz, text, text, date, text, integer, uuid) to service_role;
grant execute on function public.adjust_inventory_lot(uuid, integer, text, uuid) to service_role;

-- The replacement above remains server-only too.
revoke execute on function public.create_order_transaction(jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order_transaction(jsonb, text) to service_role;

commit;
