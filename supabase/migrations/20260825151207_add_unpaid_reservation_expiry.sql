-- Existing unpaid orders are deliberately grandfathered with a null expiry so
-- enabling the scheduled function cannot silently cancel today's backlog.
-- New orders receive a durable 24-hour deadline at insert time.
alter table public.orders
  add column if not exists reservation_expires_at timestamptz;

alter table public.orders
  alter column reservation_expires_at
  set default (now() + interval '24 hours');

comment on column public.orders.reservation_expires_at is
  'When an awaiting-payment inventory reservation becomes eligible for automatic cancellation; null exempts legacy orders.';

create index if not exists orders_expired_unpaid_reservations_idx
  on public.orders (reservation_expires_at)
  where payment_status = 'AWAITING_PAYMENT'
    and reservation_expires_at is not null;
