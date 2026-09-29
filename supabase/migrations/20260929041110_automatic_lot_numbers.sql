begin;

-- Enforce uniqueness across products, including manual entries and metadata edits.
-- Existing lot names and stock are not changed.
create unique index inventory_lots_global_number_unique
  on public.inventory_lots (upper(trim(lot_number)));

create or replace function public.receive_inventory_lot(
  p_product_id text,
  p_lot_number text,
  p_supplier_batch_id text,
  p_quantity integer,
  p_expires_on date,
  p_storage_location text,
  p_actor_user_id uuid
)
returns public.inventory_lots
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_lot public.inventory_lots;
  automatic boolean := nullif(trim(p_lot_number), '') is null;
  candidate text;
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  conflict_name text;
  creation_date date := (now() at time zone 'America/Phoenix')::date;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100000 then raise exception 'invalid_quantity'; end if;
  if not automatic and (length(trim(p_lot_number)) not between 1 and 80
     or upper(trim(p_lot_number)) like 'PROVISIONAL-%') then
    raise exception 'invalid_lot_number';
  end if;
  for attempt in 1..128 loop
    if automatic then
      candidate := 'T1B-' || substr('23456789', 1 + floor(random() * 8)::integer, 1);
      for position in 1..3 loop
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      end loop;
    else
      candidate := trim(p_lot_number);
    end if;
    begin
      insert into public.inventory_lots (
        product_id, lot_number, supplier_batch_id, is_provisional,
        received_quantity, on_hand, reserved, expires_on, storage_location, received_at
      ) values (
        p_product_id, candidate, nullif(trim(p_supplier_batch_id), ''), false,
        p_quantity, p_quantity, 0, coalesce(p_expires_on, (creation_date + interval '2 years')::date),
        coalesce(nullif(trim(p_storage_location), ''), 'Tier One BioSystems HQ'), creation_date
      ) returning * into inserted_lot;

      exit;
    exception when unique_violation then
      get stacked diagnostics conflict_name = CONSTRAINT_NAME;
      if not automatic or conflict_name not in (
        'inventory_lots_global_number_unique', 'inventory_lots_product_id_lot_number_key'
      ) then raise; end if;
    end;
  end loop;
  if inserted_lot.id is null then raise exception 'lot_number_generation_exhausted'; end if;

  insert into public.inventory_movements (
    product_id, lot_id, movement_type, on_hand_delta, reserved_delta,
    reason, actor_user_id, idempotency_key
  ) values (
    inserted_lot.product_id, inserted_lot.id, 'RECEIPT', p_quantity, 0,
    'New inventory lot received', p_actor_user_id,
    'receipt:' || inserted_lot.id::text
  );
  return inserted_lot;
end;
$$;


-- CREATE OR REPLACE preserves the existing service-role-only grants.
commit;
