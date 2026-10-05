-- Disposable and rollback-only. No emails are sent by SQL.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;
do $$
declare
  placed public.orders;
  actor uuid := '11111111-1111-4111-8111-111111111111';
  notice public.staff_payment_email_outbox;
  second_notice public.staff_payment_email_outbox;
  original_token uuid;
  payload jsonb := '{"from":"original","subject":"snapshot","text":"$72 received"}';
  before_hand bigint;
  before_reserved bigint;
begin
  select sum(on_hand), sum(reserved) into before_hand, before_reserved from public.inventory_lots;
  placed := public.create_order_transaction(jsonb_build_object('order_number','T1B-261004-910001','allow_backorder',true,
    'items','[{"id":"bpc157-5","qty":999}]'::jsonb,'items_text','Test backorder',
    'subtotal',180,'total',180,'shipping',0,'discount_amount',0,'payment_method','zelle',
    'customer_name','Payment Test','customer_email','local@example.com','customer_phone','5555555555',
    'ship_address','Test','ship_city','Phoenix','ship_state','AZ','ship_zip','85001'),null);
  assert not exists(select 1 from public.staff_payment_email_outbox where order_id=placed.id),'checkout queued payment email';
  begin
    perform public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','SHIP','Zelle',72,actor);
    raise exception 'test_rollback';
  exception when raise_exception then
    if sqlerrm <> 'test_rollback' then raise; end if;
  end;
  assert (select payment_status='AWAITING_PAYMENT' from public.orders where id=placed.id),'rolled-back payment survived';
  assert not exists(select 1 from public.staff_payment_email_outbox where order_id=placed.id),'rolled-back notice survived';
  placed := public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','SHIP','Zelle',72,actor);
  assert (select count(*)=1 from public.staff_payment_email_outbox where order_id=placed.id),'confirmation not atomically queued';
  perform public.confirm_order_payment(placed.id,'AWAITING_PAYMENT','SHIP','Zelle',72,actor);
  perform public.update_order_payment_amount(placed.id,72,72,actor);
  assert (select count(*)=1 from public.staff_payment_email_outbox where order_id=placed.id),'retry/no-op duplicated email';
  perform public.update_order_payment_amount(placed.id,72,64,actor);
  perform public.update_order_payment_amount(placed.id,64,72,actor);
  assert (select count(*)=3 and count(distinct idempotency_key)=3 from public.staff_payment_email_outbox where order_id=placed.id),'72→64→72 collapsed notices';
  assert (select count(*)=1 from public.staff_payment_email_outbox where order_id=placed.id and previous_amount=64 and payment_amount_received=72),'final correction lost previous amount';
  assert (select count(*)=1 from public.staff_payment_email_outbox where order_id=placed.id and kind='confirmed' and order_snapshot->>'payment_amount_received'='72.00'),'confirmation snapshot changed';
  select * into notice from public.staff_payment_email_outbox where order_id=placed.id and kind='confirmed';
  select * into notice from public.claim_staff_payment_email(notice.id,placed.id);
  original_token := notice.claim_token;
  assert notice.status='SENDING' and notice.attempt_count=1,'not claimed';
  assert not exists(select 1 from public.claim_staff_payment_email(notice.id,placed.id)),'live lease claimed twice';
  notice := public.prepare_staff_payment_email(notice.id,notice.claim_token,payload);
  assert notice.message_payload=payload,'payload not frozen';
  notice := public.prepare_staff_payment_email(notice.id,notice.claim_token,'{"text":"changed after deploy"}');
  assert notice.message_payload=payload,'retry changed payload';
  begin
    perform public.complete_staff_payment_email(notice.id,gen_random_uuid(),'message');
    raise exception 'TEST: wrong token accepted';
  exception when raise_exception then
    if sqlerrm <> 'delivery_claim_conflict' then raise; end if;
  end;
  notice := public.fail_staff_payment_email(notice.id,notice.claim_token,'HTTP 503',true);
  assert notice.status='ERROR' and notice.next_attempt_at > now(),'retry not scheduled';
  assert not exists(select 1 from public.claim_staff_payment_email(notice.id,placed.id)),'backoff ignored';
  update public.staff_payment_email_outbox set next_attempt_at=now() where id=notice.id;
  select * into notice from public.claim_staff_payment_email(notice.id,placed.id);
  assert notice.attempt_count=2 and notice.claim_token<>original_token and notice.message_payload=payload,'retry snapshot/lease changed';
  -- Simulate provider acceptance followed by a crashed completion request.
  update public.staff_payment_email_outbox set claimed_at=now()-interval '11 minutes' where id=notice.id;
  select * into notice from public.claim_staff_payment_email(notice.id,placed.id);
  assert notice.attempt_count=3 and notice.message_payload=payload,'stale lease not recovered safely';
  notice := public.complete_staff_payment_email(notice.id,notice.claim_token,'provider-message');
  assert notice.status='SENT','completion failed';
  select * into notice from public.claim_staff_payment_email(notice.id,placed.id);
  assert notice.status='SENT' and notice.attempt_count=3,'sent email retried';
  begin
    update public.staff_payment_email_outbox set order_snapshot='{}' where id=notice.id;
    raise exception 'TEST: snapshot mutable';
  exception when raise_exception then
    if sqlerrm <> 'immutable_payment_email' then raise; end if;
  end;
  begin
    update public.staff_payment_email_outbox set message_payload='{}' where id=notice.id;
    raise exception 'TEST: payload mutable';
  exception when raise_exception then
    if sqlerrm <> 'immutable_payment_email' then raise; end if;
  end;
  select * into second_notice from public.claim_staff_payment_email(null,placed.id);
  second_notice := public.fail_staff_payment_email(second_notice.id,second_notice.claim_token,'HTTP 401',false);
  assert second_notice.status='NEEDS_REVIEW','permanent error loops';
  select * into second_notice from public.claim_staff_payment_email(null,placed.id);
  update public.staff_payment_email_outbox set first_attempt_at=now()-interval '24 hours',claimed_at=now()-interval '11 minutes' where id=second_notice.id;
  select * into second_notice from public.claim_staff_payment_email(second_notice.id,placed.id);
  assert second_notice.status='NEEDS_REVIEW','expired provider key retried';
  -- A later new correction is independent of the exhausted old notices.
  perform public.update_order_payment_amount(placed.id,72,80,actor);
  select * into second_notice from public.claim_staff_payment_email(null,placed.id);
  update public.staff_payment_email_outbox set attempt_count=8 where id=second_notice.id;
  second_notice := public.fail_staff_payment_email(second_notice.id,second_notice.claim_token,'HTTP 503',true);
  assert second_notice.status='NEEDS_REVIEW','attempt limit ignored';
  assert (select sum(on_hand)=before_hand and sum(reserved)=before_reserved from public.inventory_lots),'backorder notice changed stock';
  assert not has_table_privilege('anon','public.staff_payment_email_outbox','SELECT'),'guest can read queue';
  assert not has_table_privilege('authenticated','public.staff_payment_email_outbox','SELECT'),'customer can read queue';
  assert not has_function_privilege('authenticated','public.claim_staff_payment_email(uuid,uuid)','EXECUTE'),'customer can claim';
  assert not has_function_privilege('anon','public.prepare_staff_payment_email(uuid,uuid,jsonb)','EXECUTE'),'guest can prepare';
  raise notice 'Staff payment email lifecycle assertions passed';
end;
$$;
rollback;
