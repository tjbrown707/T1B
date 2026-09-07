import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260907161104_reopen_cancelled_orders.sql",
  "utf8",
);

test("reopen RPC is atomic, server-only, and removes the obsolete payment overload", () => {
  assert.match(
    migration,
    /drop function if exists public\.confirm_order_payment\(uuid, text, uuid\)/,
  );
  assert.match(
    migration,
    /create or replace function public\.reopen_cancelled_order\(\s*p_order_id uuid,\s*p_expected_payment_status text,\s*p_actor_user_id uuid\s*\)/,
  );
  assert.match(migration, /returns public\.orders\s+language plpgsql\s+security invoker\s+set search_path = ''/);
  assert.match(
    migration,
    /revoke execute on function public\.reopen_cancelled_order\(uuid, text, uuid\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.reopen_cancelled_order\(uuid, text, uuid\)\s+to service_role/,
  );
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /^begin;[\s\S]+commit;\s*$/);
});

test("reopen uses strict cancelled-state checks and starts a fresh 24-hour hold", () => {
  assert.match(migration, /if p_actor_user_id is null then\s+raise exception 'actor_required'/);
  assert.match(migration, /for update;[\s\S]+raise exception 'order_not_found'/);
  assert.match(migration, /raise exception 'order_reopen_status_conflict'/);
  assert.match(migration, /selected_order\.status is distinct from 'CANCELLED'/);
  assert.match(migration, /selected_order\.fulfillment_status is distinct from 'CANCELLED'/);
  assert.match(migration, /selected_order\.payment_confirmed_at is not null/);
  assert.match(migration, /raise exception 'order_reopen_state_mismatch'/);
  assert.match(migration, /new_expiration timestamptz := now\(\) \+ interval '24 hours'/);
  assert.match(
    migration,
    /set status = 'AWAITING PAYMENT',\s+payment_status = 'AWAITING_PAYMENT',\s+fulfillment_status = 'ON_HOLD',\s+reservation_expires_at = new_expiration/,
  );
  assert.match(migration, /'UNPAID_ORDER_REOPENED'/);
  assert.match(migration, /'previous_reservation_expires_at', previous_expiration/);
  assert.match(migration, /'reservation_expires_at', new_expiration/);
});

test("tracked reopen validates and re-reserves only the original released lots", () => {
  assert.match(migration, /selected_order\.inventory_accounting_mode = 'TRACKED'/);
  assert.match(migration, /state <> 'RELEASED'/);
  assert.match(migration, /released_at is null/);
  assert.match(migration, /committed_at is not null/);
  assert.match(migration, /raise exception 'inventory_reservation_mismatch'/);
  assert.match(
    migration,
    /m\.idempotency_key =\s+'reserve:' \|\| p_order_id::text \|\| ':' \|\| r\.lot_id::text/,
  );
  assert.match(
    migration,
    /m\.idempotency_key =\s+'reserve:' \|\| p_order_id::text \|\| ':' \|\| m\.lot_id::text/,
  );
  assert.match(
    migration,
    /join public\.inventory_reservations r on r\.lot_id = l\.id[\s\S]+order by l\.id[\s\S]+for update of l/,
  );
  assert.match(migration, /\(l\.on_hand - l\.reserved\) < r\.quantity/);
  assert.match(migration, /raise exception 'insufficient_inventory:%', shortage_product_id/);
  assert.match(migration, /set reserved = l\.reserved \+ r\.quantity/);
  assert.match(
    migration,
    /update public\.inventory_reservations\s+set state = 'RESERVED',\s+committed_at = null,\s+released_at = null/,
  );
  assert.match(migration, /'Cancelled order reopened; original inventory re-reserved'/);
  assert.match(migration, /'reopen:' \|\| p_order_id::text \|\| ':' \|\| r\.lot_id::text/);
  assert.doesNotMatch(migration, /reserve_inventory_for_order/);
});

test("reopen proves the order ledger and involved lot counters are balanced", () => {
  const lotLock = migration.indexOf("for update of l;");
  const saleGate = migration.indexOf("m.movement_type = 'SALE'", lotLock);
  const counterGate = migration.indexOf("raise exception 'inventory_counter_mismatch'", saleGate);
  const counterIncrement = migration.indexOf("set reserved = l.reserved + r.quantity", counterGate);

  assert.ok(lotLock >= 0 && lotLock < saleGate, "lot rows must be locked before ledger reconciliation");
  assert.ok(saleGate < counterGate, "sale history must be rejected before lot reconciliation completes");
  assert.ok(counterGate < counterIncrement, "all reconciliation gates must run before counters increase");
  assert.match(migration, /release_movement\.movement_type = 'RESERVATION_RELEASE'/);
  assert.match(migration, /release_movement\.reserved_delta = -r\.quantity/);
  assert.match(
    migration,
    /select sum\(balance_movement\.reserved_delta\)[\s\S]+balance_movement\.order_id = p_order_id[\s\S]+balance_movement\.lot_id = r\.lot_id[\s\S]+\), 0\) <> 0/,
  );
  assert.match(
    migration,
    /l\.reserved <> coalesce\(\([\s\S]+sum\(active\.quantity\)[\s\S]+active\.lot_id = l\.id[\s\S]+active\.state = 'RESERVED'/,
  );
  assert.match(
    migration,
    /m\.movement_type = 'SALE'[\s\S]+raise exception 'inventory_reservation_mismatch'/,
  );
});

test("repeat cancellation and reopen cycles receive unique immutable audit keys", () => {
  assert.match(
    migration,
    /event_type = 'UNPAID_ORDER_CANCELLED'[\s\S]+?'release:' \|\| p_order_id::text[\s\S]+?cancellation_cycle::text/,
  );
  assert.match(
    migration,
    /event_type = 'UNPAID_ORDER_REOPENED'[\s\S]+?'reopen:' \|\| p_order_id::text[\s\S]+?reopen_cycle::text/,
  );
  assert.match(migration, /order by r\.lot_id, r\.id\s+for update/);
  assert.match(migration, /'cancellation_cycle', cancellation_cycle/);
  assert.match(migration, /'reopen_cycle', reopen_cycle/);
  assert.match(migration, /'inventory_re_reserved', selected_order\.inventory_accounting_mode = 'TRACKED'/);
});

test("pre-counted legacy orders reopen without changing inventory", () => {
  assert.match(
    migration,
    /elsif selected_order\.inventory_accounting_mode = 'PRECOUNTED_LEGACY' then[\s\S]+raise exception 'precounted_order_has_reservations'/,
  );
  assert.match(
    migration,
    /'inventory_accounting_mode', selected_order\.inventory_accounting_mode/,
  );
});
