-- the 4% convenience fee is the studio's choice, proposal by proposal and invoice by invoice;
-- and an invoice's discount can be a percentage, kept so the invoice reads "discount (10%)".
alter table public.proposals add column if not exists card_fee boolean not null default false;
alter table public.inquiry_invoices add column if not exists card_fee boolean not null default false;
alter table public.inquiry_invoices add column if not exists discount_percent numeric(5, 2);

-- a discount can have a name ("returning client"), and every named discount is kept for the studio
-- to pick again for any client. safe to run again: each step checks first.
alter table public.inquiry_invoices add column if not exists discount_label text;

create table if not exists public.studio_discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('percent', 'amount')),
  value numeric(12, 2) not null check (value > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists studio_discounts_name_idx on public.studio_discounts (lower(name));

alter table public.studio_discounts enable row level security;
drop policy if exists studio_discounts_admin_all on public.studio_discounts;
create policy studio_discounts_admin_all on public.studio_discounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on table public.studio_discounts to authenticated;
grant all on table public.studio_discounts to service_role;
