-- Register the new catalog variant without inventing a received lot or stock.
insert into public.inventory_products (product_id, product_name, dose)
values ('bac-water', 'BAC Water', '10 mL')
on conflict (product_id) do nothing;
