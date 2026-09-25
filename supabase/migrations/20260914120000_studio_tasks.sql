-- Studio tasks: the Home desk's next-move list.
-- A task links to an inquiry, a production project, or nothing.

do $$ begin
  create type public.task_linked_type as enum ('inquiry', 'project', 'none');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_source as enum ('auto', 'manual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_status as enum ('open', 'done');
exception when duplicate_object then null; end $$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  linked_type public.task_linked_type not null default 'none',
  linked_id uuid,
  source public.task_source not null default 'manual',
  trigger_stage public.inquiry_status,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  status public.task_status not null default 'open',
  check (
    (linked_type = 'none' and linked_id is null)
    or (linked_type in ('inquiry', 'project') and linked_id is not null)
  )
);

create index tasks_status_due_idx on public.tasks (status, due_at);
create index tasks_link_idx on public.tasks (linked_type, linked_id);

alter table public.tasks enable row level security;

create policy tasks_member_read on public.tasks
  for select to authenticated
  using (public.is_studio_member());

create policy tasks_member_write on public.tasks
  for all to authenticated
  using (public.is_studio_member())
  with check (public.is_studio_member());

grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
