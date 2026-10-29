alter table public.inbound_messages
  add column if not exists from_name text;
