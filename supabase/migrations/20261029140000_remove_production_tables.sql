-- the production phase isn't built yet, so the studio keeps no arrangements, stems, recipes, or orders
-- until it is. a paid deposit still opens the project, books the inquiry, and marks the invoice paid.

create or replace function public.create_project_from_paid_deposit(p_payment_id uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  proposal_row public.proposals%rowtype;
  inquiry_row public.inquiries%rowtype;
  new_project_id uuid;
begin
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found or payment_row.status <> 'completed' then
    raise exception 'A completed payment is required';
  end if;

  select id into new_project_id from public.projects
  where proposal_id = payment_row.proposal_id;
  if found then return new_project_id; end if;

  select * into proposal_row from public.proposals where id = payment_row.proposal_id;
  select * into inquiry_row from public.inquiries where id = proposal_row.inquiry_id;

  insert into public.projects (
    client_id, proposal_id, event_name, event_date, venue_id, venue_text
  ) values (
    proposal_row.client_id,
    proposal_row.id,
    initcap(replace(inquiry_row.event_type::text, '_', ' ')) || ' · ' ||
      (select name from public.clients where id = proposal_row.client_id),
    coalesce(proposal_row.event_date, inquiry_row.event_date),
    coalesce(proposal_row.venue_id, inquiry_row.venue_id),
    coalesce(proposal_row.venue_text, inquiry_row.venue_text)
  ) returning id into new_project_id;

  update public.inquiries
  set status = 'booked', booked_at = now()
  where id = proposal_row.inquiry_id;

  update public.invoices
  set status = 'paid'
  where proposal_id = proposal_row.id;

  return new_project_id;
end;
$$;

revoke all on function public.create_project_from_paid_deposit(uuid) from public;
grant execute on function public.create_project_from_paid_deposit(uuid) to service_role;

drop function if exists public.set_order_item_received(uuid, boolean);

alter table public.proposal_line_items drop column if exists arrangement_id;

drop table if exists
  public.order_items,
  public.orders,
  public.project_arrangements,
  public.recipe_stems,
  public.recipes,
  public.stems,
  public.arrangements
  cascade;

drop type if exists public.order_status;
drop type if exists public.stem_unit;
drop type if exists public.arrangement_type;
