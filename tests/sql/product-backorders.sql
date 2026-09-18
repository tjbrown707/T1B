-- Run against an isolated database with the project schema and migrations.
-- All test data and inventory adjustments are rolled back.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  placed public.orders;
  replay public.orders;
  regular public.orders;
  payload jsonb;
  date_saved date;
  before_hand bigint;
  before_reserved bigint;
  actor uuid := '11111111-1111-4111-8111-111111111111';
begin
  payload := jsonb_build_object('order_number','T1B-260918-900001','allow_backorder',true,
    'items','[{"id":"bpc157-5","qty":51},{"id":"bpc157-10","qty":1}]'::jsonb,
    'items_text','BPC-157 5 mg x51; BPC-157 10 mg x1',
    'subtotal',100,'total',100,'shipping',0,'discount_amount',0,
    'payment_method','zelle','customer_name','Local Test','customer_email','local@example.com',
    'customer_phone','5555555555','ship_address','Test address','ship_city','Phoenix','ship_state','AZ','ship_zip','85001');
  select sum(on_hand),sum(reserved) into before_hand,before_reserved from public.inventory_lots;
  placed := public.create_order_transaction(payload,null);
  assert placed.backorder_pending and placed.fulfillment_status='ON_HOLD','shortage not backordered';
  assert placed.estimated_ship_date=(now() at time zone 'America/Phoenix')::date+14,'incorrect estimate';
  date_saved := placed.estimated_ship_date;
  assert not exists(select 1 from public.inventory_reservations where order_id=placed.id),'partial reservations leaked';
  assert not exists(select 1 from public.inventory_movements where order_id=placed.id),'partial movements leaked';
  assert (select sum(on_hand)=before_hand and sum(reserved)=before_reserved from public.inventory_lots),'stock changed on backorder';
  replay := public.create_order_transaction(payload,null);
  assert replay.id=placed.id and replay.estimated_ship_date=date_saved,'retry changed order/date';
  assert (select count(*)=1 from public.order_events where order_id=placed.id and event_type='BACKORDER_PLACED'),'retry duplicated event';
  assert (public.enqueue_order_receipt(placed.id)).items_text like '%On Backorder%','receipt missing backorder';
  placed := public.cancel_unpaid_order(placed.id,'AWAITING_PAYMENT',actor);
  assert placed.payment_status='CANCELLED','cancel failed';
  placed := public.reopen_cancelled_order(placed.id,'CANCELLED',actor);
  assert placed.backorder_pending and placed.estimated_ship_date=date_saved,'reopen lost backorder';
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','SHIP','Zelle',100,actor);
  assert placed.payment_status='PAID' and placed.fulfillment_status='ON_HOLD','payment released hold';
  replay := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','SHIP','Zelle',100,actor);
  assert replay.id=placed.id,'payment retry failed';
  begin
    perform public.allocate_backorder(placed.id,actor);
    raise exception 'TEST: shortage allocation should fail';
  exception when raise_exception then
    if sqlerrm not like 'insufficient_inventory:%' then raise; end if;
  end;
  assert not exists(select 1 from public.inventory_reservations where order_id=placed.id),'failed allocation leaked';
  begin
    perform public.advance_order_fulfillment(placed.id,'ON_HOLD','PICKED',actor);
    raise exception 'TEST: fulfillment should be blocked';
  exception when raise_exception then
    if sqlerrm <> 'invalid_fulfillment_transition' then raise; end if;
  end;
  perform public.receive_inventory_lot('bpc157-5','TEST-RESTOCK','TEST',10,null,'TEST',actor);
  placed := public.allocate_backorder(placed.id,actor);
  assert not placed.backorder_pending and placed.fulfillment_status='READY_TO_PICK','restock not allocated';
  assert placed.estimated_ship_date=date_saved,'allocation changed original estimate';
  assert (select sum(quantity)=52 and bool_and(state='COMMITTED') from public.inventory_reservations where order_id=placed.id),'incorrect commitment';
  select sum(on_hand),sum(reserved) into before_hand,before_reserved from public.inventory_lots;
  replay := public.allocate_backorder(placed.id,actor);
  assert (select sum(on_hand)=before_hand and sum(reserved)=before_reserved from public.inventory_lots),'allocation retry deducted twice';
  assert (select count(*)=1 from public.order_events where order_id=placed.id and event_type='BACKORDER_ALLOCATED'),'duplicate allocation event';
  -- In-stock orders retain normal reservation, payment, cancellation and reopen.
  payload := payload || '{"order_number":"T1B-260918-900002","items":[{"id":"bpc157-10","qty":1}]}'::jsonb;
  regular := public.create_order_transaction(payload,null);
  assert not regular.backorder_pending and regular.estimated_ship_date is null,'in-stock order backordered';
  regular := public.cancel_unpaid_order(regular.id,'AWAITING_PAYMENT',actor);
  regular := public.reopen_cancelled_order(regular.id,'CANCELLED',actor);
  regular := public.confirm_order_payment(regular.id,'AWAITING_PAYMENT','SHIP','Zelle',100,actor);
  assert regular.fulfillment_status='READY_TO_PICK','normal payment broken';
  -- Old clients keep strict inventory enforcement until the new UI is deployed.
  payload := payload || '{"order_number":"T1B-260918-900003","allow_backorder":false,"items":[{"id":"bpc157-5","qty":999}]}'::jsonb;
  begin
    perform public.create_order_transaction(payload,null);
    raise exception 'TEST: legacy request accepted shortage';
  exception when raise_exception then
    if sqlerrm not like 'insufficient_inventory:%' then raise; end if;
  end;
  assert not exists(select 1 from public.orders where order_number='T1B-260918-900003'),'failed creation leaked order';
  assert not has_function_privilege('authenticated','public.allocate_backorder(uuid,uuid)','EXECUTE'),'customer can allocate';
  assert not has_function_privilege('anon','public.storefront_availability()','EXECUTE'),'guest can read stock';
  assert not has_function_privilege('authenticated','public.reserve_available_inventory_for_order(uuid,jsonb)','EXECUTE'),'customer can reserve';
  raise notice 'Backorder lifecycle assertions passed';
end;
$$;
rollback;
