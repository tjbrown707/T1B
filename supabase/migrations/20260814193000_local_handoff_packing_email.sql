begin;

-- Shipping notifications remain immutable v1 payloads. Local handoff uses a
-- separate v2 payload with no carrier or tracking data.
alter table public.order_notification_outbox
  add column fulfillment_method text not null default 'SHIP',
  alter column carrier drop not null,
  alter column service_name drop not null,
  alter column tracking_number drop not null,
  drop constraint order_notification_outbox_template_version_check;

alter table public.order_notification_outbox
  add constraint order_notification_outbox_template_version_check
    check (template_version in (1, 2)),
  add constraint order_notification_outbox_fulfillment_method_check
    check (fulfillment_method in ('SHIP', 'LOCAL_HANDOFF')),
  add constraint order_notification_outbox_payload_shape_check
    check (
      (fulfillment_method = 'SHIP' and template_version = 1
        and carrier is not null and length(trim(carrier)) between 1 and 80
        and service_name is not null and length(trim(service_name)) between 1 and 120
        and tracking_number is not null and length(trim(tracking_number)) between 1 and 160)
      or
      (fulfillment_method = 'LOCAL_HANDOFF' and template_version = 2
        and carrier is null and service_name is null and tracking_number is null and tracking_url is null)
    );

create or replace function public.record_order_print_submission(
  p_order_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_printnode_job_id bigint,
  p_automatic boolean default false
)
returns table (delivery_id uuid, delivery_status text, queued_now boolean, readiness text)
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

  select * into selected_order from public.orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.fulfillment_method = 'LOCAL_HANDOFF'
     and p_event_type = 'SHIPPING_LABEL_PRINTED' then
    raise exception 'local_handoff_does_not_ship';
  end if;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (p_order_id, p_event_type, p_actor_user_id,
    jsonb_build_object('printnode_job_id', p_printnode_job_id, 'automatic', coalesce(p_automatic, false)))
  on conflict do nothing;

  select exists (select 1 from public.order_events
    where order_id = p_order_id and event_type = 'FULFILLMENT_PACKET_PRINTED')
  into has_packing_slip;

  if selected_order.fulfillment_method = 'LOCAL_HANDOFF' then
    if not has_packing_slip then
      return query select null::uuid, null::text, false, 'WAITING_FOR_PACKING_SLIP'::text;
      return;
    end if;
    if selected_order.payment_status <> 'PAID'
       or length(trim(coalesce(selected_order.customer_email, ''))) not between 3 and 320
       or length(trim(coalesce(selected_order.customer_name, ''))) not between 1 and 160
       or length(trim(coalesce(selected_order.order_number, ''))) not between 1 and 80 then
      return query select null::uuid, null::text, false, 'NOT_ELIGIBLE'::text;
      return;
    end if;

    insert into public.order_notification_outbox (
      order_id, notification_type, template_version, fulfillment_method,
      recipient_email, customer_name, order_number, carrier, service_name,
      tracking_number, tracking_url, idempotency_key, triggered_by_user_id
    ) values (
      p_order_id, 'ORDER_PROCESSED', 2, 'LOCAL_HANDOFF',
      trim(selected_order.customer_email), trim(selected_order.customer_name),
      trim(selected_order.order_number), null, null, null, null,
      'order-processed/v2/' || p_order_id::text, p_actor_user_id
    )
    on conflict (order_id, notification_type) do nothing
    returning * into inserted_delivery;

    if inserted_delivery.id is not null then
      selected_delivery := inserted_delivery;
      insert into public.order_events (order_id, event_type, actor_user_id, details)
      values (p_order_id, 'ORDER_PROCESSED_EMAIL_QUEUED', p_actor_user_id,
        jsonb_build_object('delivery_id', selected_delivery.id,
          'fulfillment_method', selected_delivery.fulfillment_method,
          'template_version', selected_delivery.template_version));
      return query select selected_delivery.id, selected_delivery.status, true, 'QUEUED'::text;
      return;
    end if;

    select * into selected_delivery from public.order_notification_outbox
    where order_id = p_order_id and notification_type = 'ORDER_PROCESSED';
    return query select selected_delivery.id, selected_delivery.status, false, selected_delivery.status;
    return;
  end if;

  select exists (select 1 from public.order_events
    where order_id = p_order_id and event_type = 'SHIPPING_LABEL_PRINTED')
  into has_shipping_label;
  select * into selected_shipment from public.order_shipments where order_id = p_order_id;

  if has_shipping_label and selected_shipment.id is not null
     and selected_shipment.is_test is not false then
    return query select null::uuid, null::text, false, 'TEST_LABEL'::text;
    return;
  end if;
  if not has_packing_slip or not has_shipping_label then
    return query select null::uuid, null::text, false,
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
     or length(trim(coalesce(selected_order.order_number, ''))) not between 1 and 80
     or length(trim(coalesce(selected_shipment.carrier, ''))) not between 1 and 80
     or length(trim(coalesce(selected_shipment.service_name, ''))) not between 1 and 120
     or length(trim(coalesce(selected_shipment.tracking_number, ''))) not between 1 and 160
     or length(trim(coalesce(selected_shipment.label_url, ''))) < 1 then
    return query select null::uuid, null::text, false, 'NOT_ELIGIBLE'::text;
    return;
  end if;

  insert into public.order_notification_outbox (
    order_id, notification_type, template_version, fulfillment_method,
    recipient_email, customer_name, order_number, carrier, service_name,
    tracking_number, tracking_url, idempotency_key, triggered_by_user_id
  ) values (
    p_order_id, 'ORDER_PROCESSED', 1, 'SHIP', trim(selected_order.customer_email),
    trim(selected_order.customer_name), trim(selected_order.order_number),
    trim(selected_shipment.carrier), trim(selected_shipment.service_name),
    trim(selected_shipment.tracking_number),
    nullif(trim(coalesce(selected_shipment.tracking_url, '')), ''),
    'order-processed/v1/' || p_order_id::text, p_actor_user_id
  )
  on conflict (order_id, notification_type) do nothing
  returning * into inserted_delivery;

  if inserted_delivery.id is not null then
    selected_delivery := inserted_delivery;
    insert into public.order_events (order_id, event_type, actor_user_id, details)
    values (p_order_id, 'ORDER_PROCESSED_EMAIL_QUEUED', p_actor_user_id,
      jsonb_build_object('delivery_id', selected_delivery.id,
        'fulfillment_method', selected_delivery.fulfillment_method,
        'template_version', selected_delivery.template_version));
    return query select selected_delivery.id, selected_delivery.status, true, 'QUEUED'::text;
    return;
  end if;

  select * into selected_delivery from public.order_notification_outbox
  where order_id = p_order_id and notification_type = 'ORDER_PROCESSED';
  return query select selected_delivery.id, selected_delivery.status, false, selected_delivery.status;
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
declare selected_delivery public.order_notification_outbox;
begin
  select * into selected_delivery from public.order_notification_outbox
  where id = p_delivery_id for update;
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
  set status = 'SENT', sent_at = now(), provider_message_id = p_provider_message_id,
      claim_token = null, claimed_at = null, next_attempt_at = now(),
      last_error = null, updated_at = now()
  where id = p_delivery_id returning * into selected_delivery;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (selected_delivery.order_id,
    case when selected_delivery.fulfillment_method = 'LOCAL_HANDOFF'
      then 'CUSTOMER_HANDOFF_EMAIL_SENT' else 'CUSTOMER_TRACKING_EMAIL_SENT' end,
    selected_delivery.triggered_by_user_id,
    jsonb_build_object('delivery_id', selected_delivery.id,
      'provider_message_id', p_provider_message_id));
  return selected_delivery;
end;
$$;

revoke execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean) from public, anon, authenticated;
revoke execute on function public.complete_order_processed_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean) to service_role;
grant execute on function public.complete_order_processed_email(uuid, uuid, text) to service_role;

commit;
