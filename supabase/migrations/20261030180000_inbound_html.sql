-- the letter as the client's mail app drew it (its html), so the conversation can show their
-- signature, links, and pictures the way gmail does. the plain text in body stays for reading.
alter table public.inbound_messages add column if not exists body_html text;
