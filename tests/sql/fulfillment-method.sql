begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  o public.orders;
  shipped public.orders;
  actor uuid := '11111111-1111-4111-8111-111111111111';
  stock_before jsonb;
  delivery_id uuid;
  print_result record;
begin
  o := public.create_order_transaction(jsonb_build_object(
    'order_number','T1B-260928-900001','items','[{"id":"bpc157-5","qty":1}]'::jsonb,
    'items_text','BPC-157 x1','subtotal',100,'total',100,'shipping',0,'discount_amount',0,
    'payment_method','zelle','customer_name','Local Test','customer_email','local@example.com',
    'customer_phone','5555555555','ship_address','Test address','ship_city','Phoenix','ship_state','AZ','ship_zip','85001'),null);
  select jsonb_agg(to_jsonb(l) order by id) into stock_before from public.inventory_lots l;
  o := public.update_order_fulfillment_method(o.id,'SHIP','LOCAL_HANDOFF','AWAITING_PAYMENT','ON_HOLD',actor);
  assert o.fulfillment_method='LOCAL_HANDOFF' and o.total=100 and o.fulfillment_status='ON_HOLD';
  assert (select jsonb_agg(to_jsonb(l) order by id)=stock_before from public.inventory_lots l), 'switch changed reservations';
  o := public.confirm_order_payment(o.id,'AWAITING_PAYMENT','LOCAL_HANDOFF','Zelle',100,actor);
  select jsonb_agg(to_jsonb(l) order by id) into stock_before from public.inventory_lots l;
  select * into print_result from public.record_order_print_submission(o.id,'FULFILLMENT_PACKET_PRINTED',actor,900001,false);
  delivery_id := print_result.delivery_id;
  assert delivery_id is not null;
  o := public.update_order_fulfillment_method(o.id,'LOCAL_HANDOFF','SHIP','PAID','READY_TO_PICK',actor);
  assert (select status='NEEDS_REVIEW' from public.order_notification_outbox where id=delivery_id), 'obsolete email not paused';
  assert not exists(select 1 from public.claim_order_processed_email(delivery_id)), 'obsolete email claimed';
  o := public.advance_order_fulfillment(o.id,'READY_TO_PICK','PICKED',actor);
  o := public.advance_order_fulfillment(o.id,'PICKED','PACKED',actor);
  o := public.update_order_fulfillment_method(o.id,'SHIP','LOCAL_HANDOFF','PAID','PACKED',actor);
  assert o.fulfillment_status='READY_TO_PICK', 'packed order not normalized';
  select * into print_result from public.record_order_print_submission(o.id,'FULFILLMENT_PACKET_PRINTED',actor,900002,false);
  assert print_result.delivery_id=delivery_id and print_result.delivery_status='PENDING', 'paused email not reused';
  perform public.claim_order_processed_email(delivery_id);
  begin
    perform public.update_order_fulfillment_method(o.id,'LOCAL_HANDOFF','SHIP','PAID','READY_TO_PICK',actor);
    raise exception 'TEST: in-flight email allowed switch';
  exception when raise_exception then
    if sqlerrm <> 'fulfillment_method_email_sending' then raise; end if;
  end;
  update public.order_notification_outbox set status='SENT' where id=delivery_id;
  o := public.update_order_fulfillment_method(o.id,'LOCAL_HANDOFF','SHIP','PAID','READY_TO_PICK',actor);
  begin
    perform public.update_order_fulfillment_method(o.id,'LOCAL_HANDOFF','SHIP','PAID','READY_TO_PICK',actor);
    raise exception 'TEST: stale method allowed';
  exception when raise_exception then
    if sqlerrm <> 'order_fulfillment_status_conflict' then raise; end if;
  end;
  o := public.update_order_fulfillment_method(o.id,'SHIP','LOCAL_HANDOFF','PAID','READY_TO_PICK',actor);
  select * into print_result from public.record_order_print_submission(o.id,'FULFILLMENT_PACKET_PRINTED',actor,900003,false);
  assert print_result.delivery_id=delivery_id and print_result.delivery_status='SENT', 'sent email repeated';
  assert (select jsonb_agg(to_jsonb(l) order by id)=stock_before from public.inventory_lots l), 'switch changed paid inventory';
  assert o.total=100 and o.payment_amount_received=100, 'switch changed money';
  o := public.advance_order_fulfillment(o.id,'READY_TO_PICK','DELIVERED',actor);
  begin
    perform public.update_order_fulfillment_method(o.id,'LOCAL_HANDOFF','SHIP','PAID','DELIVERED',actor);
    raise exception 'TEST: delivered order allowed switch';
  exception when raise_exception then
    if sqlerrm <> 'fulfillment_method_order_locked' then raise; end if;
  end;
  assert (select count(*)=5 from public.order_events where order_id=o.id and event_type='FULFILLMENT_METHOD_CHANGED'), 'incorrect audit count';
  -- A second order exercises draft quotes, purchase locks, and both email types.
  insert into public.orders(order_number,status,payment_status,fulfillment_status,fulfillment_method,
    customer_name,customer_email,subtotal,total,payment_amount_received,items,items_text)
  values ('T1B-260928-900002','PAID','PAID','READY_TO_PICK','LOCAL_HANDOFF',
    'Local Test','local@example.com',100,100,100,'[]','Test') returning * into shipped;
  perform public.record_order_print_submission(shipped.id,'FULFILLMENT_PACKET_PRINTED',actor,900010,false);
  update public.order_notification_outbox set status='SENT' where order_id=shipped.id;
  shipped := public.update_order_fulfillment_method(shipped.id,'LOCAL_HANDOFF','SHIP','PAID','READY_TO_PICK',actor);
  shipped := public.advance_order_fulfillment(shipped.id,'READY_TO_PICK','PICKED',actor);
  shipped := public.advance_order_fulfillment(shipped.id,'PICKED','PACKED',actor);
  insert into public.order_shipments(order_id,status) values (shipped.id,'DRAFT');
  shipped := public.update_order_fulfillment_method(shipped.id,'SHIP','LOCAL_HANDOFF','PAID','PACKED',actor);
  begin
    update public.order_shipments set status='PURCHASING' where order_id=shipped.id;
    raise exception 'TEST: handoff postage allowed';
  exception when raise_exception then
    if sqlerrm <> 'local_handoff_does_not_ship' then raise; end if;
  end;
  shipped := public.update_order_fulfillment_method(shipped.id,'LOCAL_HANDOFF','SHIP','PAID','READY_TO_PICK',actor);
  update public.order_shipments set status='PURCHASING' where order_id=shipped.id;
  begin
    perform public.update_order_fulfillment_method(shipped.id,'SHIP','LOCAL_HANDOFF','PAID','READY_TO_PICK',actor);
    raise exception 'TEST: in-flight postage allowed switch';
  exception when raise_exception then
    if sqlerrm <> 'fulfillment_method_shipment_locked' then raise; end if;
  end;
  update public.order_shipments set status='LABEL_PURCHASED',provider_transaction_id='test-txn',
    label_url='https://example.com/label',tracking_number='test-tracking',carrier='USPS',service_name='Ground',is_test=false
  where order_id=shipped.id;
  begin
    perform public.update_order_fulfillment_method(shipped.id,'SHIP','LOCAL_HANDOFF','PAID','READY_TO_PICK',actor);
    raise exception 'TEST: purchased postage allowed switch';
  exception when raise_exception then
    if sqlerrm <> 'fulfillment_method_shipment_locked' then raise; end if;
  end;
  select * into print_result from public.record_order_print_submission(shipped.id,'SHIPPING_LABEL_PRINTED',actor,900011,false);
  assert print_result.delivery_id is not null and print_result.queued_now, 'shipping email blocked by old handoff email';
  assert (select count(*)=2 from public.order_notification_outbox where order_id=shipped.id), 'email history lost';
  assert not has_function_privilege('anon','public.update_order_fulfillment_method(uuid,text,text,text,text,uuid)','execute');
  assert not has_function_privilege('authenticated','public.update_order_fulfillment_method(uuid,text,text,text,text,uuid)','execute');
end;
$$;
rollback;
