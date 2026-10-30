-- an add-on invoice has its own page in the app now, paid in the same pop-up as a proposal's,
-- instead of square's invoice page. the page opens by a private token; each payment is kept on
-- the invoice for its receipt; and the booking line ("Booking for … per approved proposal.")
-- is kept with it.
alter table public.inquiry_invoices add column if not exists access_token text;
create unique index if not exists inquiry_invoices_access_token_idx
  on public.inquiry_invoices (access_token) where access_token is not null;
alter table public.inquiry_invoices add column if not exists payments jsonb not null default '[]'::jsonb;
alter table public.inquiry_invoices add column if not exists booking text;
