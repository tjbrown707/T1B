begin;

-- Return a row when an exhausted delivery is terminalized so the scheduled
-- worker can report it and continue to the next due delivery.
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

-- A known test label is terminally suppressed as soon as its own PrintNode
-- submission is recorded, even if the packing slip has not printed yet.
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

revoke execute on function public.claim_order_processed_email(uuid) from public, anon, authenticated;
revoke execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.claim_order_processed_email(uuid) to service_role;
grant execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean) to service_role;

commit;
