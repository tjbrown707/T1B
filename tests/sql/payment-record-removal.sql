-- Isolated PostgreSQL only. Exercise reversal, cancel/reopen, and reconfirmation.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  actor uuid := '11111111-1111-4111-8111-111111111111';
  placed public.orders;
  replay public.orders;
  payload jsonb;
  hand_before bigint;
  reserved_before bigint;
  lock_before timestamptz := now()-interval '3 days';
begin
  assert not has_function_privilege('authenticated','public.remove_order_payment_record(uuid,numeric,text,uuid)','EXECUTE'),'customer can reverse payment';
  assert not has_function_privilege('anon','public.remove_order_payment_record(uuid,numeric,text,uuid)','EXECUTE'),'anonymous can reverse payment';
  select sum(on_hand),sum(reserved) into hand_before,reserved_before from public.inventory_lots;
  payload := jsonb_build_object('order_number','T1B-261007-990101','allow_backorder',false,'user_id',actor,
    'items','[{"id":"klow","name":"KLOW","dose":"80 mg","qty":2,"unitPrice":165,"lineTotal":330}]'::jsonb,
    'items_text','KLOW 80 mg x2','subtotal',330,'total',247.50,'shipping',0,'discount_amount',82.50,
    'payment_method','Zelle','customer_name','Local Test','customer_email','local@example.com',
    'customer_phone','5555555555','ship_address','Local pickup','ship_city','Phoenix','ship_state','AZ','ship_zip','85001');
  placed := public.create_order_transaction(payload,null);
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',100,actor);
  update public.orders set lots_locked_at=lock_before,lots_confirmed_at=lock_before where id=placed.id;
  begin
    perform public.remove_order_payment_record(placed.id,100,'Test',actor);
    raise exception 'TEST: queued payment notice should block reversal';
  exception when raise_exception then
    if sqlerrm <> 'payment_removal_email_in_flight' then raise; end if;
  end;
  update public.staff_payment_email_outbox set status='NEEDS_REVIEW' where order_id=placed.id;
  begin
    perform public.remove_order_payment_record(placed.id,99,'Test',actor);
    raise exception 'TEST: stale amount should fail';
  exception when raise_exception then
    if sqlerrm <> 'payment_removal_state_conflict' then raise; end if;
  end;
  placed := public.remove_order_payment_record(placed.id,100,'Owner removed erroneous payment',actor);
  assert placed.payment_status='AWAITING_PAYMENT' and placed.fulfillment_status='ON_HOLD','payment not reset';
  assert placed.payment_amount_received is null and placed.payment_received_via is null and placed.payment_confirmed_at is null,'payment fields retained';
  assert placed.reservation_expires_at=now()+interval '24 hours','fresh hold missing';
  assert placed.lots_locked_at=lock_before,'prior printed lots were unlocked';
  assert (select sum(on_hand)=hand_before and sum(reserved)=reserved_before+2 from public.inventory_lots),'stock not returned and reserved';
  assert (select sum(on_hand_delta)=0 and sum(reserved_delta)=2 from public.inventory_movements where order_id=placed.id),'ledger not reconciled';
  assert (select count(*)=1 from public.inventory_movements where order_id=placed.id and movement_type='SALE'),'original sale history removed';
  assert (select details->>'previous_amount'='100.00' from public.order_events where order_id=placed.id and event_type='PAYMENT_RECORD_REMOVED'),'original payment not audited';
  perform public.save_dealer_account(actor,'David',60,true,actor);
  update public.orders set subtotal=99,total=99,discount_amount=0,
    items='[{"id":"klow","name":"KLOW","dose":"80 mg","qty":2,"unitPrice":49.50,"lineTotal":99}]',
    dealer_sale=jsonb_build_object('dealerId',actor,'dealerName','David','percentOff',60,
      'customerReference','Legacy order','delivery','LOCAL_HANDOFF','shipping',0,
      'retailItems','[{"id":"klow","qty":2,"unitPrice":123.75,"lineTotal":247.50}]'::jsonb,
      'dealerItems','[{"id":"klow","qty":2,"unitPrice":49.50,"lineTotal":99}]'::jsonb,
      'retailSubtotal',247.50,'dealerSubtotal',99,'customerTotal',247.50,'dealerTotal',99,'retained',148.50)
    where id=placed.id;
  placed := public.cancel_unpaid_order(placed.id,'AWAITING_PAYMENT',actor);
  assert (select sum(on_hand)=hand_before and sum(reserved)=reserved_before from public.inventory_lots),'cancellation leaked stock';
  placed := public.reopen_cancelled_order(placed.id,'CANCELLED',actor);
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',99,actor);
  replay := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',99,actor);
  assert replay.payment_amount_received=99,'reconfirmation failed';
  assert (select sum(on_hand)=hand_before-2 and sum(reserved)=reserved_before from public.inventory_lots),'reconfirmation double deducted';
  assert (select count(*)=2 from public.inventory_movements where order_id=placed.id and movement_type='SALE'),'second sale missing or duplicated';
  update public.staff_payment_email_outbox set status='NEEDS_REVIEW' where order_id=placed.id;
  placed := public.remove_order_payment_record(placed.id,99,'Second correction',actor);
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',99,actor);
  assert (select count(*)=3 from public.inventory_movements where order_id=placed.id and movement_type='SALE'),'second reversal broke keys';
  assert (select sum(on_hand_delta)=-2 and sum(reserved_delta)=0 from public.inventory_movements where order_id=placed.id),'final ledger not reconciled';
  assert (public.dealer_account_summary(actor)->>'owed')::numeric=0,'dealer balance wrong';
  update public.orders set fulfillment_status='DELIVERED',fulfillment_method='SHIP' where id=placed.id;
  begin
    perform public.remove_order_payment_record(placed.id,99,'Should fail',actor);
    raise exception 'TEST: delivered order reversal should fail';
  exception when raise_exception then
    if sqlerrm <> 'payment_removal_state_conflict' then raise; end if;
  end;
end;
$$;
rollback;
