begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  actor uuid := '11111111-1111-4111-8111-111111111111';
  snapshot jsonb;
  payload jsonb;
  placed public.orders;
  replay public.orders;
  balance jsonb;
  reserved_before bigint;
begin
  assert not has_function_privilege('anon','public.create_order_transaction(jsonb,text)','EXECUTE'),'anonymous dealer code access';
  assert not has_function_privilege('authenticated','public.create_order_transaction(jsonb,text)','EXECUTE'),'customer direct dealer code access';
  perform public.save_dealer_account(actor,'David',60,true,actor);
  insert into public.discount_codes(code,user_id,type,value,source,expires_at)
    values('DEALER-WELCOME',actor,'percent',10,'dealer-test',now()+interval '1 day');
  snapshot := jsonb_build_object('dealerId',actor,'dealerName','David','percentOff',60,'customerReference','Code test','delivery','LOCAL_HANDOFF',
    'retailItems','[{"id":"bpc157-10","name":"BPC-157","dose":"10 mg","qty":1,"unitPrice":100,"lineTotal":100}]'::jsonb,
    'dealerItems','[{"id":"bpc157-10","name":"BPC-157","dose":"10 mg","qty":1,"unitPrice":40,"lineTotal":40}]'::jsonb,
    'retailSubtotal',100,'dealerSubtotal',40,'shipping',0,'customerTotal',90,'dealerTotal',36,'retained',54,
    'customerDiscountAmount',10,'dealerDiscountAmount',4,'customerSubtotalAfterDiscount',90,'dealerSubtotalAfterDiscount',36,
    'discountCodes','["DEALER-WELCOME"]'::jsonb,'discount','{"type":"percent","value":10,"source":"personal"}'::jsonb,'personalDiscountCode','DEALER-WELCOME');
  payload := jsonb_build_object('order_number','T1B-261007-900001','allow_backorder',true,'user_id',actor,
    'items',snapshot->'dealerItems','dealer_sale',snapshot,'items_text','Dealer code test',
    'subtotal',40,'total',36,'shipping',0,'discount_code','DEALER-WELCOME','discount_amount',4,'payment_method','Zelle',
    'customer_name','David','customer_email','dealer@example.com','customer_phone','5555555555',
    'ship_address','Local pickup','ship_city','Local pickup','ship_state','AZ','ship_zip','N/A');
  select sum(reserved) into reserved_before from public.inventory_lots;
  placed := public.create_order_transaction(payload,'DEALER-WELCOME');
  assert placed.total=36 and placed.discount_amount=4 and placed.dealer_sale=snapshot,'discounted split not saved';
  assert (select redeemed_at is not null and order_number=placed.order_number from public.discount_codes where code='DEALER-WELCOME'),'personal code not redeemed';
  assert (select sum(reserved)=reserved_before+1 from public.inventory_lots),'discounted order inventory not reserved';
  balance := public.dealer_account_summary(actor);
  assert (balance->>'customerSales')::numeric=90 and (balance->>'owed')::numeric=36,'discounted dashboard totals wrong';
  perform public.save_dealer_account(actor,'David',30,false,actor);
  update public.discount_codes set value=80,expires_at=now()-interval '1 day' where code='DEALER-WELCOME';
  replay := public.create_order_transaction(payload,'DEALER-WELCOME');
  assert replay.id=placed.id and replay.dealer_sale=snapshot,'retry changed discounted economics';
  assert (select sum(reserved)=reserved_before+1 from public.inventory_lots),'discounted retry reserved twice';
  assert (select count(*)=1 from public.order_events where order_id=placed.id and event_type='DEALER_ORDER_PLACED'),'discounted retry audited twice';
  perform public.save_dealer_account(actor,'David',60,true,actor);
  begin
    perform public.create_order_transaction(payload || '{"order_number":"T1B-261007-900002"}'::jsonb,'DEALER-WELCOME');
    raise exception 'TEST: personal code reused';
  exception when raise_exception then if sqlerrm <> 'discount_code_not_redeemable' then raise; end if; end;
  assert not exists(select 1 from public.orders where order_number='T1B-261007-900002'),'failed redemption left an order';
  assert (select sum(reserved)=reserved_before+1 from public.inventory_lots),'failed redemption left a reservation';
  begin
    perform public.create_order_transaction(payload || jsonb_build_object('order_number','T1B-261007-900002','dealer_sale',snapshot || '{"discountCodes":["OTHER"]}'::jsonb),'DEALER-WELCOME');
    raise exception 'TEST: code snapshot mismatch allowed';
  exception when raise_exception then if sqlerrm <> 'invalid_dealer_order' then raise; end if; end;
  begin
    perform public.create_order_transaction(payload || jsonb_build_object('order_number','T1B-261007-900002','dealer_sale',snapshot || '{"retained":53}'::jsonb),'DEALER-WELCOME');
    raise exception 'TEST: wrong retained share allowed';
  exception when raise_exception then if sqlerrm <> 'invalid_dealer_order' then raise; end if; end;
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',36,actor);
  balance := public.dealer_account_summary(actor);
  assert (balance->>'paid')::numeric=36 and (balance->>'owed')::numeric=0 and (balance->>'retained')::numeric=54,'paid discounted dashboard totals wrong';

  -- Fixed discounts and a shipping code also preserve the 60/40 split.
  snapshot := snapshot || '{"customerDiscountAmount":25,"dealerDiscountAmount":10,"customerSubtotalAfterDiscount":75,"dealerSubtotalAfterDiscount":30,"customerTotal":75,"dealerTotal":30,"retained":45,"delivery":"SHIP_TO_CUSTOMER","discountCodes":["FIX25","SHIP4FREE"],"discount":{"type":"fixed","value":25,"source":"sitewide"},"personalDiscountCode":null}'::jsonb;
  payload := payload || jsonb_build_object('order_number','T1B-261007-900003','dealer_sale',snapshot,'discount_code','FIX25, SHIP4FREE','discount_amount',10,'total',30);
  placed := public.create_order_transaction(payload,null);
  assert placed.fulfillment_method='SHIP' and placed.total=30,'fixed/free shipping order wrong';
  placed := public.cancel_unpaid_order(placed.id,'AWAITING_PAYMENT',actor);
  balance := public.dealer_account_summary(actor);
  assert (balance->>'orders')::integer=1,'cancelled discounted order counted';
  placed := public.reopen_cancelled_order(placed.id,'CANCELLED',actor);
  assert placed.dealer_sale=snapshot,'reopen changed discounted snapshot';
  balance := public.dealer_account_summary(actor);
  assert (balance->>'customerSales')::numeric=165 and (balance->>'owed')::numeric=30,'reopened discounted order missing from dashboard';
  begin
    update public.orders set dealer_sale=dealer_sale || '{"customerTotal":100}'::jsonb where id=placed.id;
    raise exception 'TEST: discounted snapshot mutable';
  exception when raise_exception then if sqlerrm <> 'dealer_sale_is_immutable' then raise; end if; end;
end;
$$;
rollback;
