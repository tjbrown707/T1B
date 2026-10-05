begin;

-- One durable notice per immutable payment audit event, atomically inserted
-- with the payment. There is deliberately no historical backfill.
create table public.staff_payment_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null unique references public.order_events(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  kind text not null check (kind in ('confirmed', 'updated')),
  payment_amount_received numeric(10,2) not null check (payment_amount_received >= 0),
  previous_amount numeric(10,2),
  order_snapshot jsonb not null check (jsonb_typeof(order_snapshot) = 'object'),
  idempotency_key text not null unique,
  message_payload jsonb check (message_payload is null or jsonb_typeof(message_payload) = 'object'),
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','ERROR','SENT','NEEDS_REVIEW')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text check (provider_message_id is null or length(provider_message_id) between 1 and 160),
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_payment_email_due_idx on public.staff_payment_email_outbox(next_attempt_at, created_at)
  where status in ('PENDING','ERROR','SENDING');
create index staff_payment_email_order_idx on public.staff_payment_email_outbox(order_id, created_at);
alter table public.staff_payment_email_outbox enable row level security;
revoke all on public.staff_payment_email_outbox from public, anon, authenticated;
grant select, insert, update on public.staff_payment_email_outbox to service_role;

create function public.queue_staff_payment_email()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  paid_order public.orders;
  notice_id uuid := gen_random_uuid();
begin
  select * into paid_order from public.orders where id = new.order_id;
  if paid_order.payment_status <> 'PAID' or paid_order.payment_amount_received is null then
    raise exception 'invalid_payment_email_event';
  end if;
  insert into public.staff_payment_email_outbox (
    id, event_id, order_id, kind, payment_amount_received, previous_amount, order_snapshot, idempotency_key, created_at
  ) values (
    notice_id, new.id, new.order_id,
    case when new.event_type = 'PAYMENT_CONFIRMED' then 'confirmed' else 'updated' end,
    paid_order.payment_amount_received,
    case when new.event_type = 'PAYMENT_AMOUNT_CORRECTED' then (new.details->>'from')::numeric else null end,
    jsonb_build_object('id', paid_order.id, 'order_number', paid_order.order_number,
      'total', paid_order.total, 'payment_amount_received', paid_order.payment_amount_received,
      'customer_name', paid_order.customer_name, 'customer_email', paid_order.customer_email,
      'payment_received_via', paid_order.payment_received_via, 'payment_method', paid_order.payment_method,
      'payment_confirmed_at', paid_order.payment_confirmed_at, 'updated_at', new.created_at),
    'staff-payment/v1/' || notice_id::text, new.created_at
  );
  return new;
end;
$$;
create trigger queue_staff_payment_email after insert on public.order_events
  for each row when (new.event_type in ('PAYMENT_CONFIRMED','PAYMENT_AMOUNT_CORRECTED'))
  execute function public.queue_staff_payment_email();

-- Preserve the event snapshot and the exact provider payload across retries,
-- even when later corrections, fulfillment changes or deployments occur.
create function public.protect_staff_payment_email()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id, new.event_id, new.order_id, new.kind, new.payment_amount_received,
      new.previous_amount, new.order_snapshot, new.idempotency_key, new.created_at)
    is distinct from
    (old.id, old.event_id, old.order_id, old.kind, old.payment_amount_received,
      old.previous_amount, old.order_snapshot, old.idempotency_key, old.created_at)
    or (old.message_payload is not null and new.message_payload is distinct from old.message_payload) then
    raise exception 'immutable_payment_email';
  end if;
  return new;
end;
$$;
create trigger protect_staff_payment_email before update on public.staff_payment_email_outbox
  for each row execute function public.protect_staff_payment_email();

create or replace function public.claim_staff_payment_email(p_delivery_id uuid default null, p_order_id uuid default null)
returns setof public.staff_payment_email_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.staff_payment_email_outbox;
begin
  select * into selected_delivery
  from public.staff_payment_email_outbox
  where (p_delivery_id is null or id = p_delivery_id)
    and (p_order_id is null or order_id = p_order_id)
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
      from public.staff_payment_email_outbox
      where id = p_delivery_id and status = 'SENT'
        and (p_order_id is null or order_id = p_order_id);
      if selected_delivery.id is not null then
        return next selected_delivery;
      end if;
    end if;
    return;
  end if;

  if selected_delivery.attempt_count >= 8
     or (selected_delivery.first_attempt_at is not null
         and selected_delivery.first_attempt_at < now() - interval '23 hours') then
    update public.staff_payment_email_outbox
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

  update public.staff_payment_email_outbox
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

create or replace function public.complete_staff_payment_email(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns public.staff_payment_email_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.staff_payment_email_outbox;
begin
  select * into selected_delivery
  from public.staff_payment_email_outbox
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

  update public.staff_payment_email_outbox
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

create or replace function public.fail_staff_payment_email(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error text,
  p_retryable boolean
)
returns public.staff_payment_email_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_delivery public.staff_payment_email_outbox;
  next_status text;
begin
  select * into selected_delivery
  from public.staff_payment_email_outbox
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

  update public.staff_payment_email_outbox
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

create function public.prepare_staff_payment_email(p_delivery_id uuid, p_claim_token uuid, p_payload jsonb)
returns public.staff_payment_email_outbox language plpgsql security invoker set search_path = '' as $$
declare selected_delivery public.staff_payment_email_outbox;
begin
  select * into selected_delivery from public.staff_payment_email_outbox where id = p_delivery_id for update;
  if selected_delivery.id is null then raise exception 'delivery_not_found'; end if;
  if selected_delivery.status <> 'SENDING' or selected_delivery.claim_token is distinct from p_claim_token then
    raise exception 'delivery_claim_conflict';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_payment_email_payload'; end if;
  update public.staff_payment_email_outbox set message_payload = coalesce(message_payload, p_payload)
    where id = p_delivery_id returning * into selected_delivery;
  return selected_delivery;
end;
$$;

revoke execute on function public.queue_staff_payment_email() from public, anon, authenticated;
grant execute on function public.queue_staff_payment_email() to service_role;
revoke execute on function public.protect_staff_payment_email() from public, anon, authenticated;
grant execute on function public.protect_staff_payment_email() to service_role;
revoke execute on function public.claim_staff_payment_email(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_staff_payment_email(uuid, uuid) to service_role;
revoke execute on function public.prepare_staff_payment_email(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_staff_payment_email(uuid, uuid, jsonb) to service_role;
revoke execute on function public.complete_staff_payment_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_staff_payment_email(uuid, uuid, text) to service_role;
revoke execute on function public.fail_staff_payment_email(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_staff_payment_email(uuid, uuid, text, boolean) to service_role;

commit;
