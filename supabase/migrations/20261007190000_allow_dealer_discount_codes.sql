-- Allow validated checkout codes while keeping creation, personal-code
-- redemption, inventory reservation and the dealer snapshot atomic.
-- Existing snapshots and the underlying inventory transaction are unchanged.
create or replace function public.create_order_transaction(order_payload jsonb, personal_discount_code text default null)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare
  saved public.orders;
  account public.dealer_accounts;
  sale jsonb := order_payload->'dealer_sale';
  codes jsonb;
  code_text text;
  created boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(order_payload->>'order_number', 0));
  select * into saved from public.orders where order_number = order_payload->>'order_number';
  created := saved.id is null;
  if created and sale is not null and sale <> 'null'::jsonb then
    select * into account from public.dealer_accounts
      where user_id = (order_payload->>'user_id')::uuid for share;
    if account.user_id is null or not account.active then raise exception 'dealer_not_active'; end if;
    if account.percent_off <> (sale->>'percentOff')::numeric then raise exception 'dealer_rate_changed'; end if;
    if sale->>'dealerId' <> account.user_id::text then raise exception 'invalid_dealer_order'; end if;

    codes := coalesce(sale->'discountCodes', '[]'::jsonb);
    if jsonb_typeof(codes) <> 'array' then raise exception 'invalid_dealer_order'; end if;
    if jsonb_array_length(codes) > 2 then raise exception 'invalid_dealer_order'; end if;
    select coalesce(string_agg(code, ', ' order by position), '') into code_text
      from jsonb_array_elements_text(codes) with ordinality as applied(code, position);
    if code_text <> coalesce(order_payload->>'discount_code', '')
       or coalesce(sale->>'personalDiscountCode', '') <> coalesce(personal_discount_code, '')
       or (personal_discount_code is not null and not codes ? personal_discount_code) then
      raise exception 'invalid_dealer_order';
    end if;

    -- Legacy no-code payloads remain valid during the application rollout.
    if sale ? 'discountCodes' then
      if not coalesce(
        (sale->>'retailSubtotal')::numeric >= (sale->>'customerDiscountAmount')::numeric
        and (sale->>'customerDiscountAmount')::numeric >= 0
        and (sale->>'dealerSubtotal')::numeric >= (sale->>'dealerDiscountAmount')::numeric
        and (sale->>'dealerDiscountAmount')::numeric >= 0
        and (sale->>'dealerSubtotal')::numeric = (order_payload->>'subtotal')::numeric
        and (sale->>'dealerDiscountAmount')::numeric = (order_payload->>'discount_amount')::numeric
        and (sale->>'shipping')::numeric = (order_payload->>'shipping')::numeric
        and (sale->>'retailSubtotal')::numeric - (sale->>'customerDiscountAmount')::numeric = (sale->>'customerSubtotalAfterDiscount')::numeric
        and (sale->>'dealerSubtotal')::numeric - (sale->>'dealerDiscountAmount')::numeric = (sale->>'dealerSubtotalAfterDiscount')::numeric
        and (sale->>'customerSubtotalAfterDiscount')::numeric + (sale->>'shipping')::numeric = (sale->>'customerTotal')::numeric
        and (sale->>'dealerSubtotalAfterDiscount')::numeric + (sale->>'shipping')::numeric = (sale->>'dealerTotal')::numeric,
        false) then raise exception 'invalid_dealer_order'; end if;
      if sale->'discount' is not null and sale->'discount' <> 'null'::jsonb then
        if not coalesce(jsonb_array_length(codes) > 0
          and (sale->>'retained')::numeric = round((sale->>'customerSubtotalAfterDiscount')::numeric * account.percent_off / 100, 2),
          false) then raise exception 'invalid_dealer_order'; end if;
      end if;
    end if;
  end if;
  saved := public.create_order_transaction_before_dealers(order_payload, personal_discount_code);
  if created and sale is not null and sale <> 'null'::jsonb then
    update public.orders set dealer_sale = sale,
      fulfillment_method = case when sale->>'delivery' = 'LOCAL_HANDOFF' then 'LOCAL_HANDOFF' else 'SHIP' end
      where id = saved.id returning * into saved;
    insert into public.order_events(order_id,event_type,actor_user_id,details)
      values(saved.id,'DEALER_ORDER_PLACED',saved.user_id,sale);
  end if;
  return saved;
end;
$$;
revoke all on function public.create_order_transaction(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_order_transaction(jsonb,text) to service_role;
