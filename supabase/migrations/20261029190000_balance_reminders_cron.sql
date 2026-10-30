-- once a day at 10am eastern (14:00 utc), remind clients of a balance due in five days or today.
-- uses the same studio cron caller and vault secrets as the five-minute jobs.
select cron.schedule(
  'studio-balance-reminders',
  '0 14 * * *',
  $$select public.call_studio_cron('/api/cron/balance-reminders')$$
);
