-- an inquiry can be named for its event, apart from the client's name, so the name carries over
-- to the production when it's booked
alter table public.inquiries add column if not exists event_name text
  check (event_name is null or char_length(event_name) between 1 and 120);

-- not every production needs a team: a smaller engagement can be the studio's alone, with no
-- crew, schedule, or sharing
alter table public.productions add column if not exists has_team boolean not null default true;
