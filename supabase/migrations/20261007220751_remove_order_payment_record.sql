-- Server-only correction of an erroneous payment record, before picking.
-- This records a reversal, not a financial refund. Already printed lot choices
-- stay locked; existing emails and documents remain immutable history.
create function public.remove_order_payment_record(
  p_order_id uuid, p_expected_amount numeric, p_reason text,
  p_actor_user_id uuid default null
) returns public.orders language plpgsql security invoker set search_path = '' as $$
declare
  original public.orders;
  saved public.orders;
  allocation record;
  reversal_cycle integer;
  allocations_before jsonb;
begin
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'payment_removal_reason_required';
  end if;
  select * into original from public.orders where id=p_order_id for update;
  if original.id is null then raise exception 'order_not_found'; end if;
  if original.payment_status <> 'PAID' or original.status <> 'PAID'
     or original.fulfillment_status not in ('READY_TO_PICK','ON_HOLD')
     or p_expected_amount is null
     or original.payment_amount_received is distinct from p_expected_amount then
    raise exception 'payment_removal_state_conflict';
  end if;
  if exists (select 1 from public.order_shipments where order_id=p_order_id
      and status in ('PURCHASING','LABEL_PURCHASED','IN_TRANSIT','DELIVERED')) then
    raise exception 'payment_removal_shipment_locked';
  end if;
  if exists (select 1 from public.order_notification_outbox where order_id=p_order_id
      and status not in ('SENT','NEEDS_REVIEW'))
     or exists (select 1 from public.staff_payment_email_outbox where order_id=p_order_id
      and status not in ('SENT','NEEDS_REVIEW')) then
    raise exception 'payment_removal_email_in_flight';
  end if;
  select count(*)+1 into reversal_cycle from public.order_events
    where order_id=p_order_id and event_type='PAYMENT_RECORD_REMOVED';
  perform r.id from public.inventory_reservations r where r.order_id=p_order_id
    order by r.lot_id,r.id for update;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)
    into allocations_before from public.inventory_reservations r where r.order_id=p_order_id;

  if original.inventory_accounting_mode='TRACKED' and not original.backorder_pending then
    if not exists (select 1 from public.inventory_reservations where order_id=p_order_id)
       or exists (select 1 from public.inventory_reservations where order_id=p_order_id
         and (state<>'COMMITTED' or committed_at is null or released_at is not null))
       or exists (
         select 1 from (
           select item->>'id' product_id,sum((item->>'qty')::integer) quantity
           from jsonb_array_elements(original.items) item group by item->>'id'
         ) expected full join (
           select product_id,sum(quantity) quantity from public.inventory_reservations
           where order_id=p_order_id group by product_id
         ) allocated using(product_id)
         where coalesce(expected.quantity,0)<>coalesce(allocated.quantity,0)
       ) then raise exception 'inventory_reservation_mismatch'; end if;

    perform l.id from public.inventory_lots l join public.inventory_reservations r on r.lot_id=l.id
      where r.order_id=p_order_id order by l.id for update of l;
    for allocation in select r.*,l.on_hand,l.reserved,l.product_id lot_product
      from public.inventory_reservations r join public.inventory_lots l on l.id=r.lot_id
      where r.order_id=p_order_id order by r.lot_id
    loop
      if allocation.product_id<>allocation.lot_product
         or allocation.reserved<>coalesce((select sum(quantity) from public.inventory_reservations
           where lot_id=allocation.lot_id and state='RESERVED'),0)
         or coalesce((select sum(on_hand_delta) from public.inventory_movements
           where order_id=p_order_id and lot_id=allocation.lot_id),0)<>-allocation.quantity
         or coalesce((select sum(reserved_delta) from public.inventory_movements
           where order_id=p_order_id and lot_id=allocation.lot_id),0)<>0 then
        raise exception 'inventory_counter_mismatch';
      end if;
      update public.inventory_lots set on_hand=on_hand+allocation.quantity,
        reserved=reserved+allocation.quantity,updated_at=now() where id=allocation.lot_id;
      update public.inventory_reservations set state='RESERVED',committed_at=null,released_at=null
        where id=allocation.id;
      insert into public.inventory_movements(product_id,lot_id,order_id,movement_type,
        on_hand_delta,reserved_delta,reason,actor_user_id,idempotency_key) values
        (allocation.product_id,allocation.lot_id,p_order_id,'RETURN',allocation.quantity,0,
         p_reason,p_actor_user_id,'payment-removal:'||p_order_id||':'||reversal_cycle||':'||allocation.lot_id||':return'),
        (allocation.product_id,allocation.lot_id,p_order_id,'RESERVATION',0,allocation.quantity,
         'Payment record removed; same shipment stock held pending payment',p_actor_user_id,
         'payment-removal:'||p_order_id||':'||reversal_cycle||':'||allocation.lot_id||':reserve');
    end loop;
  elsif exists (select 1 from public.inventory_reservations where order_id=p_order_id) then
    raise exception 'payment_removal_unexpected_allocations';
  end if;

  update public.orders set status='AWAITING PAYMENT',payment_status='AWAITING_PAYMENT',
    payment_amount_received=null,payment_received_via=null,payment_confirmed_at=null,
    fulfillment_status='ON_HOLD',reservation_expires_at=now()+interval '24 hours',updated_at=now()
    where id=p_order_id returning * into saved;
  insert into public.order_events(order_id,event_type,actor_user_id,details)
    values(p_order_id,'PAYMENT_RECORD_REMOVED',p_actor_user_id,jsonb_build_object(
      'reason',p_reason,'reversal_cycle',reversal_cycle,'previous_amount',original.payment_amount_received,
      'before',to_jsonb(original),'after',to_jsonb(saved),'allocations_before',allocations_before,
      'inventory_re_reserved',original.inventory_accounting_mode='TRACKED' and not original.backorder_pending));
  return saved;
end;
$$;
revoke all on function public.remove_order_payment_record(uuid,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.remove_order_payment_record(uuid,numeric,text,uuid) to service_role;

-- Retain the first sale's existing immutable key. A later payment after an
-- audited reversal gets a distinct key; paid retries still return before any
-- inventory write. Refuse prior sales without a fully reconciled reversal.
do $migration$
declare definition text; replacement text;
begin
  definition:=pg_get_functiondef('public.confirm_order_payment(uuid,text,text,text,numeric,uuid)'::regprocedure);
  replacement:=replace(definition,
    '    for reservation_row in',
    $guard$    if exists (select 1 from public.inventory_movements where order_id=p_order_id and movement_type='SALE')
       and (not exists (select 1 from public.order_events where order_id=p_order_id and event_type='PAYMENT_RECORD_REMOVED')
         or exists (select 1 from public.inventory_reservations r where r.order_id=p_order_id
           and (coalesce((select sum(on_hand_delta) from public.inventory_movements
                 where order_id=p_order_id and lot_id=r.lot_id),0)<>0
             or coalesce((select sum(reserved_delta) from public.inventory_movements
                 where order_id=p_order_id and lot_id=r.lot_id),0)<>r.quantity))) then
      raise exception 'inventory_payment_reversal_mismatch';
    end if;

    for reservation_row in$guard$);
  if replacement=definition then raise exception 'confirm_payment_guard_patch_failed'; end if;
  definition:=replacement;
  replacement:=replace(definition,
    '''sale:'' || p_order_id::text || '':'' || reservation_row.lot_id::text',
    $key$'sale:' || p_order_id::text || ':' || reservation_row.lot_id::text
          || case when exists (select 1 from public.order_events where order_id=p_order_id and event_type='PAYMENT_RECORD_REMOVED')
            then ':payment-removal:' || (select count(*)::text from public.order_events
              where order_id=p_order_id and event_type='PAYMENT_RECORD_REMOVED') else '' end$key$);
  if replacement=definition then raise exception 'confirm_payment_key_patch_failed'; end if;
  execute replacement;

  definition:=pg_get_functiondef('public.reopen_allocated_cancelled_order(uuid,text,uuid)'::regprocedure);
  replacement:=replace(definition,
    '        and m.movement_type = ''SALE''',
    $reopen$        and m.movement_type = 'SALE'
        and not (exists (select 1 from public.order_events where order_id=p_order_id and event_type='PAYMENT_RECORD_REMOVED')
          and coalesce((select sum(on_hand_delta) from public.inventory_movements
            where order_id=p_order_id and lot_id=m.lot_id),0)=0)$reopen$);
  if replacement=definition then raise exception 'reopen_reversal_patch_failed'; end if;
  execute replacement;
end;
$migration$;
