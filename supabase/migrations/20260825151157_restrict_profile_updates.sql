-- RLS limits which profile row a customer may update. Column privileges limit
-- what they may change within that row, keeping identity and audit fields
-- server-controlled even if more sensitive columns are added later.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, phone, address, city, state, zip)
  on table public.profiles to authenticated;
