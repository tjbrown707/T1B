begin;

-- The original three-argument payment function survived the later payment
-- workflow migrations. Removing it keeps PostgREST from seeing two overloads
-- for the same RPC name and accidentally choosing the obsolete path.
drop function if exists public.confirm_order_payment(uuid, text, uuid);

-- A reopened order can be cancelled again. Use an order-level cancellation
-- cycle in each ledger key so every release remains immutable and unique,
-- including orders whose original release used the older unsuffixed key.
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
  cancellation_cycle bigint;
begin
  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;

  if selected_order.id is null then
    raise exception 'order_not_found';
  end if;
  if selected_order.payment_status = 'CANCELLED' then
    return selected_order;
  end if;
  if selected_order.payment_status is distinct from p_expected_payment_status
     or selected_order.payment_status is distinct from 'AWAITING_PAYMENT' then
    raise exception 'paid_order_requires_refund';
  end if;

  if selected_order.inventory_accounting_mode = 'PRECOUNTED_LEGACY'
     and exists (
       select 1
       from public.inventory_reservations
       where order_id = p_order_id
     ) then
    raise exception 'precounted_order_has_reservations';
  end if;

  select count(*) + 1 into cancellation_cycle
  from public.order_events
  where order_id = p_order_id
    and event_type = 'UNPAID_ORDER_CANCELLED';

  -- Lock reservations and their lots in one stable order. The enclosing order
  -- lock serializes two actions against this order; lot ordering reduces
  -- contention with other inventory workflows.
  for reservation_row in
    select r.id, r.product_id, r.lot_id, r.quantity
    from public.inventory_reservations r
    where r.order_id = p_order_id
      and r.state = 'RESERVED'
    order by r.lot_id, r.id
    for update
  loop
    perform 1
    from public.inventory_lots
    where id = reservation_row.lot_id
      and reserved >= reservation_row.quantity
    for update;
    if not found then
      raise exception 'inventory_counter_mismatch';
    end if;

    update public.inventory_lots
    set reserved = reserved - reservation_row.quantity,
        updated_at = now()
    where id = reservation_row.lot_id;

    update public.inventory_reservations
    set state = 'RELEASED',
        released_at = now()
    where id = reservation_row.id;

    insert into public.inventory_movements (
      product_id, lot_id, order_id, movement_type, on_hand_delta,
      reserved_delta, reason, actor_user_id, idempotency_key
    ) values (
      reservation_row.product_id, reservation_row.lot_id, p_order_id,
      'RESERVATION_RELEASE', 0, -reservation_row.quantity,
      'Unpaid order cancelled', p_actor_user_id,
      'release:' || p_order_id::text || ':' || reservation_row.lot_id::text
        || ':' || cancellation_cycle::text
    );
  end loop;

  update public.orders
  set status = 'CANCELLED',
      payment_status = 'CANCELLED',
      fulfillment_status = 'CANCELLED',
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (
    order_id, event_type, actor_user_id, details
  ) values (
    p_order_id,
    'UNPAID_ORDER_CANCELLED',
    p_actor_user_id,
    jsonb_build_object(
      'cancellation_cycle', cancellation_cycle,
      'reservation_expires_at', selected_order.reservation_expires_at,
      'inventory_accounting_mode', selected_order.inventory_accounting_mode
    )
  );

  return selected_order;
end;
$$;

-- Restore a cancelled unpaid order and, for tracked orders, restore its exact
-- prior lot reservations. No fresh lot allocation is allowed here: the old
-- reservation rows preserve the allocation, and the append-only ledger proves
-- the original lot and quantity before any inventory counter is restored.
create or replace function public.reopen_cancelled_order(
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
  shortage_product_id text;
  reopen_cycle bigint;
  previous_expiration timestamptz;
  new_expiration timestamptz := now() + interval '24 hours';
begin
  if p_actor_user_id is null then
    raise exception 'actor_required';
  end if;

  select * into selected_order
  from public.orders
  where id = p_order_id
  for update;

  if selected_order.id is null then
    raise exception 'order_not_found';
  end if;
  previous_expiration := selected_order.reservation_expires_at;
  if p_expected_payment_status is distinct from 'CANCELLED'
     or selected_order.payment_status is distinct from p_expected_payment_status then
    raise exception 'order_reopen_status_conflict';
  end if;
  if selected_order.status is distinct from 'CANCELLED'
     or selected_order.fulfillment_status is distinct from 'CANCELLED'
     or selected_order.payment_confirmed_at is not null
     or selected_order.payment_received_via is not null
     or selected_order.payment_amount_received is not null then
    raise exception 'order_reopen_state_mismatch';
  end if;

  select count(*) + 1 into reopen_cycle
  from public.order_events
  where order_id = p_order_id
    and event_type = 'UNPAID_ORDER_REOPENED';

  if selected_order.inventory_accounting_mode = 'TRACKED' then
    -- Lock every saved allocation first, then every original lot by UUID.
    -- This prevents a concurrent adjustment or order action from changing an
    -- availability decision between validation and counter updates.
    perform r.id
    from public.inventory_reservations r
    where r.order_id = p_order_id
    order by r.lot_id, r.id
    for update;

    if not exists (
      select 1
      from public.inventory_reservations
      where order_id = p_order_id
    ) or exists (
      select 1
      from public.inventory_reservations
      where order_id = p_order_id
        and (
          state <> 'RELEASED'
          or released_at is null
          or committed_at is not null
        )
    ) then
      raise exception 'inventory_reservation_mismatch';
    end if;

    -- The reservation table is operational state; the movement ledger is the
    -- immutable proof of the lot and quantity originally allocated. Require a
    -- one-to-one match in both directions before restoring any counters.
    if exists (
      select 1
      from public.inventory_reservations r
      where r.order_id = p_order_id
        and not exists (
          select 1
          from public.inventory_movements m
          where m.order_id = p_order_id
            and m.lot_id = r.lot_id
            and m.product_id = r.product_id
            and m.movement_type = 'RESERVATION'
            and m.on_hand_delta = 0
            and m.reserved_delta = r.quantity
            and m.idempotency_key =
              'reserve:' || p_order_id::text || ':' || r.lot_id::text
        )
    ) or exists (
      select 1
      from public.inventory_movements m
      where m.order_id = p_order_id
        and m.movement_type = 'RESERVATION'
        and m.idempotency_key =
          'reserve:' || p_order_id::text || ':' || m.lot_id::text
        and not exists (
          select 1
          from public.inventory_reservations r
          where r.order_id = p_order_id
            and r.lot_id = m.lot_id
            and r.product_id = m.product_id
            and r.quantity = m.reserved_delta
        )
    ) then
      raise exception 'inventory_reservation_mismatch';
    end if;

    if jsonb_typeof(selected_order.items) is distinct from 'array' then
      raise exception 'inventory_reservation_mismatch';
    end if;
    if jsonb_array_length(selected_order.items) = 0
       or exists (
         select 1
         from jsonb_array_elements(selected_order.items) as entry(item)
         where jsonb_typeof(item) is distinct from 'object'
            or coalesce(item->>'id', '') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
            or case
                 when coalesce(item->>'qty', '') ~ '^[1-9][0-9]*$'
                   then (item->>'qty')::numeric > 999
                 else true
               end
       ) then
      raise exception 'inventory_reservation_mismatch';
    end if;

    if exists (
      select 1
      from (
        select item->>'id' as product_id,
               sum((item->>'qty')::integer)::integer as quantity
        from jsonb_array_elements(selected_order.items) as entry(item)
        group by item->>'id'
      ) expected
      full join (
        select product_id, sum(quantity)::integer as quantity
        from public.inventory_reservations
        where order_id = p_order_id
        group by product_id
      ) saved using (product_id)
      where coalesce(saved.quantity, 0) <> coalesce(expected.quantity, 0)
    ) then
      raise exception 'inventory_reservation_mismatch';
    end if;

    perform l.id
    from public.inventory_lots l
    join public.inventory_reservations r on r.lot_id = l.id
    where r.order_id = p_order_id
    order by l.id
    for update of l;

    if exists (
      select 1
      from public.inventory_reservations r
      join public.inventory_lots l on l.id = r.lot_id
      where r.order_id = p_order_id
        and l.product_id <> r.product_id
    ) then
      raise exception 'inventory_reservation_mismatch';
    end if;

    -- A sale is irreversible through this unpaid-order workflow. Also prove
    -- that every saved lot was released for its full quantity and that the
    -- immutable movement ledger is balanced back to zero before re-reserving.
    if exists (
      select 1
      from public.inventory_movements m
      where m.order_id = p_order_id
        and m.movement_type = 'SALE'
    ) or exists (
      select 1
      from public.inventory_reservations r
      where r.order_id = p_order_id
        and (
          not exists (
            select 1
            from public.inventory_movements release_movement
            where release_movement.order_id = p_order_id
              and release_movement.lot_id = r.lot_id
              and release_movement.product_id = r.product_id
              and release_movement.movement_type = 'RESERVATION_RELEASE'
              and release_movement.on_hand_delta = 0
              and release_movement.reserved_delta = -r.quantity
          )
          or coalesce((
            select sum(balance_movement.reserved_delta)
            from public.inventory_movements balance_movement
            where balance_movement.order_id = p_order_id
              and balance_movement.lot_id = r.lot_id
          ), 0) <> 0
        )
    ) then
      raise exception 'inventory_reservation_mismatch';
    end if;

    -- The lot counter is a cached aggregate. Reconcile it against every
    -- currently RESERVED row (not only this order) while the lot lock is held.
    if exists (
      select 1
      from public.inventory_lots l
      join public.inventory_reservations involved
        on involved.lot_id = l.id
       and involved.order_id = p_order_id
      where l.reserved <> coalesce((
        select sum(active.quantity)
        from public.inventory_reservations active
        where active.lot_id = l.id
          and active.state = 'RESERVED'
      ), 0)
    ) then
      raise exception 'inventory_counter_mismatch';
    end if;

    select r.product_id into shortage_product_id
    from public.inventory_reservations r
    join public.inventory_lots l on l.id = r.lot_id
    where r.order_id = p_order_id
      and (l.on_hand - l.reserved) < r.quantity
    order by r.product_id, r.lot_id
    limit 1;

    if shortage_product_id is not null then
      raise exception 'insufficient_inventory:%', shortage_product_id;
    end if;

    update public.inventory_lots l
    set reserved = l.reserved + r.quantity,
        updated_at = now()
    from public.inventory_reservations r
    where r.order_id = p_order_id
      and r.lot_id = l.id;

    update public.inventory_reservations
    set state = 'RESERVED',
        committed_at = null,
        released_at = null
    where order_id = p_order_id;

    insert into public.inventory_movements (
      product_id, lot_id, order_id, movement_type, on_hand_delta,
      reserved_delta, reason, actor_user_id, idempotency_key
    )
    select
      r.product_id,
      r.lot_id,
      p_order_id,
      'RESERVATION',
      0,
      r.quantity,
      'Cancelled order reopened; original inventory re-reserved',
      p_actor_user_id,
      'reopen:' || p_order_id::text || ':' || r.lot_id::text
        || ':' || reopen_cycle::text
    from public.inventory_reservations r
    where r.order_id = p_order_id
    order by r.lot_id, r.id;
  elsif selected_order.inventory_accounting_mode = 'PRECOUNTED_LEGACY' then
    if exists (
      select 1
      from public.inventory_reservations
      where order_id = p_order_id
    ) then
      raise exception 'precounted_order_has_reservations';
    end if;
  else
    raise exception 'order_reopen_state_mismatch';
  end if;

  update public.orders
  set status = 'AWAITING PAYMENT',
      payment_status = 'AWAITING_PAYMENT',
      fulfillment_status = 'ON_HOLD',
      reservation_expires_at = new_expiration,
      updated_at = now()
  where id = p_order_id
  returning * into selected_order;

  insert into public.order_events (
    order_id, event_type, actor_user_id, details
  ) values (
    p_order_id,
    'UNPAID_ORDER_REOPENED',
    p_actor_user_id,
    jsonb_build_object(
      'reopen_cycle', reopen_cycle,
      'previous_reservation_expires_at', previous_expiration,
      'reservation_expires_at', new_expiration,
      'inventory_accounting_mode', selected_order.inventory_accounting_mode,
      'inventory_re_reserved', selected_order.inventory_accounting_mode = 'TRACKED'
    )
  );

  return selected_order;
end;
$$;

revoke execute on function public.cancel_unpaid_order(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_unpaid_order(uuid, text, uuid)
  to service_role;

revoke execute on function public.reopen_cancelled_order(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_cancelled_order(uuid, text, uuid)
  to service_role;

comment on function public.reopen_cancelled_order(uuid, text, uuid) is
  'Atomically reopens a cancelled unpaid order and restores its original released lot reservations when inventory is available.';

commit;
