begin;

-- One receipt per order. create-order enqueues after the order row exists;
-- claim/complete/fail serialize Resend so a retry or a second tab cannot
-- send a second confirmation.

create table public.order_receipt_outbox (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null unique references public.orders (id) on delete restrict,
  status                text not null default 'PENDING'
    check (status in ('PENDING', 'SENDING', 'ERROR', 'SENT', 'NEEDS_REVIEW')),
  template_version      smallint not null default 1 check (template_version = 1),
  recipient_email       text not null check (length(recipient_email) between 3 and 320),
  customer_name         text not null check (length(customer_name) between 1 and 160),
  order_number          text not null check (length(order_number) between 1 and 80),
  items_text            text not null check (length(items_text) between 1 and 4000),
  order_subtotal        text not null check (length(order_subtotal) between 1 and 40),
  discount_code         text not null default '' check (length(discount_code) <= 64),
  discount_amount       text not null default '' check (length(discount_amount) <= 40),
  shipping              text not null check (length(shipping) between 1 and 40),
  payment_method        text not null check (length(payment_method) between 1 and 40),
  order_total           text not null check (length(order_total) between 1 and 40),
  shipping_address      text not null check (length(shipping_address) between 1 and 200),
  shipping_city         text not null check (length(shipping_city) between 1 and 100),
  shipping_state        text not null check (length(shipping_state) between 1 and 100),
  shipping_zip          text not null check (length(shipping_zip) between 1 and 20),
  customer_phone        text not null check (length(customer_phone) between 1 and 40),
  idempotency_key       text not null unique check (length(idempotency_key) between 1 and 256),
  attempt_count         integer not null default 0 check (attempt_count between 0 and 100),
  first_attempt_at      timestamptz,
  next_attempt_at       timestamptz not null default now(),
  claim_token           uuid,
  claimed_at            timestamptz,
  sent_at               timestamptz,
  provider_message_id   text check (provider_message_id is null or length(provider_message_id) <= 160),
  last_error            text check (last_error is null or length(last_error) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index order_receipt_outbox_due_idx
  on public.order_receipt_outbox (next_attempt_at, created_at)
  where status in ('PENDING', 'ERROR', 'SENDING');

alter table public.order_receipt_outbox enable row level security;
revoke all on table public.order_receipt_outbox from public, anon, authenticated;
grant all on table public.order_receipt_outbox to service_role;

create or replace function public.enqueue_order_receipt(
  p_order_id uuid,
  p_recipient_email text,
  p_customer_name text,
  p_order_number text,
  p_items_text text,
  p_order_subtotal text,
  p_discount_code text,
  p_discount_amount text,
  p_shipping text,
  p_payment_method text,
  p_order_total text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_state text,
  p_shipping_zip text,
  p_customer_phone text
)
returns public.order_receipt_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_receipt_outbox;
  inserted_delivery public.order_receipt_outbox;
begin
  if p_order_id is null then
    raise exception 'invalid_receipt_payload';
  end if;

  insert into public.order_receipt_outbox (
    order_id,
    recipient_email,
    customer_name,
    order_number,
    items_text,
    order_subtotal,
    discount_code,
    discount_amount,
    shipping,
    payment_method,
    order_total,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_zip,
    customer_phone,
    idempotency_key
  ) values (
    p_order_id,
    trim(p_recipient_email),
    trim(p_customer_name),
    trim(p_order_number),
    trim(p_items_text),
    trim(p_order_subtotal),
    coalesce(trim(p_discount_code), ''),
    coalesce(trim(p_discount_amount), ''),
    trim(p_shipping),
    trim(p_payment_method),
    trim(p_order_total),
    trim(p_shipping_address),
    trim(p_shipping_city),
    trim(p_shipping_state),
    trim(p_shipping_zip),
    trim(p_customer_phone),
    'order-receipt/v1/' || p_order_id::text
  )
  on conflict (order_id) do nothing
  returning * into inserted_delivery;

  if inserted_delivery.id is not null then
    return inserted_delivery;
  end if;

  select * into selected_delivery
  from public.order_receipt_outbox
  where order_id = p_order_id;
  return selected_delivery;
end;
$$;

create or replace function public.claim_order_receipt(p_delivery_id uuid default null)
returns setof public.order_receipt_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_receipt_outbox;
begin
  select * into selected_delivery
  from public.order_receipt_outbox
  where (p_delivery_id is null or id = p_delivery_id)
    and (
      (status in ('PENDING', 'ERROR') and next_attempt_at <= now())
      or (status = 'SENDING' and claimed_at < now() - interval '10 minutes')
    )
  order by next_attempt_at, created_at
  for update skip locked
  limit 1;

  if selected_delivery.id is null then
    if p_delivery_id is not null then
      select * into selected_delivery
      from public.order_receipt_outbox
      where id = p_delivery_id and status = 'SENT';
      if selected_delivery.id is not null then
        return next selected_delivery;
      end if;
    end if;
    return;
  end if;

  if selected_delivery.attempt_count >= 8
     or (selected_delivery.first_attempt_at is not null
         and selected_delivery.first_attempt_at < now() - interval '23 hours') then
    update public.order_receipt_outbox
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

  update public.order_receipt_outbox
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

create or replace function public.complete_order_receipt(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns public.order_receipt_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_receipt_outbox;
begin
  select * into selected_delivery
  from public.order_receipt_outbox
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

  update public.order_receipt_outbox
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

  return selected_delivery;
end;
$$;

create or replace function public.fail_order_receipt(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error text,
  p_retryable boolean
)
returns public.order_receipt_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.order_receipt_outbox;
  next_status text;
begin
  select * into selected_delivery
  from public.order_receipt_outbox
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

  update public.order_receipt_outbox
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

revoke execute on function public.enqueue_order_receipt(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_order_receipt(uuid) from public, anon, authenticated;
revoke execute on function public.complete_order_receipt(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_order_receipt(uuid, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.enqueue_order_receipt(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.claim_order_receipt(uuid) to service_role;
grant execute on function public.complete_order_receipt(uuid, uuid, text) to service_role;
grant execute on function public.fail_order_receipt(uuid, uuid, text, boolean) to service_role;

commit;
