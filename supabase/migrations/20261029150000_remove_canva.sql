-- the studio doesn't connect to canva. a proposal is a pdf dropped onto the lead.
drop table if exists public.canva_integration;
alter table public.proposals drop column if exists canva_design_id;
