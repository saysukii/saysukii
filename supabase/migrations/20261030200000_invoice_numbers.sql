-- invoice numbers carry on from square, where the studio's last was SS-750: the next one made here
-- is SS751. claim_invoice_number also steps past any higher number that was made by hand in square.
select setval(
  'public.invoice_number_seq',
  greatest(750, (select last_value from public.invoice_number_seq)),
  true
);

create or replace function public.claim_invoice_number(after_number integer)
returns text
language plpgsql
volatile
set search_path = public
as $$
begin
  -- one number at a time, so two invoices made at once never share one
  perform pg_advisory_xact_lock(hashtext('invoice_number_seq'));
  if after_number > (select last_value from public.invoice_number_seq) then
    perform setval('public.invoice_number_seq', after_number, true);
  end if;
  return 'SS' || lpad(nextval('public.invoice_number_seq')::text, 3, '0');
end;
$$;

revoke all on function public.claim_invoice_number(integer) from public;
grant execute on function public.claim_invoice_number(integer) to service_role;
