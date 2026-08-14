begin;

-- Shippo returns this flag on every purchased Transaction. Existing rows fail
-- closed as test labels so this migration cannot email tracking from an older
-- test run when the site later switches to a live API token.
alter table public.order_shipments
  add column if not exists is_test boolean not null default true;

comment on column public.order_shipments.is_test is
  'Shippo Transaction.test value. True and unknown labels never notify customers.';

create table public.order_notification_outbox (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete restrict,
  notification_type     text not null default 'ORDER_PROCESSED'
    check (notification_type = 'ORDER_PROCESSED'),
  status                text not null default 'PENDING'
    check (status in ('PENDING', 'SENDING', 'ERROR', 'SENT', 'NEEDS_REVIEW')),
  template_version      smallint not null default 1 check (template_version = 1),
  recipient_email       text not null check (length(recipient_email) between 3 and 320),
  customer_name         text not null check (length(customer_name) between 1 and 160),
  order_number          text not null check (length(order_number) between 1 and 80),
  carrier               text not null check (length(carrier) between 1 and 80),
  service_name          text not null check (length(service_name) between 1 and 120),
  tracking_number       text not null check (length(tracking_number) between 1 and 160),
  tracking_url          text check (
    tracking_url is null
    or (length(tracking_url) <= 2000 and tracking_url like 'https://%')
  ),
  idempotency_key       text not null unique check (length(idempotency_key) between 1 and 256),
  triggered_by_user_id  uuid references auth.users (id) on delete set null,
  attempt_count         integer not null default 0 check (attempt_count between 0 and 100),
  first_attempt_at      timestamptz,
  next_attempt_at       timestamptz not null default now(),
  claim_token           uuid,
  claimed_at            timestamptz,
  sent_at               timestamptz,
  provider_message_id   text check (provider_message_id is null or length(provider_message_id) <= 160),
  last_error            text check (last_error is null or length(last_error) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (order_id, notification_type)
);

create index order_notification_outbox_due_idx
  on public.order_notification_outbox (next_attempt_at, created_at)
  where status in ('PENDING', 'ERROR', 'SENDING');

-- A retry of the same PrintNode response may safely re-enter the recorder, but
-- one accepted PrintNode job must produce only one immutable audit row.
create unique index order_events_printnode_job_unique_idx
  on public.order_events (order_id, event_type, ((details ->> 'printnode_job_id')))
  where event_type in ('FULFILLMENT_PACKET_PRINTED', 'SHIPPING_LABEL_PRINTED')
    and details ? 'printnode_job_id';

alter table public.order_notification_outbox enable row level security;
revoke all on table public.order_notification_outbox from public, anon, authenticated;
grant all on table public.order_notification_outbox to service_role;

-- This overload preserves the existing RPC during the deploy window while new
-- code atomically persists Shippo's test/live flag with the tracking record.
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
  p_actor_user_id uuid,
  p_is_test boolean
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
  if p_is_test is null
     or p_provider_transaction_id is null or length(p_provider_transaction_id) not between 1 and 120
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
      is_test = p_is_test,
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
      'currency', p_currency,
      'test', p_is_test
    ));
  return selected_shipment;
end;
$$;

create or replace function public.claim_order_processed_email(p_delivery_id uuid default null)
returns setof public.order_notification_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_notification_outbox;
begin
  select * into selected_delivery
  from public.order_notification_outbox
  where (p_delivery_id is null or id = p_delivery_id)
    and (
      (status in ('PENDING', 'ERROR') and next_attempt_at <= now())
      or (status = 'SENDING' and claimed_at < now() - interval '10 minutes')
    )
  order by next_attempt_at, created_at
  for update skip locked
  limit 1;

  if selected_delivery.id is null then return; end if;

  if selected_delivery.attempt_count >= 8
     or (selected_delivery.first_attempt_at is not null
         and selected_delivery.first_attempt_at < now() - interval '23 hours') then
    update public.order_notification_outbox
    set status = 'NEEDS_REVIEW',
        claim_token = null,
        claimed_at = null,
        last_error = coalesce(last_error, 'Automatic retry window expired.'),
        updated_at = now()
    where id = selected_delivery.id
    returning * into selected_delivery;
    return next selected_delivery;
    return;
  end if;

  update public.order_notification_outbox
  set status = 'SENDING',
      attempt_count = attempt_count + 1,
      first_attempt_at = coalesce(first_attempt_at, now()),
      claim_token = gen_random_uuid(),
      claimed_at = now(),
      last_error = null,
      updated_at = now()
  where id = selected_delivery.id
  returning * into selected_delivery;

  return next selected_delivery;
end;
$$;

create or replace function public.complete_order_processed_email(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns public.order_notification_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_notification_outbox;
begin
  select * into selected_delivery
  from public.order_notification_outbox
  where id = p_delivery_id
  for update;
  if selected_delivery.id is null then raise exception 'delivery_not_found'; end if;
  if selected_delivery.status = 'SENT' then return selected_delivery; end if;
  if selected_delivery.status <> 'SENDING'
     or selected_delivery.claim_token is distinct from p_claim_token then
    raise exception 'delivery_claim_conflict';
  end if;
  if p_provider_message_id is null or length(p_provider_message_id) not between 1 and 160 then
    raise exception 'invalid_provider_message_id';
  end if;

  update public.order_notification_outbox
  set status = 'SENT',
      sent_at = now(),
      provider_message_id = p_provider_message_id,
      claim_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      last_error = null,
      updated_at = now()
  where id = p_delivery_id
  returning * into selected_delivery;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (
    selected_delivery.order_id,
    'CUSTOMER_TRACKING_EMAIL_SENT',
    selected_delivery.triggered_by_user_id,
    jsonb_build_object(
      'delivery_id', selected_delivery.id,
      'provider_message_id', p_provider_message_id
    )
  );
  return selected_delivery;
end;
$$;

create or replace function public.fail_order_processed_email(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error text,
  p_retryable boolean
)
returns public.order_notification_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_notification_outbox;
  next_status text;
begin
  select * into selected_delivery
  from public.order_notification_outbox
  where id = p_delivery_id
  for update;
  if selected_delivery.id is null then raise exception 'delivery_not_found'; end if;
  if selected_delivery.status = 'SENT' then return selected_delivery; end if;
  if selected_delivery.status <> 'SENDING'
     or selected_delivery.claim_token is distinct from p_claim_token then
    raise exception 'delivery_claim_conflict';
  end if;

  next_status := case
    when coalesce(p_retryable, false) is false then 'NEEDS_REVIEW'
    when selected_delivery.attempt_count >= 8 then 'NEEDS_REVIEW'
    when selected_delivery.first_attempt_at < now() - interval '23 hours' then 'NEEDS_REVIEW'
    else 'ERROR'
  end;

  update public.order_notification_outbox
  set status = next_status,
      claim_token = null,
      claimed_at = null,
      next_attempt_at = case
        when next_status = 'ERROR'
          then now() + (least(greatest(attempt_count, 1), 6) * interval '5 minutes')
        else now()
      end,
      last_error = left(coalesce(nullif(trim(p_error), ''), 'Email delivery failed.'), 500),
      updated_at = now()
  where id = p_delivery_id
  returning * into selected_delivery;
  return selected_delivery;
end;
$$;

revoke execute on function public.complete_shippo_label_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.claim_order_processed_email(uuid) from public, anon, authenticated;
revoke execute on function public.complete_order_processed_email(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_order_processed_email(uuid, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.complete_shippo_label_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, uuid, boolean) to service_role;
grant execute on function public.claim_order_processed_email(uuid) to service_role;
grant execute on function public.complete_order_processed_email(uuid, uuid, text) to service_role;
grant execute on function public.fail_order_processed_email(uuid, uuid, text, boolean) to service_role;

-- Called only after PrintNode has returned a positive job id. Locking the
-- order serializes simultaneous slip/label submissions, so whichever arrives
-- second stages exactly one customer email with a fixed payload snapshot.
create or replace function public.record_order_print_submission(
  p_order_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_printnode_job_id bigint,
  p_automatic boolean default false
)
returns table (
  delivery_id uuid,
  delivery_status text,
  queued_now boolean,
  readiness text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.orders;
  selected_shipment public.order_shipments;
  selected_delivery public.order_notification_outbox;
  inserted_delivery public.order_notification_outbox;
  has_packing_slip boolean;
  has_shipping_label boolean;
begin
  if p_event_type not in ('FULFILLMENT_PACKET_PRINTED', 'SHIPPING_LABEL_PRINTED') then
    raise exception 'invalid_print_event_type';
  end if;
  if p_printnode_job_id is null or p_printnode_job_id <= 0 then
    raise exception 'invalid_printnode_job_id';
  end if;

  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;
  if selected_order.id is null then raise exception 'order_not_found'; end if;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (
    p_order_id,
    p_event_type,
    p_actor_user_id,
    jsonb_build_object(
      'printnode_job_id', p_printnode_job_id,
      'automatic', coalesce(p_automatic, false)
    )
  )
  on conflict do nothing;

  select exists (
    select 1 from public.order_events
    where order_id = p_order_id and event_type = 'FULFILLMENT_PACKET_PRINTED'
  ) into has_packing_slip;
  select exists (
    select 1 from public.order_events
    where order_id = p_order_id and event_type = 'SHIPPING_LABEL_PRINTED'
  ) into has_shipping_label;

  select * into selected_shipment
  from public.order_shipments
  where order_id = p_order_id;

  -- Once a test label itself has been submitted to PrintNode, report the
  -- suppression immediately instead of promising an email after the slip.
  if has_shipping_label
     and selected_shipment.id is not null
     and selected_shipment.is_test is not false then
    return query select null::uuid, null::text, false, 'TEST_LABEL'::text;
    return;
  end if;

  if not has_packing_slip or not has_shipping_label then
    return query select
      null::uuid,
      null::text,
      false,
      case when not has_packing_slip then 'WAITING_FOR_PACKING_SLIP' else 'WAITING_FOR_LABEL' end;
    return;
  end if;

  if selected_shipment.id is null then
    return query select null::uuid, null::text, false, 'WAITING_FOR_LABEL'::text;
    return;
  end if;
  if selected_shipment.is_test is not false then
    return query select null::uuid, null::text, false, 'TEST_LABEL'::text;
    return;
  end if;
  if selected_order.payment_status <> 'PAID'
     or selected_order.fulfillment_method <> 'SHIP'
     or selected_shipment.status not in ('LABEL_PURCHASED', 'IN_TRANSIT', 'DELIVERED')
     or length(trim(coalesce(selected_order.customer_email, ''))) not between 3 and 320
     or length(trim(coalesce(selected_order.customer_name, ''))) not between 1 and 160
     or length(trim(coalesce(selected_shipment.carrier, ''))) not between 1 and 80
     or length(trim(coalesce(selected_shipment.service_name, ''))) not between 1 and 120
     or length(trim(coalesce(selected_shipment.tracking_number, ''))) not between 1 and 160
     or length(trim(coalesce(selected_shipment.label_url, ''))) < 1 then
    return query select null::uuid, null::text, false, 'NOT_ELIGIBLE'::text;
    return;
  end if;

  insert into public.order_notification_outbox (
    order_id,
    notification_type,
    recipient_email,
    customer_name,
    order_number,
    carrier,
    service_name,
    tracking_number,
    tracking_url,
    idempotency_key,
    triggered_by_user_id
  ) values (
    p_order_id,
    'ORDER_PROCESSED',
    trim(selected_order.customer_email),
    trim(selected_order.customer_name),
    trim(selected_order.order_number),
    trim(selected_shipment.carrier),
    trim(selected_shipment.service_name),
    trim(selected_shipment.tracking_number),
    nullif(trim(coalesce(selected_shipment.tracking_url, '')), ''),
    'order-processed/v1/' || p_order_id::text,
    p_actor_user_id
  )
  on conflict (order_id, notification_type) do nothing
  returning * into inserted_delivery;

  if inserted_delivery.id is not null then
    selected_delivery := inserted_delivery;
    insert into public.order_events (order_id, event_type, actor_user_id, details)
    values (
      p_order_id,
      'ORDER_PROCESSED_EMAIL_QUEUED',
      p_actor_user_id,
      jsonb_build_object('delivery_id', selected_delivery.id)
    );
    return query select selected_delivery.id, selected_delivery.status, true, 'QUEUED'::text;
    return;
  end if;

  select * into selected_delivery
  from public.order_notification_outbox
  where order_id = p_order_id and notification_type = 'ORDER_PROCESSED';
  return query select selected_delivery.id, selected_delivery.status, false, selected_delivery.status;
end;
$$;

revoke execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean) to service_role;

commit;
