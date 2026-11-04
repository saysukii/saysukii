-- love notes: what people leave on the card at lovenote.saysukii.com. each note carries a name, and can
-- carry a voice recording, with the sender's consent to its use. anyone can leave one, but only through the server, which checks it first;
-- nothing here can be read or written from the public side. safe to run again: each step checks first.
create table if not exists public.love_notes (
  id uuid primary key default gen_random_uuid(),
  note text not null default '' check (char_length(note) <= 650),
  from_name text not null check (char_length(from_name) between 1 and 60),
  audio_path text,
  -- when they agreed to the recording's use, and the exact words they agreed to
  consent_given_at timestamptz,
  consent_wording text,
  -- marketing is a separate, optional yes
  marketing_consent_given_at timestamptz,
  marketing_consent_wording text,
  -- "uploading" until the recording has arrived; a note without one is "received" straight away
  status text not null default 'received' check (status in ('uploading', 'received')),
  -- a keyed hash of the sender's address, only to limit how many notes one person can send
  sender_hash text,
  created_at timestamptz not null default now(),
  constraint love_notes_recording_has_consent check (
    audio_path is null or (consent_given_at is not null and consent_wording is not null)
  )
);

create index if not exists love_notes_created_at_idx on public.love_notes (created_at desc);
create index if not exists love_notes_sender_idx on public.love_notes (sender_hash, created_at desc);

alter table public.love_notes enable row level security;

drop policy if exists love_notes_member_read on public.love_notes;
create policy love_notes_member_read on public.love_notes
  for select to authenticated using (public.is_studio_member());

drop policy if exists love_notes_admin_delete on public.love_notes;
create policy love_notes_admin_delete on public.love_notes
  for delete to authenticated using (public.is_admin());

-- a private bucket, with the size and kinds of file held at the door
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'love-notes', 'love-notes', false, 5242880,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/mpeg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists love_notes_storage_read on storage.objects;
create policy love_notes_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'love-notes' and public.is_studio_member());

drop policy if exists love_notes_storage_delete on storage.objects;
create policy love_notes_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'love-notes' and public.is_admin());
