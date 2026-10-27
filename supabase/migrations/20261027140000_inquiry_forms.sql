alter table public.studios
  add column if not exists inquiry_forms jsonb;
