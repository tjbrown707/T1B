begin;
set local role service_role;
do $$
declare
  first_lot public.inventory_lots;
  next_lot public.inventory_lots;
  previous_count bigint;
begin
  select count(*) into previous_count from public.inventory_lots;
  perform setseed(0.42);
  first_lot := public.receive_inventory_lot('klow',null,null,7,null,null,null);
  assert first_lot.lot_number ~ '^T1B-[2-9][2-9A-HJ-NP-Z]{3}$', 'incorrect format';
  assert first_lot.expires_on=(first_lot.received_at + interval '2 years')::date, 'expiration default wrong';
  assert first_lot.received_at=(now() at time zone 'America/Phoenix')::date, 'creation date wrong';
  assert first_lot.storage_location='Tier One BioSystems HQ', 'storage default wrong';
  assert first_lot.on_hand=7 and first_lot.reserved=0, 'incorrect inventory';
  -- Reset the random stream to force a collision on a different product.
  perform setseed(0.42);
  next_lot := public.receive_inventory_lot('glp3rt-5',' ',null,9,null,null,null);
  assert next_lot.lot_number <> first_lot.lot_number, 'collision not retried';
  assert (select count(*)=previous_count+2 from public.inventory_lots), 'extra lots';
  assert (select count(*)=1 from public.inventory_movements where lot_id=next_lot.id and movement_type='RECEIPT' and on_hand_delta=9), 'receipt audit missing/duplicated';
  begin
    perform public.receive_inventory_lot('glp3rt-10',lower(first_lot.lot_number),null,1,null,null,null);
    raise exception 'manual duplicate accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.update_inventory_lot_metadata(next_lot.id,next_lot.updated_at,first_lot.lot_number,null,null,null,10,null);
    raise exception 'duplicate edit accepted';
  exception when unique_violation then null;
  end;
  assert (select lot_number=next_lot.lot_number and on_hand=9 from public.inventory_lots where id=next_lot.id), 'failed edit mutated lot';
  next_lot := public.receive_inventory_lot('klow','MANUAL-TEST-LOT','SUPPLIER-1',3,null,'Bin A',null);
  assert next_lot.lot_number='MANUAL-TEST-LOT' and next_lot.supplier_batch_id='SUPPLIER-1', 'manual details lost';
  assert not has_function_privilege('anon','public.receive_inventory_lot(text,text,text,integer,date,text,uuid)','EXECUTE'), 'anon access';
  assert not has_function_privilege('authenticated','public.receive_inventory_lot(text,text,text,integer,date,text,uuid)','EXECUTE'), 'customer access';
end $$;
rollback;
