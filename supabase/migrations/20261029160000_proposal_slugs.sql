-- A proposal's public link is the client's name: inside.saysukii.com/maya-chen.
-- Two clients with the same name get maya-chen-2, maya-chen-3.
create extension if not exists unaccent with schema extensions;

alter table public.proposals add column if not exists slug text;

create unique index if not exists proposals_slug_key on public.proposals (slug) where slug is not null;

with named as (
  select
    p.id,
    coalesce(
      nullif(trim(both '-' from regexp_replace(lower(extensions.unaccent(c.name)), '[^a-z0-9]+', '-', 'g')), ''),
      'client'
    ) as base,
    p.created_at
  from public.proposals p
  join public.clients c on c.id = p.client_id
  where p.slug is null and p.access_token is not null
),
reserved as (
  select unnest(array[
    'api', 'auth', 'book', 'calendar', 'clients', 'dashboard', 'directories', 'email-preview',
    'inquire', 'library', 'loading', 'onboarding', 'pipeline', 'proposal', 'schedule',
    'settings', 'shelf'
  ]) as base
),
ranked as (
  select
    named.id,
    named.base,
    row_number() over (partition by named.base order by named.created_at, named.id)
      + case when named.base in (select base from reserved) then 1 else 0 end as n
  from named
)
update public.proposals p
set slug = case when ranked.n = 1 then ranked.base else ranked.base || '-' || ranked.n end
from ranked
where p.id = ranked.id;
