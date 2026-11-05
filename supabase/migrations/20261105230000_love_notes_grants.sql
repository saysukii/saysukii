-- the love notes table was made without the grants every other table has, so the server couldn't
-- save a note and the studio couldn't read one. the table's policies still decide which studio
-- members see or delete a note; the public side gets nothing. safe to run again.
grant select, insert, update, delete on table public.love_notes to authenticated;
grant all on table public.love_notes to service_role;
