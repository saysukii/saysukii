-- each meeting's granola summary is kept against its google calendar event,
-- so the schedule shows it on every device.
alter table public.meetings add column if not exists calendar_event_id text unique;

-- every five minutes supabase asks the app to bring in summaries for calls that have ended.
-- it uses the app address and cron secret already in vault for the studio_cron jobs.
select cron.schedule(
  'studio-meeting-summaries',
  '*/5 * * * *',
  $$select public.call_studio_cron('/api/cron/meeting-summaries')$$
);
