-- One open auto-task per inquiry. Booked/closed inquiries leave Home.

create unique index if not exists tasks_one_open_auto_per_inquiry
  on public.tasks (linked_id)
  where source = 'auto' and status = 'open' and linked_type = 'inquiry';

create or replace function public.retire_inquiry_auto_tasks_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('booked', 'closed') and old.status is distinct from new.status then
    update public.tasks
      set status = 'done'
      where linked_type = 'inquiry'
        and linked_id = new.id
        and source = 'auto'
        and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists inquiries_retire_auto_tasks on public.inquiries;
create trigger inquiries_retire_auto_tasks
  after update of status on public.inquiries
  for each row
  execute function public.retire_inquiry_auto_tasks_on_leave();
