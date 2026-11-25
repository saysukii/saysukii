-- every production starts with the studio's usual dress code, until it's written for that one:
-- new ones by default, and the ones already made that never had any
alter table public.productions
  alter column dress_code set default e'in studio: cozy, comfortable, whatever you''d like\non site: all black';

update public.productions
set dress_code = e'in studio: cozy, comfortable, whatever you''d like\non site: all black'
where dress_code is null or btrim(dress_code) = '';
