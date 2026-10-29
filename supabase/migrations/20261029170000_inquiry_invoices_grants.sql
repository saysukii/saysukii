-- the inquiry invoices table was made without the grants every other table has,
-- so neither the studio (through its policy) nor the server could read or write it.
grant select, insert, update, delete on table public.inquiry_invoices to authenticated;
grant all on table public.inquiry_invoices to service_role;
