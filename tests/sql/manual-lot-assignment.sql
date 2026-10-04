begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  o public.orders; single_order public.orders; backorder public.orders; replenished uuid; old_lot uuid; new_lot uuid; provisional_lot uuid;
  actor uuid := '11111111-1111-4111-8111-111111111111';
  choices jsonb; stock jsonb; events_before bigint; version_before integer;
begin
  select id into old_lot from public.inventory_lots where product_id='glp3rt-10';
  perform public.update_inventory_lot_metadata(old_lot,(select updated_at from public.inventory_lots where id=old_lot),'TEST-OLD',null,null,'Old shelf',10,actor);
  new_lot := (public.receive_inventory_lot('glp3rt-10','TEST-NEW',null,10,'2028-01-01','New shelf',actor)).id;
  o := public.create_order_transaction(jsonb_build_object('order_number','T1B-261004-900001',
    'items','[{"id":"glp3rt-10","qty":4}]'::jsonb,'items_text','GLP-3RT x4','subtotal',100,'total',100,'shipping',0,'discount_amount',0,
    'payment_method','zelle','customer_name','Local Test','customer_email','local@example.com',
    'customer_phone','5555555555','ship_address','Test address','ship_city','Phoenix','ship_state','AZ','ship_zip','85001'),null);
  assert public.order_needs_lot_assignment(o.id), 'multi-lot order must require a manual choice';
  assert (select lot_id=new_lot from public.inventory_reservations where order_id=o.id), 'dated new lot should reproduce original problem';
  -- Reservation cancellation/reopening stays on the original immutable ledger.
  o := public.cancel_unpaid_order(o.id,'AWAITING_PAYMENT',actor);
  o := public.reopen_cancelled_order(o.id,'CANCELLED',actor);
  o := public.confirm_order_payment(o.id,'AWAITING_PAYMENT','SHIP','Zelle',100,actor);
  choices := public.order_lot_choices(o.id);
  assert choices->0->>'quantity'='4';
  assert (select (l->>'capacity')::integer=10 from jsonb_array_elements(choices->0->'lots') l where l->>'id'=new_lot::text),'own committed stock omitted';
  select jsonb_agg(to_jsonb(l) order by id) into stock from public.inventory_lots l;
  begin
    perform public.prepare_order_lots_for_fulfillment(o.id);
    raise exception 'TEST: document allowed without lot choice';
  exception when raise_exception then if sqlerrm<>'manual_lot_assignment_required' then raise; end if; end;
  begin
    perform public.advance_order_fulfillment(o.id,'READY_TO_PICK','PICKED',actor);
    raise exception 'TEST: picking allowed without lot choice';
  exception when raise_exception then if sqlerrm<>'manual_lot_assignment_required' then raise; end if; end;
  assert (select fulfillment_status='READY_TO_PICK' and lots_locked_at is null from public.orders where id=o.id), 'blocked picking changed order';
  -- Wrong quantity, wrong product, provisional, expired, duplicate and shortage
  -- must leave both reservations and every counter untouched.
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',3)),actor);
    raise exception 'TEST: wrong quantity accepted';
  exception when raise_exception then if sqlerrm<>'lot_assignment_quantity_mismatch' then raise; end if; end;
  select id into provisional_lot from public.inventory_lots where product_id='bpc157-5';
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',provisional_lot,'quantity',4)),actor);
    raise exception 'TEST: provisional accepted';
  exception when raise_exception then if sqlerrm<>'invalid_assignment_lot' then raise; end if; end;
  perform public.update_inventory_lot_metadata(provisional_lot,(select updated_at from public.inventory_lots where id=provisional_lot),'TEST-OTHER',null,null,'Other shelf',10,actor);
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',provisional_lot,'quantity',4)),actor);
    raise exception 'TEST: wrong product accepted';
  exception when raise_exception then if sqlerrm<>'lot_assignment_quantity_mismatch' then raise; end if; end;
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',2),jsonb_build_object('lotId',old_lot,'quantity',2)),actor);
    raise exception 'TEST: duplicate accepted';
  exception when raise_exception then if sqlerrm<>'invalid_lot_assignment' then raise; end if; end;
  -- Other customers' held units cannot be consumed by this assignment.
  update public.inventory_lots set reserved=49 where id=old_lot;
  select jsonb_agg(to_jsonb(l) order by id) into stock from public.inventory_lots l;
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',4)),actor);
    raise exception 'TEST: other reservations overdrawn';
  exception when raise_exception then if sqlerrm<>'lot_assignment_insufficient_stock' then raise; end if; end;
  assert (select jsonb_agg(to_jsonb(l) order by id)=stock from public.inventory_lots l),'failed transfer leaked partial counters';
  assert (select reserved=49 and on_hand=50 from public.inventory_lots where id=old_lot);
  update public.inventory_lots set reserved=0 where id=old_lot;
  update public.inventory_lots set expires_on=(now() at time zone 'America/Phoenix')::date-1 where id=old_lot;
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',4)),actor);
    raise exception 'TEST: expired accepted';
  exception when raise_exception then if sqlerrm<>'invalid_assignment_lot' then raise; end if; end;
  update public.inventory_lots set expires_on=null where id=old_lot;
  o := public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',4)),actor);
  assert o.lot_assignment_version=1 and o.lots_confirmed_at is not null and not public.order_needs_lot_assignment(o.id);
  assert (select on_hand=46 and reserved=0 from public.inventory_lots where id=old_lot),'old lot not deducted';
  assert (select on_hand=10 and reserved=0 from public.inventory_lots where id=new_lot),'new lot stock not restored';
  assert (select lot_id=old_lot and quantity=4 and state='COMMITTED' from public.inventory_reservations where order_id=o.id);
  assert o.total=100 and o.payment_amount_received=100 and o.payment_status='PAID','money changed';
  select count(*) into events_before from public.order_events where order_id=o.id;
  perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',4)),actor);
  assert (select count(*)=events_before from public.order_events where order_id=o.id),'retry duplicated audit';
  assert (select on_hand=46 from public.inventory_lots where id=old_lot),'retry double deduction';
  begin
    perform public.assign_order_lots(o.id,0,jsonb_build_array(jsonb_build_object('lotId',new_lot,'quantity',4)),actor);
    raise exception 'TEST: stale overwrite accepted';
  exception when raise_exception then if sqlerrm<>'lot_assignment_status_conflict' then raise; end if; end;
  -- Splits and changing back to a previously used lot have balanced ledger nets.
  o := public.assign_order_lots(o.id,1,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',1),jsonb_build_object('lotId',new_lot,'quantity',3)),actor);
  assert (select count(*)=2 and sum(quantity)=4 from public.inventory_reservations where order_id=o.id);
  o := public.assign_order_lots(o.id,2,jsonb_build_array(jsonb_build_object('lotId',old_lot,'quantity',4)),actor);
  assert (select sum(on_hand_delta)=-4 from public.inventory_movements where order_id=o.id and lot_id=old_lot),'old lot ledger wrong';
  assert (select sum(on_hand_delta)=0 from public.inventory_movements where order_id=o.id and lot_id=new_lot),'new lot ledger wrong';
  -- Document preparation freezes the chosen lots before the snapshot is read.
  o := public.prepare_order_lots_for_fulfillment(o.id);
  assert o.lots_locked_at is not null;
  version_before := o.lot_assignment_version;
  select jsonb_agg(to_jsonb(l) order by id) into stock from public.inventory_lots l;
  begin
    perform public.assign_order_lots(o.id,version_before,jsonb_build_array(jsonb_build_object('lotId',new_lot,'quantity',4)),actor);
    raise exception 'TEST: printed document allocation changed';
  exception when raise_exception then if sqlerrm<>'lot_assignment_locked' then raise; end if; end;
  assert (select jsonb_agg(to_jsonb(l) order by id)=stock from public.inventory_lots l), 'locked edit changed counters';
  o := public.advance_order_fulfillment(o.id,'READY_TO_PICK','PICKED',actor);
  assert o.fulfillment_status='PICKED';
  -- A single-lot order still progresses without a manual confirmation.
  single_order := public.create_order_transaction(jsonb_build_object('order_number','T1B-261004-900002',
    'items','[{"id":"bpc157-5","qty":1}]'::jsonb,'items_text','BPC x1','subtotal',100,'total',100,'shipping',0,'discount_amount',0,
    'payment_method','zelle','customer_name','Local Test','customer_email','local@example.com',
    'customer_phone','5555555555','ship_address','Test address','ship_city','Phoenix','ship_state','AZ','ship_zip','85001'),null);
  assert not public.order_needs_lot_assignment(single_order.id);
  single_order := public.confirm_order_payment(single_order.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',100,actor);
  single_order := public.prepare_order_lots_for_fulfillment(single_order.id);
  assert single_order.lots_locked_at is not null;
  -- Paid backorders get the same mandatory choice after stock allocation.
  backorder := public.create_order_transaction(jsonb_build_object('order_number','T1B-261004-900003','allow_backorder',true,
    'items','[{"id":"glp3rt-10","qty":60},{"id":"bpc157-5","qty":1}]'::jsonb,'items_text','GLP x60; BPC x1','subtotal',100,'total',100,'shipping',0,'discount_amount',0,
    'payment_method','zelle','customer_name','Local Test','customer_email','local@example.com',
    'customer_phone','5555555555','ship_address','Test address','ship_city','Phoenix','ship_state','AZ','ship_zip','85001'),null);
  assert backorder.backorder_pending;
  backorder := public.confirm_order_payment(backorder.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',100,actor);
  replenished := (public.receive_inventory_lot('glp3rt-10','TEST-RESTOCK',null,10,'2028-01-01','Restock',actor)).id;
  backorder := public.allocate_backorder(backorder.id,actor);
  assert public.order_needs_lot_assignment(backorder.id),'allocated backorder skipped choice';
  begin
    perform public.prepare_order_lots_for_fulfillment(backorder.id);
    raise exception 'TEST: backorder document skipped choice';
  exception when raise_exception then if sqlerrm<>'manual_lot_assignment_required' then raise; end if; end;
  -- Assign an explicit split and the other product together.
  backorder := public.assign_order_lots(backorder.id,0,jsonb_build_array(
    jsonb_build_object('lotId',old_lot,'quantity',46),jsonb_build_object('lotId',new_lot,'quantity',10),
    jsonb_build_object('lotId',replenished,'quantity',4),jsonb_build_object('lotId',provisional_lot,'quantity',1)),actor);
  assert not public.order_needs_lot_assignment(backorder.id) and not backorder.backorder_pending;
  assert (select sum(quantity)=61 and count(*)=4 from public.inventory_reservations where order_id=backorder.id);
  assert not has_function_privilege('authenticated','public.assign_order_lots(uuid,integer,jsonb,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.get_order_lot_choices(uuid[])','EXECUTE');
end;
$$;
rollback;
