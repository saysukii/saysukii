-- Labeled negatives for inquiry routing (V1). Ignored mail and later-dismissed
-- candidates are stored for future prompt tuning. No real-time learning.

create table public.inquiry_routing_labels (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id uuid references public.inbound_messages(id) on delete set null,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  gmail_message_id text,
  label text not null check (label in ('ignored', 'dismissed')),
  source text not null check (source in ('model', 'human')),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index inquiry_routing_labels_label_idx
  on public.inquiry_routing_labels (label, created_at desc);
create index inquiry_routing_labels_inbound_idx
  on public.inquiry_routing_labels (inbound_message_id)
  where inbound_message_id is not null;

alter table public.inquiry_routing_labels enable row level security;

create policy inquiry_routing_labels_admin_all on public.inquiry_routing_labels
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.inquiry_routing_labels to authenticated;
grant all on table public.inquiry_routing_labels to service_role;
