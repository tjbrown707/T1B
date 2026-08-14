begin;

create index order_notification_outbox_actor_idx
  on public.order_notification_outbox (triggered_by_user_id)
  where triggered_by_user_id is not null;

commit;
