begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  actor uuid := '11111111-1111-4111-8111-111111111111';
  account public.dealer_accounts;
  placed public.orders;
  replay public.orders;
  payload jsonb;
  snapshot jsonb;
  balance jsonb;
  reserved_before bigint;
begin
  assert not has_table_privilege('authenticated','public.dealer_accounts','SELECT'),'dealer settings readable directly';
  assert not has_table_privilege('authenticated','public.dealer_accounts','UPDATE'),'dealer settings editable directly';
  assert not has_table_privilege('anon','public.dealer_account_events','SELECT'),'dealer audit leaked';
  assert not has_function_privilege('authenticated','public.save_dealer_account(uuid,text,numeric,boolean,uuid)','EXECUTE'),'customer can promote themselves';
  assert not has_function_privilege('authenticated','public.dealer_account_summary(uuid)','EXECUTE'),'customer can read other balances';
  assert not has_function_privilege('anon','public.create_order_transaction(jsonb,text)','EXECUTE'),'anonymous can create orders';
  account := public.save_dealer_account(actor,'David',60,true,actor);
  assert account.active and account.percent_off=60,'dealer not saved';
  assert (select count(*)=1 from public.dealer_account_events where user_id=actor),'settings audit missing';
  snapshot := jsonb_build_object('dealerId',actor,'dealerName','David','percentOff',60,'customerReference','Test customer','delivery','LOCAL_HANDOFF',
    'retailItems','[{"id":"bpc157-10","name":"BPC-157","dose":"10 mg","qty":1,"unitPrice":100,"lineTotal":100}]'::jsonb,
    'dealerItems','[{"id":"bpc157-10","name":"BPC-157","dose":"10 mg","qty":1,"unitPrice":40,"lineTotal":40}]'::jsonb,
    'retailSubtotal',100,'dealerSubtotal',40,'shipping',0,'customerTotal',100,'dealerTotal',40,'retained',60);
  payload := jsonb_build_object('order_number','T1B-261001-900001','allow_backorder',true,'user_id',actor,
    'items',snapshot->'dealerItems','dealer_sale',snapshot,'items_text','Dealer test',
    'subtotal',40,'total',40,'shipping',0,'discount_amount',0,'payment_method','Zelle',
    'customer_name','David','customer_email','dealer@example.com','customer_phone','5555555555',
    'ship_address','Local pickup','ship_city','Local pickup','ship_state','AZ','ship_zip','N/A');
  select sum(reserved) into reserved_before from public.inventory_lots;
  placed := public.create_order_transaction(payload,null);
  assert placed.dealer_sale=snapshot and placed.total=40,'dealer snapshot not saved atomically';
  assert placed.fulfillment_method='LOCAL_HANDOFF' and placed.payment_status='AWAITING_PAYMENT','pickup/payment states wrong';
  assert placed.reservation_expires_at is not null,'unpaid expiry missing';
  assert (select sum(reserved)=reserved_before+1 from public.inventory_lots),'inventory not reserved';
  balance := public.dealer_account_summary(actor);
  assert (balance->>'owed')::numeric=40 and (balance->>'retained')::numeric=0,'unpaid balance wrong';
  account := public.save_dealer_account(actor,'David',30,false,actor);
  replay := public.create_order_transaction(payload,null);
  assert replay.id=placed.id and replay.dealer_sale=snapshot,'retry repriced original order';
  assert (select count(*)=1 from public.order_events where order_id=placed.id and event_type='DEALER_ORDER_PLACED'),'replay duplicated dealer audit';
  assert (select sum(reserved)=reserved_before+1 from public.inventory_lots),'retry duplicated reservation';
  begin
    perform public.create_order_transaction(payload || '{"order_number":"T1B-261001-900002"}'::jsonb,null);
    raise exception 'TEST: disabled dealer order should fail';
  exception when raise_exception then if sqlerrm <> 'dealer_not_active' then raise; end if; end;
  account := public.save_dealer_account(actor,'David',30,true,actor);
  begin
    perform public.create_order_transaction(payload || '{"order_number":"T1B-261001-900002"}'::jsonb,null);
    raise exception 'TEST: stale rate should fail';
  exception when raise_exception then if sqlerrm <> 'dealer_rate_changed' then raise; end if; end;
  begin
    update public.orders set dealer_sale=dealer_sale || '{"dealerName":"Other"}'::jsonb where id=placed.id;
    raise exception 'TEST: dealer snapshot change should fail';
  exception when raise_exception then if sqlerrm <> 'dealer_sale_is_immutable' then raise; end if; end;
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',40,actor);
  assert placed.payment_status='PAID' and placed.fulfillment_method='LOCAL_HANDOFF','dealer payment failed';
  balance := public.dealer_account_summary(actor);
  assert (balance->>'paid')::numeric=40 and (balance->>'owed')::numeric=0 and (balance->>'retained')::numeric=60,'paid balance wrong';
  account := public.save_dealer_account(actor,'David',60,true,actor);
  snapshot := snapshot || '{"delivery":"SHIP_TO_CUSTOMER","shipping":10,"customerTotal":110,"dealerTotal":50}'::jsonb;
  payload := payload || jsonb_build_object('order_number','T1B-261001-900003','dealer_sale',snapshot,'shipping',10,'total',50);
  placed := public.create_order_transaction(payload,null);
  assert placed.fulfillment_method='SHIP' and placed.total=50,'direct shipping wrong';
  placed := public.cancel_unpaid_order(placed.id,'AWAITING_PAYMENT',actor);
  balance := public.dealer_account_summary(actor);
  assert (balance->>'orders')::integer=1 and (balance->>'owed')::numeric=0,'cancelled balance counted';
  placed := public.reopen_cancelled_order(placed.id,'CANCELLED',actor);
  assert placed.dealer_sale=snapshot,'reopen changed dealer pricing';
  balance := public.dealer_account_summary(actor);
  assert (balance->>'owed')::numeric=50,'reopen balance missing';
  snapshot := snapshot || '{"retailSubtotal":9900,"dealerSubtotal":3960,"shipping":0,"customerTotal":9900,"dealerTotal":3960,"retained":5940,"retailItems":[{"id":"bpc157-10","name":"BPC-157","dose":"10 mg","qty":99,"unitPrice":100,"lineTotal":9900}],"dealerItems":[{"id":"bpc157-10","name":"BPC-157","dose":"10 mg","qty":99,"unitPrice":40,"lineTotal":3960}]}'::jsonb;
  payload := payload || jsonb_build_object('order_number','T1B-261001-900004','items',snapshot->'dealerItems','dealer_sale',snapshot,'subtotal',3960,'total',3960,'shipping',0);
  placed := public.create_order_transaction(payload,null);
  assert placed.backorder_pending and placed.dealer_sale=snapshot,'backorder lost dealer accounting';
  assert (select count(*)=4 from public.dealer_account_events where user_id=actor),'rate audits wrong';
end;
$$;
rollback;
