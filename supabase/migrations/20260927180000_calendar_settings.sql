alter table public.studios
  add column if not exists calendar_settings jsonb;
