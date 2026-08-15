begin;

-- Phase one safely added the local v2 outbox while local printing stayed
-- blocked. Before enabling it, keep historical completed orders from creating
-- a late first email; an already-created v2 row remains idempotently reusable.
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
    -- Reprints reuse an existing immutable v2 row even after handoff, but a
    -- completed historical order must never create its first email late.
    select * into selected_delivery from public.order_notification_outbox
    where order_id = p_order_id
      and notification_type = 'ORDER_PROCESSED'
      and fulfillment_method = 'LOCAL_HANDOFF'
      and template_version = 2;
    if selected_delivery.id is not null then
      return query select selected_delivery.id, selected_delivery.status, false, selected_delivery.status;
      return;
    end if;

    if selected_order.payment_status <> 'PAID'
       or selected_order.fulfillment_status <> 'READY_TO_PICK'
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
    where order_id = p_order_id
      and notification_type = 'ORDER_PROCESSED'
      and fulfillment_method = 'LOCAL_HANDOFF'
      and template_version = 2;
    if selected_delivery.id is null then
      return query select null::uuid, null::text, false, 'NOT_ELIGIBLE'::text;
      return;
    end if;
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

revoke execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.record_order_print_submission(uuid, text, uuid, bigint, boolean)
  to service_role;

-- Local handoff is complete only after PrintNode accepted the packing-slip job
-- and the same transaction created the immutable version-2 email outbox row.
-- This trigger protects every server-side write, not just the admin RPC.
create or replace function public.require_local_handoff_print_before_delivery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.fulfillment_method = 'LOCAL_HANDOFF'
     and new.fulfillment_status = 'DELIVERED'
     and (
       old.fulfillment_method is distinct from new.fulfillment_method
       or old.fulfillment_status is distinct from new.fulfillment_status
     )
     and not (
       exists (
         select 1
         from public.order_events print_event
         where print_event.order_id = new.id
           and print_event.event_type = 'FULFILLMENT_PACKET_PRINTED'
           and print_event.details ? 'printnode_job_id'
           and (print_event.details ->> 'printnode_job_id') ~ '^[1-9][0-9]*$'
       )
       and exists (
         select 1
         from public.order_notification_outbox delivery
         where delivery.order_id = new.id
           and delivery.notification_type = 'ORDER_PROCESSED'
           and delivery.fulfillment_method = 'LOCAL_HANDOFF'
           and delivery.template_version = 2
       )
     ) then
    raise exception 'local_handoff_requires_printnode_packing_slip';
  end if;
  return new;
end;
$$;

create trigger orders_require_local_handoff_print_before_delivery
before update of fulfillment_status, fulfillment_method on public.orders
for each row execute function public.require_local_handoff_print_before_delivery();

revoke execute on function public.require_local_handoff_print_before_delivery()
  from public, anon, authenticated;

commit;
