-- every five minutes supabase calls the app: send letters whose time has come, then pull in new gmail.
-- the app's address and the cron secret live in vault (see the README), never in this file.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_studio_cron(route text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'studio_app_url') || route,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'studio_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;

revoke all on function public.call_studio_cron(text) from public, anon, authenticated;

select cron.schedule(
  'studio-scheduled-letters',
  '*/5 * * * *',
  $$select public.call_studio_cron('/api/cron/scheduled-letters')$$
);

select cron.schedule(
  'studio-gmail-inbound',
  '*/5 * * * *',
  $$select public.call_studio_cron('/api/cron/gmail-inbound')$$
);
