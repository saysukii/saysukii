-- Engagement-record hub (inquiries /pipeline/$id).
-- The client file stays the entity underneath; these tables hang off inquiry_id,
-- not client_id. Do not merge the two layers.
--
-- Studio scope: this OS is one studio. RLS uses is_admin() the same way
-- inquiries do. canva_integration and granola_integration carry studio_id
-- against the seeded studios row so a later tenant table can attach.

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.studios (id, name)
values ('00000000-0000-4000-8000-000000000010', 'Say Sukii')
on conflict (id) do nothing;

-- Studio journal on the engagement record (not the mail thread).
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  author uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index internal_notes_inquiry_idx
  on public.internal_notes (inquiry_id, created_at desc);

-- Canva OAuth: ciphertext only. Authenticated clients never receive token columns.
create table public.canva_integration (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null default '00000000-0000-4000-8000-000000000010'
    references public.studios(id) on delete cascade,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  account text,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error')),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id)
);

create table public.granola_integration (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null default '00000000-0000-4000-8000-000000000010'
    references public.studios(id) on delete cascade,
  encrypted_api_key text,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error')),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id)
);

-- Granola notes land unmatched until a human (or matcher) ties them to a lead.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  granola_note_id text not null unique,
  title text not null,
  occurred_at timestamptz not null,
  summary text,
  attendees jsonb not null default '[]'::jsonb,
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'needs_confirm', 'unmatched')),
  created_at timestamptz not null default now()
);

create index meetings_inquiry_idx
  on public.meetings (inquiry_id, occurred_at desc)
  where inquiry_id is not null;
create index meetings_match_idx
  on public.meetings (match_status, occurred_at desc);

create table public.inspiration_images (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  source text not null check (source in ('form', 'thread')),
  storage_ref text not null,
  added_at timestamptz not null default now()
);

create index inspiration_images_inquiry_idx
  on public.inspiration_images (inquiry_id, added_at desc);

alter table public.inquiries
  add column summary_text text,
  add column summary_generated_at timestamptz;

-- Existing proposal_status keeps sent / declined for the email proposal path.
-- `shared` is the Canva / export share state on the engagement record.
-- ADD VALUE cannot run inside a DO/function block.
alter type public.proposal_status add value if not exists 'shared';

alter table public.proposals
  add column canva_design_id text,
  add column export_pdf_ref text,
  add column shared_at timestamptz;

drop trigger if exists canva_integration_set_updated_at on public.canva_integration;
create trigger canva_integration_set_updated_at
  before update on public.canva_integration
  for each row execute function public.set_updated_at();

drop trigger if exists granola_integration_set_updated_at on public.granola_integration;
create trigger granola_integration_set_updated_at
  before update on public.granola_integration
  for each row execute function public.set_updated_at();

alter table public.studios enable row level security;
alter table public.internal_notes enable row level security;
alter table public.canva_integration enable row level security;
alter table public.granola_integration enable row level security;
alter table public.meetings enable row level security;
alter table public.inspiration_images enable row level security;

create policy studios_member_read on public.studios
  for select to authenticated
  using (public.is_studio_member());
create policy studios_admin_all on public.studios
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy internal_notes_admin_all on public.internal_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy canva_integration_admin_all on public.canva_integration
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy granola_integration_admin_all on public.granola_integration
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy meetings_admin_all on public.meetings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy inspiration_images_admin_all on public.inspiration_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.studios to authenticated;
grant select, insert, update, delete on table public.internal_notes to authenticated;
grant select, insert, update, delete on table public.meetings to authenticated;
grant select, insert, update, delete on table public.inspiration_images to authenticated;
grant all on table public.studios to service_role;
grant all on table public.internal_notes to service_role;
grant all on table public.meetings to service_role;
grant all on table public.inspiration_images to service_role;
grant all on table public.canva_integration to service_role;
grant all on table public.granola_integration to service_role;

-- Token / API key columns stay off the authenticated grant, same as Gmail.
revoke all on table public.canva_integration from anon, authenticated;
grant select (
  id,
  studio_id,
  account,
  status,
  connected_at,
  created_at,
  updated_at
) on table public.canva_integration to authenticated;

revoke all on table public.granola_integration from anon, authenticated;
grant select (
  id,
  studio_id,
  status,
  connected_at,
  created_at,
  updated_at
) on table public.granola_integration to authenticated;
