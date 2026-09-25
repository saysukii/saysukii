-- Say Sukii OS V1
-- Replaces the disposable Round-1 proposal-studio schema while preserving
-- published migration history. All monetary values are integer cents.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Remove Round-1 objects. This rebuild intentionally starts with clean data.
drop table if exists public.agreements cascade;
drop table if exists public.invoices cascade;
drop table if exists public.proposal_line_items cascade;
drop table if exists public.proposals cascade;
drop table if exists public.projects cascade;
drop table if exists public.rate_card_items cascade;
drop table if exists public.accounts cascade;
drop sequence if exists public.invoice_number_seq cascade;
drop sequence if exists public.proposal_number_seq cascade;

do $$ begin
  create type public.app_role as enum ('admin', 'team');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.inquiry_status as enum ('new', 'contacted', 'in_conversation', 'proposal_sent', 'booked', 'closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.event_type as enum ('wedding', 'brand_activation', 'corporate', 'private', 'photoshoot', 'subscription', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.client_type as enum ('individual', 'brand', 'corporate', 'venue_partner');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.arrangement_type as enum ('installation', 'arrangement', 'reception', 'bridal', 'delivery', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.stem_unit as enum ('stem', 'bunch', 'plant');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.proposal_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.proposal_item_kind as enum ('arrangement', 'labor', 'delivery', 'install', 'breakdown', 'custom');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.project_status as enum ('pre_production', 'production', 'post_production', 'archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.order_status as enum ('draft', 'ordered', 'received');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_status as enum ('unpaid', 'paid', 'void');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum ('pending', 'completed', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

create sequence public.proposal_number_seq start with 1001 increment by 1;
create sequence public.invoice_number_seq start with 101 increment by 1;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email citext not null unique,
  role public.app_role not null default 'team',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  role public.app_role not null default 'team',
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null unique,
  phone text,
  organization text,
  type public.client_type not null default 'individual',
  source text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  contact_name text,
  contact_email citext,
  contact_phone text,
  load_in_notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('warehouse', 'wholesaler', 'rental', 'other')),
  contact_name text,
  contact_email citext,
  contact_phone text,
  ordering_method text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  event_date date,
  event_date_tbd boolean not null default false,
  event_type public.event_type not null,
  venue_id uuid references public.venues(id) on delete set null,
  venue_text text,
  guest_count integer check (guest_count is null or guest_count >= 0),
  budget_range text,
  source text,
  message text,
  status public.inquiry_status not null default 'new',
  closed_reason text,
  received_at timestamptz not null default now(),
  contacted_at timestamptz,
  proposal_sent_at timestamptz,
  booked_at timestamptz,
  closed_at timestamptz,
  archived boolean not null default false,
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (event_date is not null or event_date_tbd)
);

create table public.arrangements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.arrangement_type not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stems (
  id uuid primary key default gen_random_uuid(),
  common_name text not null,
  variety text,
  color text not null,
  unit public.stem_unit not null default 'stem',
  vendor_id uuid references public.vendors(id) on delete set null,
  last_known_cost_cents integer check (last_known_cost_cents is null or last_known_cost_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.arrangements(id) on delete cascade,
  project_id uuid,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.arrangements
  add column default_recipe_id uuid references public.recipes(id) on delete set null;

create table public.recipe_stems (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  stem_id uuid not null references public.stems(id) on delete restrict,
  color text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (recipe_id, stem_id, color)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  inquiry_id uuid not null unique references public.inquiries(id) on delete restrict,
  event_date date,
  venue_id uuid references public.venues(id) on delete set null,
  venue_text text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  deposit_percent numeric(5,2),
  deposit_amount_cents integer not null default 0 check (deposit_amount_cents >= 0),
  vision_board_url text,
  vision_image_paths text[] not null default '{}',
  notes text,
  valid_until date,
  status public.proposal_status not null default 'draft',
  access_token_hash text unique,
  access_token_prefix text,
  pdf_path text,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  declined_reason text,
  created_by uuid not null references public.profiles(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  arrangement_id uuid references public.arrangements(id) on delete set null,
  kind public.proposal_item_kind not null,
  label text not null,
  description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  line_total_cents integer not null default 0 check (line_total_cents >= 0),
  snapshot jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id) on delete cascade,
  content text not null,
  version integer not null default 1,
  pdf_path text,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id) on delete cascade,
  number text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  status public.invoice_status not null default 'unpaid',
  due_date date,
  square_payment_link text,
  square_order_id text,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  square_payment_id text not null unique,
  square_order_id text,
  amount_cents integer not null check (amount_cents >= 0),
  status public.payment_status not null,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  proposal_id uuid not null unique references public.proposals(id) on delete restrict,
  event_name text not null,
  event_date date not null,
  venue_id uuid references public.venues(id) on delete set null,
  venue_text text,
  status public.project_status not null default 'pre_production',
  notes text,
  google_event_id text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes
  add constraint recipes_project_id_fkey foreign key (project_id)
  references public.projects(id) on delete cascade;

create table public.project_arrangements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  arrangement_id uuid references public.arrangements(id) on delete set null,
  proposal_line_item_id uuid references public.proposal_line_items(id) on delete set null,
  label text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  status public.order_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stem_id uuid references public.stems(id) on delete set null,
  color text,
  quantity numeric(10,2) not null check (quantity > 0),
  unit public.stem_unit,
  vendor_id uuid references public.vendors(id) on delete set null,
  received boolean not null default false,
  manual_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stem_id is not null or manual_label is not null)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('client', 'proposal', 'project', 'venue')),
  owner_id uuid not null,
  file_path text not null,
  file_type text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('square', 'google', 'resend')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  encrypted_access_token text,
  encrypted_refresh_token text,
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  connected_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  reference_type text,
  reference_id uuid,
  error_message text,
  attempts integer not null default 0,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  payload jsonb not null,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index inquiries_waiting_idx on public.inquiries (status, received_at)
  where archived = false;
create index inquiries_client_idx on public.inquiries (client_id);
create index proposals_client_idx on public.proposals (client_id);
create index proposal_items_proposal_idx on public.proposal_line_items (proposal_id, sort_order);
create index projects_event_idx on public.projects (event_date) where archived = false;
create index projects_client_idx on public.projects (client_id);
create index recipe_stems_recipe_idx on public.recipe_stems (recipe_id);
create index order_items_order_idx on public.order_items (order_id);
create index files_owner_idx on public.files (owner_type, owner_id);
create unique index one_default_recipe_per_arrangement
  on public.recipes (arrangement_id) where is_default = true and project_id is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','clients','venues','vendors','inquiries','arrangements','stems',
    'recipes','proposals','invoices','payments','projects','orders','order_items',
    'integration_connections','integration_events'
  ] loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;

create or replace function public.next_proposal_number()
returns text language sql volatile set search_path = public as $$
  select 'PRO-' || nextval('public.proposal_number_seq')::text;
$$;

create or replace function public.next_invoice_number()
returns text language sql volatile set search_path = public as $$
  select 'INV-' || nextval('public.invoice_number_seq')::text;
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_studio_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.current_user_role() is not null;
$$;

create or replace function public.set_order_item_received(
  p_order_item_id uuid,
  p_received boolean
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_studio_member() then
    raise exception 'Unauthorized';
  end if;

  update public.order_items
  set received = p_received
  where id = p_order_item_id;

  if not found then
    raise exception 'Order item not found';
  end if;
end;
$$;

create or replace function public.complete_own_profile(p_full_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null or length(trim(p_full_name)) < 2 then
    raise exception 'A valid profile is required';
  end if;

  update public.profiles
  set full_name = trim(p_full_name), last_seen_at = now()
  where id = auth.uid() and active = true;

  if not found then
    raise exception 'A valid studio invitation is required';
  end if;
end;
$$;

create or replace function public.accept_matching_invite()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare invite_row public.team_invites%rowtype;
begin
  select * into invite_row
  from public.team_invites
  where email = new.email::citext
    and accepted_at is null
    and expires_at > now();

  if found then
    insert into public.profiles (id, full_name, email, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.email,
      invite_row.role
    )
    on conflict (id) do update set active = true, role = excluded.role;

    update public.team_invites set accepted_at = now() where id = invite_row.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_accept_invite on auth.users;
create trigger on_auth_user_created_accept_invite
  after insert on auth.users
  for each row execute function public.accept_matching_invite();

-- Transactional, replay-safe paid-deposit handoff.
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
  new_order_id uuid;
  item record;
  default_recipe uuid;
  cloned_recipe uuid;
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

  for item in
    select * from public.proposal_line_items
    where proposal_id = proposal_row.id and kind = 'arrangement'
    order by sort_order
  loop
    select default_recipe_id into default_recipe
    from public.arrangements where id = item.arrangement_id;
    cloned_recipe := null;

    if default_recipe is not null then
      insert into public.recipes (arrangement_id, project_id, name, is_default)
      select arrangement_id, new_project_id, name, false
      from public.recipes where id = default_recipe
      returning id into cloned_recipe;

      insert into public.recipe_stems (recipe_id, stem_id, color, quantity)
      select cloned_recipe, stem_id, color, quantity
      from public.recipe_stems where recipe_id = default_recipe;
    end if;

    insert into public.project_arrangements (
      project_id, arrangement_id, proposal_line_item_id, label, quantity, recipe_id
    ) values (
      new_project_id, item.arrangement_id, item.id, item.label, item.quantity, cloned_recipe
    );
  end loop;

  insert into public.orders (project_id) values (new_project_id)
  returning id into new_order_id;

  insert into public.order_items (order_id, stem_id, color, quantity, unit, vendor_id)
  select
    new_order_id,
    rs.stem_id,
    rs.color,
    sum(rs.quantity * pa.quantity),
    s.unit,
    s.vendor_id
  from public.project_arrangements pa
  join public.recipe_stems rs on rs.recipe_id = pa.recipe_id
  join public.stems s on s.id = rs.stem_id
  where pa.project_id = new_project_id
  group by rs.stem_id, rs.color, s.unit, s.vendor_id;

  update public.inquiries
  set status = 'booked', booked_at = now()
  where id = proposal_row.inquiry_id;

  update public.invoices
  set status = 'paid'
  where proposal_id = proposal_row.id;

  return new_project_id;
end;
$$;

-- Row-level security.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','team_invites','clients','venues','vendors','inquiries',
    'arrangements','stems','recipes','recipe_stems','proposals',
    'proposal_line_items','agreements','invoices','payments','projects',
    'project_arrangements','orders','order_items','files',
    'integration_connections','integration_events','webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy invites_admin_all on public.team_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clients','venues','vendors','inquiries','proposals','proposal_line_items',
    'agreements','invoices','payments','integration_connections',
    'integration_events','webhook_events'
  ] loop
    execute format(
      'create policy %I_admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      table_name, table_name
    );
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'arrangements','stems','recipes','recipe_stems','projects',
    'project_arrangements','orders','order_items','files'
  ] loop
    execute format(
      'create policy %I_member_read on public.%I for select to authenticated using (public.is_studio_member())',
      table_name, table_name
    );
    execute format(
      'create policy %I_admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      table_name, table_name
    );
  end loop;
end $$;

-- Explicit storage buckets and role-based access.
insert into storage.buckets (id, name, public)
values
  ('vision-images', 'vision-images', false),
  ('documents', 'documents', false),
  ('project-files', 'project-files', false)
on conflict (id) do update set public = false;

drop policy if exists essence_read on storage.objects;
drop policy if exists essence_write on storage.objects;
drop policy if exists essence_delete on storage.objects;
drop policy if exists documents_read on storage.objects;
drop policy if exists documents_write on storage.objects;

create policy studio_storage_read on storage.objects
  for select to authenticated
  using (bucket_id in ('vision-images','documents','project-files') and public.is_studio_member());
create policy studio_storage_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('vision-images','documents','project-files') and public.is_admin());
create policy studio_storage_admin_update on storage.objects
  for update to authenticated
  using (bucket_id in ('vision-images','documents','project-files') and public.is_admin())
  with check (bucket_id in ('vision-images','documents','project-files') and public.is_admin());
create policy studio_storage_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('vision-images','documents','project-files') and public.is_admin());

revoke all on function public.next_proposal_number() from public;
revoke all on function public.next_invoice_number() from public;
revoke all on function public.create_project_from_paid_deposit(uuid) from public;
grant execute on function public.next_proposal_number() to service_role;
grant execute on function public.next_invoice_number() to service_role;
grant execute on function public.create_project_from_paid_deposit(uuid) to service_role;
grant execute on function public.set_order_item_received(uuid, boolean) to authenticated;
grant execute on function public.complete_own_profile(text) to authenticated;
grant usage on sequence public.proposal_number_seq to service_role;
grant usage on sequence public.invoice_number_seq to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
