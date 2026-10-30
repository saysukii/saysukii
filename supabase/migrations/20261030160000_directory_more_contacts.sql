-- a venue or vendor can have more than one person to reach. the first stays in contact_name,
-- contact_email, and contact_phone; everyone after it is kept here as {name, email, phone}.
alter table public.venues add column if not exists more_contacts jsonb not null default '[]'::jsonb;
alter table public.vendors add column if not exists more_contacts jsonb not null default '[]'::jsonb;
