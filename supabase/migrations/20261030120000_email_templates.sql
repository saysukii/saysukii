-- the words of every letter to a client, as the studio last saved them. a template with no row
-- here reads as the app's own; the server sends exactly what's saved.
create table if not exists public.email_templates (
  id text primary key,
  subject text not null default '',
  headline text not null default '',
  body text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

create policy email_templates_admin_all on public.email_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.email_templates to authenticated;
grant all on table public.email_templates to service_role;

create trigger set_email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();
