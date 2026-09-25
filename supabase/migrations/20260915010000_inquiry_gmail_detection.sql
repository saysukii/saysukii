-- Gmail + AI true-inquiry detection (V1 data model).
-- Candidates never enter the book on their own: origin=detected stays out of
-- the pipeline until a human sets detection_status to confirmed.

-- Inbound mailbox (one Gmail account per studio). Tokens stay encrypted and
-- are not granted to the authenticated client role.
create table public.email_integration (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail' check (provider = 'gmail'),
  account_email citext,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error')),
  connected_at timestamptz,
  connected_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  gmail_thread_id text,
  from_addr text,
  to_addr text,
  subject text,
  body text,
  received_at timestamptz not null,
  processed_at timestamptz,
  routing_result text
    check (routing_result is null or routing_result in ('attached', 'candidate', 'ignored')),
  matched_inquiry_id uuid references public.inquiries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index inbound_messages_thread_idx
  on public.inbound_messages (gmail_thread_id, received_at desc);
create index inbound_messages_routing_idx
  on public.inbound_messages (routing_result, received_at desc)
  where routing_result is not null;
create index inbound_messages_inquiry_idx
  on public.inbound_messages (matched_inquiry_id)
  where matched_inquiry_id is not null;

alter table public.inquiries
  add column origin text not null default 'form'
    check (origin in ('form', 'manual', 'detected')),
  add column detection_status text not null default 'na'
    check (detection_status in ('candidate', 'confirmed', 'dismissed', 'na')),
  add column detection_confidence numeric(4,3)
    check (detection_confidence is null or (detection_confidence >= 0 and detection_confidence <= 1)),
  add column detection_reason text,
  add column source_message_id uuid references public.inbound_messages(id) on delete set null;

alter table public.inquiries
  add constraint inquiries_detection_origin_check
  check (
    (origin in ('form', 'manual') and detection_status = 'na' and source_message_id is null)
    or
    (origin = 'detected' and detection_status in ('candidate', 'confirmed', 'dismissed'))
  );

update public.inquiries
  set origin = 'manual'
  where created_by is not null;

create index inquiries_book_idx
  on public.inquiries (status, received_at)
  where archived = false and detection_status in ('na', 'confirmed');
create index inquiries_candidates_idx
  on public.inquiries (received_at)
  where origin = 'detected' and detection_status = 'candidate';

-- Conversation thread holds real mail (inbound / outbound / note).
alter table public.inquiry_messages
  add column gmail_thread_id text,
  add column author text,
  add column sent_at timestamptz;

update public.inquiry_messages
  set sent_at = created_at
  where sent_at is null;

alter table public.inquiry_messages
  alter column sent_at set default now(),
  alter column sent_at set not null;

alter table public.inquiry_messages
  drop constraint if exists inquiry_messages_direction_check;
alter table public.inquiry_messages
  add constraint inquiry_messages_direction_check
  check (direction in ('inbound', 'outbound', 'internal', 'note'));

update public.inquiry_messages
  set direction = 'note'
  where direction = 'internal';

alter table public.inquiry_messages
  drop constraint inquiry_messages_direction_check;
alter table public.inquiry_messages
  add constraint inquiry_messages_direction_check
  check (direction in ('inbound', 'outbound', 'note'));

create unique index inquiry_messages_gmail_id_idx
  on public.inquiry_messages (gmail_message_id)
  where gmail_message_id is not null;
create index inquiry_messages_thread_idx
  on public.inquiry_messages (gmail_thread_id, sent_at)
  where gmail_thread_id is not null;

insert into public.inquiry_messages (
  inquiry_id,
  direction,
  channel,
  subject,
  body,
  from_address,
  to_address,
  status,
  author,
  sent_at,
  created_at
)
select
  i.id,
  'inbound',
  'form',
  'new inquiry',
  coalesce(nullif(trim(i.message), ''), 'a new inquiry arrived through the form.'),
  c.email::text,
  null,
  'received',
  c.name,
  i.received_at,
  i.received_at
from public.inquiries i
join public.clients c on c.id = i.client_id
where not exists (
  select 1 from public.inquiry_messages m where m.inquiry_id = i.id
);

drop trigger if exists email_integration_set_updated_at on public.email_integration;
create trigger email_integration_set_updated_at
  before update on public.email_integration
  for each row execute function public.set_updated_at();

alter table public.email_integration enable row level security;
alter table public.inbound_messages enable row level security;

create policy email_integration_admin_all on public.email_integration
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy inbound_messages_admin_all on public.inbound_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.email_integration from anon, authenticated;
grant select (
  id,
  provider,
  account_email,
  status,
  connected_at,
  connected_by,
  created_at,
  updated_at
) on table public.email_integration to authenticated;
