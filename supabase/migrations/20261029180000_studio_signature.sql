-- the owner's own signature, drawn once in settings; it countersigns the agreement copy
-- a client receives, dated the moment the client signed.
alter table public.profiles add column if not exists signature text;
