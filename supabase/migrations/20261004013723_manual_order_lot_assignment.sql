begin;
alter table public.orders
  add column lot_assignment_version integer not null default 0,
  add column lots_confirmed_at timestamptz,
  add column lots_locked_at timestamptz;

-- Preserve paperwork and allocations already used before this release.
update public.orders o set lots_locked_at = now(), lots_confirmed_at = now()
where o.inventory_accounting_mode = 'TRACKED' and (
  o.fulfillment_status in ('PICKED','PACKED','LABEL_CREATED','SHIPPED','DELIVERED')
  or exists (select 1 from public.order_events e where e.order_id=o.id and e.event_type='FULFILLMENT_PACKET_PRINTED')
  or exists (select 1 from public.order_shipments s where s.order_id=o.id
    and (s.status not in ('DRAFT','ERROR') or s.label_url is not null or s.provider_transaction_id is not null))
);

-- Own committed stock is added back when calculating what this order can use.
-- Stock held by other orders remains unavailable. Depleted historical lots do
-- not create a choice unless this order already owns units from them.
create function public.order_lot_choices(p_order_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(product order by product->>'productId'),'[]'::jsonb)
  from (
    select jsonb_build_object('productId', expected.product_id, 'quantity', expected.quantity,
      'lots', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'lotNumber', l.lot_number, 'isProvisional', l.is_provisional,
        'storageLocation', l.storage_location, 'expiresOn', l.expires_on,
        'capacity', l.on_hand-l.reserved+coalesce(r.quantity,0),
        'assigned', coalesce(r.quantity,0))
        order by l.received_at,l.created_at,l.id)
        from public.inventory_lots l
        left join public.inventory_reservations r on r.lot_id=l.id
          and r.order_id=p_order_id and r.state in ('RESERVED','COMMITTED')
        where l.product_id=expected.product_id
          and l.on_hand-l.reserved+coalesce(r.quantity,0)>0),'[]'::jsonb)) as product
    from public.orders o cross join lateral (
      select item->>'id' product_id, sum((item->>'qty')::integer) quantity
      from jsonb_array_elements(o.items) entry(item) group by item->>'id'
    ) expected
    where o.id=p_order_id and o.inventory_accounting_mode='TRACKED'
  ) products;
$$;

create function public.order_needs_lot_assignment(p_order_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((select o.inventory_accounting_mode='TRACKED'
    and o.lots_confirmed_at is null and o.lots_locked_at is null
    and exists (select 1 from jsonb_array_elements(public.order_lot_choices(o.id)) p
      where jsonb_array_length(p->'lots')>1)
    from public.orders o where o.id=p_order_id),false);
$$;

create function public.get_order_lot_choices(p_order_ids uuid[])
returns table(order_id uuid, lot_selection_required boolean, lot_choices jsonb)
language sql stable security invoker set search_path='' as $$
  select o.id, public.order_needs_lot_assignment(o.id),
    case when o.inventory_accounting_mode='TRACKED' and o.payment_status='PAID'
      and o.fulfillment_status='READY_TO_PICK' and not o.backorder_pending and o.lots_locked_at is null
      then public.order_lot_choices(o.id) else '[]'::jsonb end
  from public.orders o where o.id=any(p_order_ids);
$$;

-- Only paid, unpicked orders can be reassigned. Payment remains unchanged.
-- Commit transfers have immutable RETURN/SALE ledger rows; retrying the same
-- version/selection returns the original result, while stale edits conflict.
create function public.assign_order_lots(p_order_id uuid, p_expected_version integer,
  p_assignments jsonb, p_actor_user_id uuid)
returns public.orders language plpgsql security invoker set search_path='' as $$
declare
  o public.orders; change record; previous jsonb; desired jsonb; key_prefix text;
begin
  if p_actor_user_id is null then raise exception 'actor_required'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'order_not_found'; end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' then raise exception 'invalid_lot_assignment'; end if;
  if jsonb_array_length(p_assignments) not between 1 and 200 or exists (
    select 1 from jsonb_array_elements(p_assignments) a where
      coalesce(a->>'lotId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or case when coalesce(a->>'quantity','') ~ '^[1-9][0-9]{0,5}$'
        then (a->>'quantity')::integer>100000 else true end
  ) or exists (select 1 from jsonb_array_elements(p_assignments) a group by (a->>'lotId')::uuid having count(*)>1)
  then raise exception 'invalid_lot_assignment'; end if;
  select jsonb_agg(jsonb_build_object('lotId',(a->>'lotId')::uuid::text,'quantity',(a->>'quantity')::integer) order by (a->>'lotId')::uuid)
    into desired from jsonb_array_elements(p_assignments) a;
  select jsonb_agg(jsonb_build_object('lotId',r.lot_id::text,'quantity',r.quantity) order by r.lot_id::text)
    into previous from public.inventory_reservations r where r.order_id=p_order_id and r.state='COMMITTED';
  if o.lots_confirmed_at is not null and desired=previous
    and p_expected_version in (o.lot_assignment_version,o.lot_assignment_version-1) then return o; end if;
  if p_expected_version is null or p_expected_version<>o.lot_assignment_version then raise exception 'lot_assignment_status_conflict'; end if;
  if o.payment_status<>'PAID' or o.fulfillment_status<>'READY_TO_PICK'
    or o.inventory_accounting_mode<>'TRACKED' or o.backorder_pending or o.lots_locked_at is not null
    or exists(select 1 from public.order_events where order_id=p_order_id and event_type='FULFILLMENT_PACKET_PRINTED')
    or exists(select 1 from public.order_shipments where order_id=p_order_id
      and (status not in ('DRAFT','ERROR') or label_url is not null or provider_transaction_id is not null))
  then raise exception 'lot_assignment_locked'; end if;
  perform 1 from public.inventory_reservations where order_id=p_order_id order by lot_id for update;
  if previous is null or exists(select 1 from public.inventory_reservations where order_id=p_order_id and state<>'COMMITTED')
  then raise exception 'inventory_reservation_mismatch'; end if;
  -- Lock every source and destination lot in UUID order before checking capacity.
  perform 1 from public.inventory_lots l where l.id in (
    select (a->>'lotId')::uuid from jsonb_array_elements(p_assignments) a
    union select lot_id from public.inventory_reservations where order_id=p_order_id
  ) order by l.id for update;
  if exists (select 1 from jsonb_array_elements(p_assignments) a
    left join public.inventory_lots l on l.id=(a->>'lotId')::uuid
    where l.id is null or l.is_provisional or trim(l.lot_number)=''
      or (l.expires_on is not null and l.expires_on < (now() at time zone 'America/Phoenix')::date))
  then raise exception 'invalid_assignment_lot'; end if;
  -- Require the exact ordered quantity for every product, including single-lot items.
  if exists (
    select 1 from (select item->>'id' product_id,sum((item->>'qty')::integer) quantity
      from jsonb_array_elements(o.items) entry(item) group by item->>'id') expected
    full join (select l.product_id,sum((a->>'quantity')::integer) quantity
      from jsonb_array_elements(p_assignments) a join public.inventory_lots l on l.id=(a->>'lotId')::uuid
      group by l.product_id) assigned using(product_id)
    where expected.quantity is distinct from assigned.quantity
  ) then raise exception 'lot_assignment_quantity_mismatch'; end if;
  -- Also verify the original commitment agrees with the order before transferring it.
  if exists (
    select 1 from (select item->>'id' product_id,sum((item->>'qty')::integer) quantity
      from jsonb_array_elements(o.items) entry(item) group by item->>'id') expected
    full join (select product_id,sum(quantity) quantity from public.inventory_reservations
      where order_id=p_order_id group by product_id) allocated using(product_id)
    where expected.quantity is distinct from allocated.quantity
  ) then raise exception 'inventory_reservation_mismatch'; end if;
  if exists(select 1 from public.inventory_reservations r
    join public.inventory_lots l on l.id=r.lot_id
    where r.order_id=p_order_id and (r.product_id<>l.product_id
      or coalesce((select sum(m.on_hand_delta) from public.inventory_movements m
        where m.order_id=p_order_id and m.lot_id=r.lot_id),0)<>-r.quantity))
  then raise exception 'inventory_reservation_mismatch'; end if;
  key_prefix := 'lot-assignment:' || p_order_id::text || ':' || (o.lot_assignment_version+1)::text || ':';
  for change in
    select l.id,l.product_id,l.on_hand,l.reserved,coalesce(r.quantity,0) old_qty,
      coalesce((a->>'quantity')::integer,0) new_qty
    from public.inventory_lots l
    left join public.inventory_reservations r on r.lot_id=l.id and r.order_id=p_order_id
    left join jsonb_array_elements(p_assignments) a on (a->>'lotId')::uuid=l.id
    where r.id is not null or a is not null order by l.id
  loop
    if change.on_hand-change.reserved+change.old_qty<change.new_qty then raise exception 'lot_assignment_insufficient_stock'; end if;
    if change.old_qty<>change.new_qty then
      update public.inventory_lots set on_hand=on_hand+change.old_qty-change.new_qty,updated_at=now() where id=change.id;
      insert into public.inventory_movements(product_id,lot_id,order_id,movement_type,on_hand_delta,reserved_delta,reason,actor_user_id,idempotency_key)
      values(change.product_id,change.id,p_order_id,
        case when change.old_qty>change.new_qty then 'RETURN' else 'SALE' end,
        change.old_qty-change.new_qty,0,'Staff assigned shipment lots',p_actor_user_id,key_prefix||change.id::text);
    end if;
  end loop;
  delete from public.inventory_reservations where order_id=p_order_id;
  insert into public.inventory_reservations(order_id,product_id,lot_id,quantity,state,committed_at)
  select p_order_id,l.product_id,l.id,(a->>'quantity')::integer,'COMMITTED',now()
  from jsonb_array_elements(p_assignments) a join public.inventory_lots l on l.id=(a->>'lotId')::uuid;
  update public.orders set lots_confirmed_at=now(),lot_assignment_version=lot_assignment_version+1,updated_at=now()
  where id=p_order_id returning * into o;
  insert into public.order_events(order_id,event_type,actor_user_id,details)
  values(p_order_id,'SHIPMENT_LOTS_ASSIGNED',p_actor_user_id,
    jsonb_build_object('before',previous,'after',desired,'version',o.lot_assignment_version));
  return o;
end;
$$;

-- Called BEFORE reading allocations for a document or beginning picking. The
-- order lock serializes assignment vs document generation, so a concurrent edit
-- cannot change lots after a PDF snapshot has been taken. Failed printer jobs
-- can be retried with the same stable assignment.
create function public.prepare_order_lots_for_fulfillment(p_order_id uuid)
returns public.orders language plpgsql security invoker set search_path='' as $$
declare o public.orders;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'order_not_found'; end if;
  if o.payment_status<>'PAID' or o.backorder_pending then raise exception 'payment_not_confirmed'; end if;
  if public.order_needs_lot_assignment(p_order_id) then raise exception 'manual_lot_assignment_required'; end if;
  if o.inventory_accounting_mode='TRACKED' and o.lots_locked_at is null then
    update public.orders set lots_locked_at=now(),updated_at=now() where id=p_order_id returning * into o;
  end if;
  return o;
end;
$$;

alter function public.advance_order_fulfillment(uuid,text,text,uuid) rename to advance_order_fulfillment_before_lot_assignment;
create function public.advance_order_fulfillment(p_order_id uuid,p_expected_fulfillment_status text,p_target_fulfillment_status text,p_actor_user_id uuid)
returns public.orders language plpgsql security invoker set search_path='' as $$
begin
  perform public.advance_order_fulfillment_before_lot_assignment(p_order_id,p_expected_fulfillment_status,p_target_fulfillment_status,p_actor_user_id);
  return public.prepare_order_lots_for_fulfillment(p_order_id);
end;
$$;

revoke all on function public.order_lot_choices(uuid), public.order_needs_lot_assignment(uuid),
  public.get_order_lot_choices(uuid[]), public.assign_order_lots(uuid,integer,jsonb,uuid),
  public.prepare_order_lots_for_fulfillment(uuid),public.advance_order_fulfillment(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.order_lot_choices(uuid), public.order_needs_lot_assignment(uuid),
  public.get_order_lot_choices(uuid[]), public.assign_order_lots(uuid,integer,jsonb,uuid),
  public.prepare_order_lots_for_fulfillment(uuid),public.advance_order_fulfillment(uuid,text,text,uuid) to service_role;
commit;
