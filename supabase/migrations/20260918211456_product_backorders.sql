begin;

-- A shortage holds the whole order, with no fictional lots or negative stock.
-- Existing orders are unchanged. Dates are frozen when the order is placed.
alter table public.orders
  add column backorder_pending boolean not null default false,
  add column estimated_ship_date date,
  add constraint orders_backorder_hold check (
    not backorder_pending or (estimated_ship_date is not null
      and inventory_accounting_mode = 'TRACKED'
      and fulfillment_status in ('ON_HOLD', 'CANCELLED'))
  );

alter function public.reserve_inventory_for_order(uuid, jsonb)
  rename to reserve_available_inventory_for_order;

create function public.reserve_inventory_for_order(p_order_id uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- PL/pgSQL exception blocks roll back every partial allocation and movement.
  begin
    perform public.reserve_available_inventory_for_order(p_order_id, p_items);
  exception when raise_exception then
    if sqlerrm not like 'insufficient_inventory:%'
       or current_setting('app.allow_backorders', true) is distinct from 'true' then
      raise;
    end if;
    update public.orders
    set backorder_pending = true,
        estimated_ship_date = coalesce(estimated_ship_date,
          (now() at time zone 'America/Phoenix')::date + 14)
    where id = p_order_id and payment_status = 'AWAITING_PAYMENT'
      and inventory_accounting_mode = 'TRACKED';
    if not found then raise exception 'invalid_backorder_state'; end if;
    insert into public.order_events(order_id, event_type, details)
    select id, 'BACKORDER_PLACED', jsonb_build_object('estimated_ship_date', estimated_ship_date)
    from public.orders where id = p_order_id;
  end;
end;
$$;

-- Preserve pricing, discount redemption and retry identity in the existing RPC.
alter function public.create_order_transaction(jsonb, text)
  rename to create_order_transaction_before_backorders;
create function public.create_order_transaction(order_payload jsonb, personal_discount_code text default null)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare saved public.orders;
begin
  perform set_config('app.allow_backorders',
    case when order_payload->>'allow_backorder' = 'true' then 'true' else 'false' end, true);
  saved := public.create_order_transaction_before_backorders(order_payload, personal_discount_code);
  perform set_config('app.allow_backorders', 'false', true);
  -- The inner insert's row snapshot predates inventory reservation.
  select * into saved from public.orders where id = saved.id;
  return saved;
end;
$$;

create or replace function public.confirm_order_payment(
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
  if p_payment_received_via not in ('Cash App', 'Venmo', 'Zelle', 'Cash', 'Other') then
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

  if selected_order.backorder_pending then
    if exists (select 1 from public.inventory_reservations where order_id = p_order_id) then
      raise exception 'backorder_has_allocations';
    end if;
  elsif selected_order.inventory_accounting_mode = 'TRACKED' then
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
  elsif exists (
    select 1 from public.inventory_reservations
    where order_id = p_order_id and state = 'RESERVED'
  ) then
    raise exception 'precounted_order_has_reservations';
  end if;

  update public.orders
  set status = 'PAID',
      payment_status = 'PAID',
      fulfillment_status = case when selected_order.backorder_pending then 'ON_HOLD' else 'READY_TO_PICK' end,
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
      'fulfillment_method', selected_order.fulfillment_method,
      'inventory_accounting_mode', selected_order.inventory_accounting_mode,
      'inventory_changed', selected_order.inventory_accounting_mode = 'TRACKED' and not selected_order.backorder_pending
    ));
  return selected_order;
end;
$$;


-- Paid backorders can be allocated explicitly once the complete order fits.
-- A failed attempt rolls back all allocations; a retry after success is a no-op.
create function public.allocate_backorder(p_order_id uuid, p_actor_user_id uuid)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare selected_order public.orders; reservation_row record;
begin
  if p_actor_user_id is null then raise exception 'actor_required'; end if;
  select * into selected_order from public.orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if selected_order.payment_status <> 'PAID' then raise exception 'payment_not_confirmed'; end if;
  if not selected_order.backorder_pending then return selected_order; end if;
  perform public.reserve_available_inventory_for_order(p_order_id, selected_order.items);
  for reservation_row in
    select * from public.inventory_reservations where order_id = p_order_id and state = 'RESERVED'
    order by lot_id for update
  loop
    update public.inventory_lots
    set on_hand = on_hand - reservation_row.quantity,
        reserved = reserved - reservation_row.quantity, updated_at = now()
    where id = reservation_row.lot_id and on_hand >= reservation_row.quantity
      and reserved >= reservation_row.quantity;
    if not found then raise exception 'inventory_counter_mismatch'; end if;
    update public.inventory_reservations set state = 'COMMITTED', committed_at = now()
    where id = reservation_row.id;
    insert into public.inventory_movements(product_id,lot_id,order_id,movement_type,
      on_hand_delta,reserved_delta,reason,actor_user_id,idempotency_key)
    values(reservation_row.product_id,reservation_row.lot_id,p_order_id,'SALE',
      -reservation_row.quantity,-reservation_row.quantity,'Paid backorder allocated',p_actor_user_id,
      'sale:' || p_order_id::text || ':' || reservation_row.lot_id::text);
  end loop;
  update public.orders set backorder_pending = false, fulfillment_status = 'READY_TO_PICK', updated_at = now()
  where id = p_order_id returning * into selected_order;
  insert into public.order_events(order_id,event_type,actor_user_id,details)
  values(p_order_id,'BACKORDER_ALLOCATED',p_actor_user_id,'{}'::jsonb);
  return selected_order;
end;
$$;

-- Unpaid backorders have no lot reservations to restore. Allocated/ordinary
-- cancelled orders continue through the original strict ledger reconciliation.
alter function public.reopen_cancelled_order(uuid,text,uuid) rename to reopen_allocated_cancelled_order;
create function public.reopen_cancelled_order(p_order_id uuid,p_expected_payment_status text,p_actor_user_id uuid)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare selected_order public.orders;
begin
  select * into selected_order from public.orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'order_not_found'; end if;
  if not selected_order.backorder_pending then
    return public.reopen_allocated_cancelled_order(p_order_id,p_expected_payment_status,p_actor_user_id);
  end if;
  if p_actor_user_id is null then raise exception 'actor_required'; end if;
  if p_expected_payment_status is distinct from 'CANCELLED'
     or selected_order.payment_status <> 'CANCELLED'
     or selected_order.status <> 'CANCELLED' or selected_order.fulfillment_status <> 'CANCELLED'
     or selected_order.payment_confirmed_at is not null
     or selected_order.payment_received_via is not null
     or selected_order.payment_amount_received is not null then
    raise exception 'order_reopen_state_mismatch';
  end if;
  if exists (select 1 from public.inventory_reservations where order_id=p_order_id) then
    raise exception 'backorder_has_allocations';
  end if;
  update public.orders set payment_status='AWAITING_PAYMENT',status='AWAITING PAYMENT',
    fulfillment_status='ON_HOLD',reservation_expires_at=now()+interval '24 hours',updated_at=now()
  where id=p_order_id returning * into selected_order;
  insert into public.order_events(order_id,event_type,actor_user_id,details)
  values(p_order_id,'UNPAID_ORDER_REOPENED',p_actor_user_id,jsonb_build_object('backorder',true));
  return selected_order;
end;
$$;

-- Same availability calculation as the strict allocator; no lot data is exposed.
create function public.storefront_availability()
returns table(product_id text, available bigint)
language sql stable security invoker set search_path = '' as $$
  select p.product_id, coalesce(sum(l.on_hand-l.reserved),0)::bigint
  from public.inventory_products p left join public.inventory_lots l using(product_id)
  group by p.product_id;
$$;

create or replace function public.enqueue_order_receipt(p_order_id uuid)
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
    raise exception 'invalid_receipt_order';
  end if;

  insert into public.order_receipt_outbox (
    order_id,
    recipient_email,
    customer_name,
    order_number,
    items_text,
    subtotal,
    discount_code,
    discount_amount,
    shipping,
    payment_method,
    total,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_zip,
    customer_phone,
    idempotency_key
  )
  select
    orders.id,
    trim(orders.customer_email),
    trim(orders.customer_name),
    trim(orders.order_number),
    trim(orders.items_text) || case when orders.estimated_ship_date is not null
      then E'\n\nOn Backorder — estimated ship date: ' || to_char(orders.estimated_ship_date, 'FMMonth FMDD, YYYY') || '. Your order ships together.'
      else '' end,
    orders.subtotal,
    coalesce(trim(orders.discount_code), ''),
    orders.discount_amount,
    orders.shipping,
    trim(orders.payment_method),
    orders.total,
    trim(orders.ship_address),
    trim(orders.ship_city),
    trim(orders.ship_state),
    trim(orders.ship_zip),
    trim(orders.customer_phone),
    'order-receipt/v1/' || orders.id::text
  from public.orders
  where orders.id = p_order_id
  on conflict (order_id) do nothing
  returning * into inserted_delivery;

  if inserted_delivery.id is not null then
    return inserted_delivery;
  end if;

  select * into selected_delivery
  from public.order_receipt_outbox
  where order_id = p_order_id;

  if selected_delivery.id is null then
    raise exception 'receipt_order_not_found';
  end if;
  return selected_delivery;
end;
$$;

revoke all on function public.reserve_inventory_for_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_inventory_for_order(uuid,jsonb) to service_role;
revoke all on function public.create_order_transaction(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_order_transaction(jsonb,text) to service_role;
revoke all on function public.confirm_order_payment(uuid,text,text,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.confirm_order_payment(uuid,text,text,text,numeric,uuid) to service_role;
revoke all on function public.allocate_backorder(uuid,uuid) from public,anon,authenticated;
grant execute on function public.allocate_backorder(uuid,uuid) to service_role;
revoke all on function public.reopen_cancelled_order(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reopen_cancelled_order(uuid,text,uuid) to service_role;
revoke all on function public.storefront_availability() from public,anon,authenticated;
grant execute on function public.storefront_availability() to service_role;

commit;
