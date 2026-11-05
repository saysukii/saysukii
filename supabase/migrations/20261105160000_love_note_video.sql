-- video notes on the love note card. a note can now carry a video instead of a voice recording, with
-- the same consent. the bucket takes video too, up to supabase's 50mb upload cap; the server still holds
-- each kind to its own size. safe to run again: each step checks first.
alter table public.love_notes add column if not exists video_path text;

alter table public.love_notes drop constraint if exists love_notes_recording_has_consent;
alter table public.love_notes add constraint love_notes_recording_has_consent check (
  (audio_path is null and video_path is null)
  or (consent_given_at is not null and consent_wording is not null)
);

alter table public.love_notes drop constraint if exists love_notes_one_recording;
alter table public.love_notes add constraint love_notes_one_recording check (
  audio_path is null or video_path is null
);

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/mpeg',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
where id = 'love-notes';
