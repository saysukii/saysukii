create or replace function public.next_invoice_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'SS' || lpad(nextval('public.invoice_number_seq')::text, 3, '0');
$$;
