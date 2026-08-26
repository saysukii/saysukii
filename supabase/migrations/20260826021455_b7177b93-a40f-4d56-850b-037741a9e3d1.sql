CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 101 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.proposal_number_seq START WITH 1001 INCREMENT BY 1;

CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'prospect' CHECK (type IN ('prospect','client')),
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard','high_value')),
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_admin_all" ON public.accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  service_line TEXT NOT NULL CHECK (service_line IN ('floral','wedding','experiential')),
  event_date DATE,
  venue TEXT,
  budget_estimate_cents INTEGER,
  stage TEXT NOT NULL DEFAULT 'conversation' CHECK (stage IN ('conversation','proposal_out','agreement','booked','complete')),
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_admin_all" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX projects_account_idx ON public.projects(account_id);

CREATE TABLE public.rate_card_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_line TEXT NOT NULL CHECK (service_line IN ('floral','wedding','experiential')),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'each' CHECK (unit IN ('each','hour','arrangement','flat')),
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_card_items TO authenticated;
GRANT ALL ON public.rate_card_items TO service_role;
ALTER TABLE public.rate_card_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_card_admin_all" ON public.rate_card_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined')),
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  essence_image_urls TEXT[] NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_admin_all" ON public.proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX proposals_project_idx ON public.proposals(project_id);

CREATE TABLE public.proposal_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  rate_card_item_id UUID REFERENCES public.rate_card_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_line_items TO authenticated;
GRANT ALL ON public.proposal_line_items TO service_role;
ALTER TABLE public.proposal_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_lines_admin_all" ON public.proposal_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX proposal_lines_proposal_idx ON public.proposal_line_items(proposal_id);

CREATE TABLE public.agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'standard' CHECK (type IN ('standard','in_kind_barter')),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreements TO authenticated;
GRANT ALL ON public.agreements TO service_role;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agreements_admin_all" ON public.agreements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX agreements_proposal_idx ON public.agreements(proposal_id);

CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','deposit_paid','paid')),
  due_date DATE,
  stripe_payment_link TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_admin_all" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX invoices_proposal_idx ON public.invoices(proposal_id);

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'INV-' || nextval('public.invoice_number_seq')::TEXT;
$$;

CREATE OR REPLACE FUNCTION public.next_proposal_number()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'PRO-' || nextval('public.proposal_number_seq')::TEXT;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_proposal_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_proposal_number() TO service_role;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO service_role;
GRANT USAGE ON SEQUENCE public.proposal_number_seq TO service_role;

CREATE POLICY "essence_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'essence-images');
CREATE POLICY "essence_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'essence-images');
CREATE POLICY "essence_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'essence-images');
CREATE POLICY "documents_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "documents_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

INSERT INTO public.rate_card_items (service_line, name, description, unit, unit_price_cents) VALUES
('floral','Signature Arrangement','Seasonal market blooms in studio vessel','arrangement',18500),
('floral','Petite Bud Vase','Single-stem accent for tabletops','arrangement',6500),
('floral','Weekly Lobby Installation','Recurring statement piece, delivered and styled','flat',185000),
('floral','Design & Sourcing Labor','Studio design and market sourcing time','hour',12500),
('floral','Delivery & On-Site Styling','Miami-Dade delivery and on-site placement','flat',25000),
('wedding','Bridal Bouquet','Hand-tied garden style with silk ribbon','each',48500),
('wedding','Bridesmaid Bouquet','Petite companion bouquet','each',18500),
('wedding','Boutonniere','Single bloom with foliage','each',4500),
('wedding','Ceremony Arch Installation','Asymmetric floral arch, install and strike','flat',285000),
('wedding','Reception Centerpiece','Low lush arrangement in footed vessel','arrangement',22500),
('wedding','Wedding Production Labor','Install team, per person hour','hour',9500),
('experiential','Concept & Creative Direction','Mood direction, palette, and design deck','flat',150000),
('experiential','Immersive Floral Installation','Large-format suspended or sculptural feature','flat',650000),
('experiential','Activation Styling Day Rate','On-site styling and refresh','hour',15000),
('experiential','Brand Photo Moment','Compact floral set piece for content capture','flat',185000),
('experiential','Strike & Load Out','Post-event removal and site restoration','flat',75000);