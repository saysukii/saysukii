alter table public.proposals
  add column if not exists access_token text unique;

alter table public.agreements
  add column if not exists signed_name text,
  add column if not exists signed_at timestamptz;
