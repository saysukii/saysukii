-- Inquiry CRM: conversation, files on a lead, Gmail provider ready for later.

alter table public.files drop constraint if exists files_owner_type_check;
alter table public.files
  add constraint files_owner_type_check
  check (owner_type in ('client', 'proposal', 'project', 'venue', 'inquiry'));

alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in ('square', 'google', 'resend', 'gmail'));

create table public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  channel text not null check (channel in ('form', 'email', 'note')),
  subject text,
  body text not null,
  from_address text,
  to_address text,
  gmail_message_id text,
  status text not null default 'received'
    check (status in ('draft', 'queued', 'sent', 'received', 'failed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index inquiry_messages_inquiry_idx
  on public.inquiry_messages (inquiry_id, created_at);

alter table public.inquiry_messages enable row level security;

create policy inquiry_messages_admin_all on public.inquiry_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
