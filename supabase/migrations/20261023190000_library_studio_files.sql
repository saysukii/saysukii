-- Studio files live in the library without a client, proposal, or venue.

alter table public.files drop constraint if exists files_owner_type_check;
alter table public.files
  add constraint files_owner_type_check
  check (owner_type in ('client', 'proposal', 'project', 'venue', 'inquiry', 'studio'));
