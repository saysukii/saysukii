-- inquiry_messages was created after the blanket grants in the first migration,
-- so service_role could insert an inquiry and then fail on the thread note.
-- That is the public form error: "we couldn’t save your inquiry."

grant select, insert, update, delete on table public.inquiry_messages to authenticated;
grant all on table public.inquiry_messages to service_role;

grant select, insert, update, delete on table public.inbound_messages to authenticated;
grant all on table public.inbound_messages to service_role;

grant all on table public.email_integration to service_role;

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
