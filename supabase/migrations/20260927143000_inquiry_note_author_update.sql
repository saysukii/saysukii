-- A studio member can update an internal note they wrote.
-- Admins keep full access through inquiry_messages_admin_all.

create policy inquiry_messages_author_update on public.inquiry_messages
  for update to authenticated
  using (created_by = auth.uid() and channel = 'note')
  with check (created_by = auth.uid() and channel = 'note' and direction = 'note');
