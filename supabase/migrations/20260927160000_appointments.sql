create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  guest_name text not null,
  guest_email text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

create policy appointments_admin_all on public.appointments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.appointments to authenticated;
grant all on table public.appointments to service_role;
