begin;

-- Keep the immutable order total as the price quoted at checkout while
-- separately recording what was actually received. Exact numeric cents avoid
-- floating-point money errors. Existing paid orders start at their order total
-- and can be corrected through the audited staff workflow below.
alter table public.orders
  add column payment_amount_received numeric(10, 2);

update public.orders
set payment_amount_received = total
where payment_status in ('PAID', 'REFUNDED')
  and payment_amount_received is null;

alter table public.orders
  add constraint orders_payment_amount_received_nonnegative
    check (
      payment_amount_received is null
      or (payment_amount_received >= 0 and payment_amount_received < 100000000)
    ),
  add constraint orders_payment_amount_received_state_valid
    check (
      (payment_status in ('PAID', 'REFUNDED') and payment_amount_received is not null)
      or (payment_status in ('AWAITING_PAYMENT', 'CANCELLED') and payment_amount_received is null)
    );

-- PostgREST does not support overloaded RPCs reliably. Replace the old
-- confirmation signature instead of leaving both signatures exposed.
drop function public.confirm_order_payment(uuid, text, text, text, uuid);

create function public.confirm_order_payment(
  p_order_id uuid,
  p_expected_payment_status text,
  p_fulfillment_method text,
  p_payment_received_via text,
  p_payment_amount_received numeric,
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
  if p_payment_amount_received is null
     or p_payment_amount_received < 0
     or p_payment_amount_received >= 100000000
     or p_payment_amount_received <> round(p_payment_amount_received, 2) then
    raise exception 'invalid_payment_amount';
  end if;

  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;

  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status = 'PAID' then
    if selected_order.fulfillment_method = p_fulfillment_method
       and selected_order.payment_received_via = p_payment_received_via
       and selected_order.payment_amount_received = p_payment_amount_received then
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
      payment_amount_received = p_payment_amount_received,
      payment_confirmed_at = now(),
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (p_order_id, 'PAYMENT_CONFIRMED', p_actor_user_id,
    jsonb_build_object(
      'payment_received_via', selected_order.payment_received_via,
      'payment_amount_received', selected_order.payment_amount_received,
      'order_total', selected_order.total,
      'difference', selected_order.payment_amount_received - selected_order.total,
      'fulfillment_method', selected_order.fulfillment_method
    ));
  return selected_order;
end;
$$;

-- A correction changes only the amount-received record. It never re-runs the
-- inventory transaction or rewrites the original priced order. The expected
-- value provides optimistic locking so two staff tabs cannot overwrite one
-- another silently, and the immutable event table preserves every change.
create function public.update_order_payment_amount(
  p_order_id uuid,
  p_expected_payment_amount numeric,
  p_payment_amount_received numeric,
  p_actor_user_id uuid
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.orders;
  previous_amount numeric(10, 2);
begin
  if p_expected_payment_amount is null
     or p_payment_amount_received is null
     or p_expected_payment_amount < 0
     or p_payment_amount_received < 0
     or p_expected_payment_amount >= 100000000
     or p_payment_amount_received >= 100000000
     or p_expected_payment_amount <> round(p_expected_payment_amount, 2)
     or p_payment_amount_received <> round(p_payment_amount_received, 2) then
    raise exception 'invalid_payment_amount';
  end if;

  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;

  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status <> 'PAID' then
    raise exception 'order_payment_status_conflict';
  end if;
  if selected_order.payment_amount_received is distinct from p_expected_payment_amount then
    raise exception 'payment_amount_conflict';
  end if;
  if selected_order.payment_amount_received = p_payment_amount_received then
    return selected_order;
  end if;

  previous_amount := selected_order.payment_amount_received;
  update public.orders
  set payment_amount_received = p_payment_amount_received,
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (order_id, event_type, actor_user_id, details)
  values (
    p_order_id,
    'PAYMENT_AMOUNT_CORRECTED',
    p_actor_user_id,
    jsonb_build_object(
      'from', previous_amount,
      'to', selected_order.payment_amount_received,
      'order_total', selected_order.total,
      'difference', selected_order.payment_amount_received - selected_order.total
    )
  );
  return selected_order;
end;
$$;

revoke execute on function public.confirm_order_payment(uuid, text, text, text, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, text, numeric, uuid)
  to service_role;

revoke execute on function public.update_order_payment_amount(uuid, numeric, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.update_order_payment_amount(uuid, numeric, numeric, uuid)
  to service_role;

commit;
