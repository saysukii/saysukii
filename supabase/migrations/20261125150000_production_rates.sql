-- what someone is paid is set on each production, not once for the person: a big job and a small
-- one pay differently. by the hour, or one flat amount for the production.
create table if not exists public.production_rates (
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  cents integer not null check (cents >= 0),
  per text not null default 'hour' check (per in ('hour', 'production')),
  updated_at timestamptz not null default now(),
  primary key (inquiry_id, profile_id)
);

create index if not exists production_rates_profile_idx on public.production_rates (profile_id);

-- only admins read and write it; the team's own rates reach them through the server
alter table public.production_rates enable row level security;
drop policy if exists production_rates_admin_all on public.production_rates;
create policy production_rates_admin_all on public.production_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.production_rates to authenticated;
grant all on public.production_rates to service_role;

-- everyone already on a production keeps the rate they had in the gang, for that production
insert into public.production_rates (inquiry_id, profile_id, cents, per)
select distinct on (people.inquiry_id, people.profile_id)
  people.inquiry_id, people.profile_id, rates.cents, rates.per
from (
  select inquiry_id, profile_id from public.production_people
  union
  select inquiry_id, profile_id from public.production_shifts
) people
join public.member_rates rates on rates.profile_id = people.profile_id
on conflict (inquiry_id, profile_id) do nothing;

-- member_rates stays, untouched, as the record of what was set before
