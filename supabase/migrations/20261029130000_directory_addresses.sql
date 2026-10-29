-- a client's own address, where a vendor is (a pickup, a showroom), and what a venue is, all brought over from notion
alter table public.clients add column if not exists address text;
alter table public.vendors add column if not exists address text;
alter table public.venues add column if not exists category text;
alter table public.venues add column if not exists website text;
alter table public.venues add column if not exists capacity text;
