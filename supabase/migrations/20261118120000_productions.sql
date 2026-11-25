-- productions: once an inquiry is booked, the studio plans the event on its production tab, and the
-- members it assigns tasks to open it from today. admins read and write these tables; a member only
-- reaches a production through the app's server, which checks they're on it, active, and that the
-- event isn't done yet. where a production is (pre-production, production, post-production,
-- wrapped) isn't stored: it follows its production days, and the team's access ends 48 hours after
-- the last one. safe to run again: each step checks first.

create table if not exists public.productions (
  inquiry_id uuid primary key references public.inquiries(id) on delete cascade,
  -- the address the team opens: inside.saysukii.com/production/<slug>
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- read as "Say Sukii x <project name>"
  project_name text not null check (char_length(project_name) between 1 and 120),
  studio_address text,
  dress_code text,
  -- the proposal the floral vision shows pages from, and which pages (counted from 1)
  vision_proposal_id uuid references public.proposals(id) on delete set null,
  vision_pages integer[] not null default '{}',
  -- the chosen pages are copied into their own pdf, so the team never receives the priced proposal.
  -- the stamp names the proposal version and pages that copy was made from.
  vision_path text,
  vision_stamp text,
  -- the hours email to the studio once the last shift ends; this is when it went
  hours_sent_at timestamptz,
  -- nothing reaches the team until the studio shares the production; this is when it last did.
  -- until then the team can't see it, and nobody is emailed
  shared_at timestamptz,
  reflection text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_days (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  day date not null,
  -- the day's windows and notes, a line each: "10:00am – 10:00pm (open access to pamm 6–10pm)"
  hours text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.production_items (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  kind text not null default '',
  name text not null,
  quantity numeric(10, 2) not null default 1 check (quantity >= 0),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  -- who last moved its status along, and when: anyone on the production can
  status_by uuid references public.profiles(id) on delete set null,
  status_at timestamptz,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.production_stems (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  -- written lowercase, the way the recipe reads: "anthurium", "salmon"
  name text not null,
  color text not null default '',
  quantity numeric(10, 2) check (quantity is null or quantity >= 0),
  -- the piece of the order it's for; the stem stays if that piece is removed
  item_id uuid references public.production_items(id) on delete set null,
  done boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  category text not null default '',
  location text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- who's on a production, with or without a task yet. being on it is what lets a member open it.
create table if not exists public.production_people (
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  -- when they were last sent their schedule for this production, at a share
  notified_at timestamptz,
  -- when something of theirs was taken away (a shift, a task, a day), so the next share tells them
  changed_at timestamptz,
  primary key (inquiry_id, profile_id)
);

-- someone can be added to the team before they're invited: the studio schedules them first, and
-- they're invited when a production they're on is shared. added_name is the name the studio gave
-- them, until they choose their own; invited_at is when their invitation went.
alter table public.profiles add column if not exists added_name text;
-- the founder sees everything, and decides what each other admin can open
alter table public.profiles add column if not exists is_owner boolean not null default false;
alter table public.profiles add column if not exists access text[] not null
  default '{inquiries,productions,schedule,library}';
-- how we flow: the gang's terms, agreed to the first time they sign in, and again when they change
alter table public.profiles add column if not exists flow_version text;
alter table public.profiles add column if not exists flow_agreed_at timestamptz;
-- the tour of today: shown once, the first time they're in, then never again on any device
alter table public.profiles add column if not exists tour_seen_at timestamptz;
-- the studio's first admin is its founder
update public.profiles set is_owner = true
where id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
  and not exists (select 1 from public.profiles where is_owner);
alter table public.profiles add column if not exists invited_at timestamptz;
-- anyone invited before this, who hasn't joined yet, was invited when their account was made
update public.profiles set invited_at = created_at where full_name is null and invited_at is null;

-- who a task is assigned to. notified_at stays empty until their assignment letter goes out, so
-- everything assigned in one sitting arrives as one letter per production.
create table if not exists public.production_task_people (
  task_id uuid not null references public.production_tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (task_id, profile_id)
);

-- the schedule: who works when, for the team to plan by and for payroll. the studio pays on these
-- scheduled hours. a shift past midnight ends the next day (ends before starts).
create table if not exists public.production_shifts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.productions(inquiry_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  starts text not null check (starts ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ends text not null check (ends ~ '^[0-2][0-9]:[0-5][0-9]$'),
  role text not null default '',
  location text not null default '',
  -- empty until the person's letter about it goes out
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- what each person is paid: by the hour, or one flat amount for a production.
-- only admins can read it: profiles are open to the team.
create table if not exists public.member_rates (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  cents integer not null check (cents >= 0),
  per text not null default 'hour' check (per in ('hour', 'production')),
  updated_at timestamptz not null default now()
);

-- what the bell shows a member: "you're on 3 tasks for …", until they open it
create table if not exists public.member_notices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'tasks_assigned'
    check (kind in ('tasks_assigned', 'added_to_production')),
  inquiry_id uuid references public.inquiries(id) on delete cascade,
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists production_days_inquiry_idx on public.production_days (inquiry_id, day);
create index if not exists production_items_inquiry_idx on public.production_items (inquiry_id, sort);
create index if not exists production_stems_inquiry_idx on public.production_stems (inquiry_id, sort);
create index if not exists production_tasks_inquiry_idx
  on public.production_tasks (inquiry_id, starts_at);
create index if not exists production_task_people_profile_idx
  on public.production_task_people (profile_id);
create index if not exists production_task_people_waiting_idx
  on public.production_task_people (assigned_at) where notified_at is null;
create index if not exists production_people_profile_idx
  on public.production_people (profile_id);
create index if not exists production_people_waiting_idx
  on public.production_people (added_at) where notified_at is null;
create index if not exists production_shifts_inquiry_idx
  on public.production_shifts (inquiry_id, day, starts);
create index if not exists production_shifts_profile_idx
  on public.production_shifts (profile_id, day);
create index if not exists production_shifts_waiting_idx
  on public.production_shifts (created_at) where notified_at is null;
create index if not exists member_notices_profile_idx
  on public.member_notices (profile_id, created_at desc);

drop trigger if exists productions_set_updated_at on public.productions;
create trigger productions_set_updated_at
  before update on public.productions
  for each row execute function public.set_updated_at();

drop trigger if exists production_tasks_set_updated_at on public.production_tasks;
create trigger production_tasks_set_updated_at
  before update on public.production_tasks
  for each row execute function public.set_updated_at();

do $$
declare
  name text;
begin
  foreach name in array array[
    'productions', 'production_days', 'production_items', 'production_stems',
    'production_tasks', 'production_task_people', 'production_people',
    'production_shifts', 'member_rates'
  ] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('drop policy if exists %I on public.%I', name || '_admin_all', name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      name || '_admin_all', name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', name);
  end loop;
end $$;

alter table public.member_notices enable row level security;

drop policy if exists member_notices_own_read on public.member_notices;
create policy member_notices_own_read on public.member_notices
  for select to authenticated using (profile_id = auth.uid() and public.is_studio_member());

drop policy if exists member_notices_own_update on public.member_notices;
create policy member_notices_own_update on public.member_notices
  for update to authenticated
  using (profile_id = auth.uid() and public.is_studio_member())
  with check (profile_id = auth.uid());

grant select, update on public.member_notices to authenticated;

-- a production's logistics files and vision images live with the studio's other files
alter table public.files drop constraint if exists files_owner_type_check;
alter table public.files
  add constraint files_owner_type_check
  check (owner_type in ('client', 'proposal', 'project', 'venue', 'inquiry', 'studio', 'production'));

-- every five minutes, members hear about what they were assigned since the last sweep
do $$
begin
  if exists (select 1 from cron.job where jobname = 'studio-production-notices') then
    perform cron.unschedule('studio-production-notices');
  end if;
end $$;

select cron.schedule(
  'studio-production-notices',
  '*/5 * * * *',
  $$select public.call_studio_cron('/api/cron/production-notices')$$
);
