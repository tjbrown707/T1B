begin;

-- Orders handed directly to a customer never need a carrier label or printed
-- fulfillment packet. Keep that choice on the order itself so every server
-- endpoint can enforce it independently of the browser UI.
alter table public.orders
  add column fulfillment_method text not null default 'SHIP',
  add column payment_received_via text;

alter table public.orders
  add constraint orders_fulfillment_method_valid
    check (fulfillment_method in ('SHIP', 'LOCAL_HANDOFF')),
  add constraint orders_payment_received_via_valid
    check (payment_received_via is null or payment_received_via in (
      'Cash App', 'Venmo', 'Cash', 'Other'
    )),
  add constraint orders_local_handoff_status_valid
    check (
      fulfillment_method = 'SHIP'
      or fulfillment_status in ('ON_HOLD', 'READY_TO_PICK', 'DELIVERED', 'CANCELLED')
    );

-- Payment confirmation remains one locked transaction: inventory is committed,
-- the payment channel and delivery method are recorded, and the audit event is
-- appended together. A retry is accepted only when it repeats the same choice.
create or replace function public.confirm_order_payment(
  p_order_id uuid,
  p_expected_payment_status text,
  p_fulfillment_method text,
  p_payment_received_via text,
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
  if p_fulfillment_method not in ('SHIP', 'LOCAL_HANDOFF') then
    raise exception 'invalid_fulfillment_method';
  end if;
  if p_payment_received_via not in ('Cash App', 'Venmo', 'Cash', 'Other') then
    raise exception 'invalid_payment_received_via';
  end if;

  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;

  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status = 'PAID' then
    if selected_order.fulfillment_method = p_fulfillment_method
       and selected_order.payment_received_via = p_payment_received_via then
      return selected_order;
    end if;
    raise exception 'order_payment_status_conflict';
  end if;
  if selected_order.payment_status <> p_expected_payment_status
     or selected_order.payment_status <> 'AWAITING_PAYMENT' then
    raise exception 'order_payment_status_conflict';
  end if;

  if not exists (
    select 1 from public.inventory_reservations
    where order_id = p_order_id and state = 'RESERVED'
  ) then
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
  set status = 'PAID',
      payment_status = 'PAID',
      fulfillment_status = 'READY_TO_PICK',
      fulfillment_method = p_fulfillment_method,
      payment_received_via = p_payment_received_via,
      payment_confirmed_at = now(),
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (p_order_id, 'PAYMENT_CONFIRMED', p_actor_user_id,
    jsonb_build_object(
      'payment_received_via', selected_order.payment_received_via,
      'fulfillment_method', selected_order.fulfillment_method
    ));
  return selected_order;
end;
$$;

-- Shipped orders keep the pick -> pack path. Local orders have one explicit
-- completion action and can never enter a shipping-only fulfillment state.
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
    (selected_order.fulfillment_method = 'SHIP' and (
      (p_expected_fulfillment_status = 'READY_TO_PICK' and p_target_fulfillment_status = 'PICKED')
      or (p_expected_fulfillment_status = 'PICKED' and p_target_fulfillment_status = 'PACKED')
    ))
    or (selected_order.fulfillment_method = 'LOCAL_HANDOFF'
      and p_expected_fulfillment_status = 'READY_TO_PICK'
      and p_target_fulfillment_status = 'DELIVERED')
  ) then
    raise exception 'invalid_fulfillment_transition';
  end if;

  update public.orders
  set status = case when p_target_fulfillment_status = 'DELIVERED' then 'DELIVERED' else 'PROCESSING' end,
      fulfillment_status = p_target_fulfillment_status,
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (
    p_order_id,
    case when p_target_fulfillment_status = 'DELIVERED'
      then 'LOCAL_HANDOFF_COMPLETED'
      else 'FULFILLMENT_STATUS_CHANGED'
    end,
    p_actor_user_id,
    jsonb_build_object(
      'from', p_expected_fulfillment_status,
      'to', p_target_fulfillment_status,
      'fulfillment_method', selected_order.fulfillment_method
    )
  );
  return selected_order;
end;
$$;

-- Defense in depth: even service-side code cannot create a Shippo record for
-- an order explicitly marked for local handoff.
create or replace function public.prevent_local_handoff_shipment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders
    where id = new.order_id and fulfillment_method = 'LOCAL_HANDOFF'
  ) then
    raise exception 'local_handoff_does_not_ship';
  end if;
  return new;
end;
$$;

create trigger order_shipments_block_local_handoff
before insert or update on public.order_shipments
for each row execute function public.prevent_local_handoff_shipment();

revoke execute on function public.confirm_order_payment(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, text, uuid)
  to service_role;

revoke execute on function public.prevent_local_handoff_shipment()
  from public, anon, authenticated;

commit;
