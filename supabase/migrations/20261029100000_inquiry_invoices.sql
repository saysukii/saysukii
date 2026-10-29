-- an invoice sent from a lead on its own, without a proposal: an arrangement, a delivery.
-- the square invoice holds the payment; this row keeps what was billed and where it stands.
create table if not exists public.inquiry_invoices (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  number text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  courtesy_cents integer not null default 0 check (courtesy_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  due_now_cents integer not null check (due_now_cents >= 0),
  pay_in_full boolean not null default true,
  square_invoice_id text,
  square_order_id text,
  public_url text,
  status text not null default 'sent' check (status in ('sent', 'deposit_paid', 'paid', 'canceled')),
  paid_cents integer not null default 0,
  sent_at timestamptz not null default now(),
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiry_invoices_inquiry_idx on public.inquiry_invoices (inquiry_id, sent_at desc);
create unique index if not exists inquiry_invoices_square_order_idx on public.inquiry_invoices (square_order_id)
  where square_order_id is not null;

alter table public.inquiry_invoices enable row level security;

create policy inquiry_invoices_admin_all on public.inquiry_invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger set_inquiry_invoices_updated_at before update on public.inquiry_invoices
  for each row execute function public.set_updated_at();
