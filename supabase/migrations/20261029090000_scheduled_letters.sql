-- a letter scheduled for later keeps what it needs to send: recipients, thread, attachments, and whose signature
alter table public.inquiry_messages
  add column if not exists send_payload jsonb;

create index if not exists inquiry_messages_queued_idx
  on public.inquiry_messages (sent_at)
  where status = 'queued';
