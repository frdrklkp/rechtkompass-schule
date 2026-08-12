
-- Helper trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Enum for ampel
DO $$ BEGIN
  CREATE TYPE public.ampel_status AS ENUM ('gruen','gelb','rot');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.case_status AS ENUM ('draft','review','published','archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- practice_categories
CREATE TABLE public.practice_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.practice_categories(id) on delete set null,
  sort_order int default 0,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.practice_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_categories TO authenticated;
GRANT ALL ON public.practice_categories TO service_role;
ALTER TABLE public.practice_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat read all" ON public.practice_categories FOR SELECT USING (true);
CREATE POLICY "cat write anon pilot" ON public.practice_categories FOR ALL USING (true) WITH CHECK (true);

-- practice_cases
CREATE TABLE public.practice_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_description text,
  category text,
  subcategory text,
  ampel public.ampel_status not null default 'gruen',
  status public.case_status not null default 'draft',
  short_answer text,
  immediate_actions text,
  recommendation text,
  legal_explanation text,
  checklist text[] not null default '{}',
  documentation text[] not null default '{}',
  responsibilities text,
  faq jsonb not null default '[]'::jsonb,
  common_mistakes text[] not null default '{}',
  practice_tip text,
  decision_tree jsonb not null default '{}'::jsonb,
  related_cases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.practice_cases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_cases TO authenticated;
GRANT ALL ON public.practice_cases TO service_role;
ALTER TABLE public.practice_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases read all" ON public.practice_cases FOR SELECT USING (true);
CREATE POLICY "cases write anon pilot" ON public.practice_cases FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_practice_cases_updated
  BEFORE UPDATE ON public.practice_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- legal_sources
CREATE TABLE public.legal_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_name text,
  scope text,
  description text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.legal_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_sources TO authenticated;
GRANT ALL ON public.legal_sources TO service_role;
ALTER TABLE public.legal_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources read all" ON public.legal_sources FOR SELECT USING (true);
CREATE POLICY "sources write anon pilot" ON public.legal_sources FOR ALL USING (true) WITH CHECK (true);

-- legal_sections
CREATE TABLE public.legal_sections (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.legal_sources(id) on delete cascade,
  reference text not null,
  title text,
  note text,
  content text,
  created_at timestamptz not null default now()
);
CREATE INDEX legal_sections_source_idx ON public.legal_sections(source_id);
GRANT SELECT ON public.legal_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_sections TO authenticated;
GRANT ALL ON public.legal_sections TO service_role;
ALTER TABLE public.legal_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections read all" ON public.legal_sections FOR SELECT USING (true);
CREATE POLICY "sections write anon pilot" ON public.legal_sections FOR ALL USING (true) WITH CHECK (true);

-- case_legal_links
CREATE TABLE public.case_legal_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.practice_cases(id) on delete cascade,
  section_id uuid not null references public.legal_sections(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique(case_id, section_id)
);
CREATE INDEX case_legal_links_case_idx ON public.case_legal_links(case_id);
GRANT SELECT ON public.case_legal_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_legal_links TO authenticated;
GRANT ALL ON public.case_legal_links TO service_role;
ALTER TABLE public.case_legal_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links read all" ON public.case_legal_links FOR SELECT USING (true);
CREATE POLICY "links write anon pilot" ON public.case_legal_links FOR ALL USING (true) WITH CHECK (true);

-- document_templates
CREATE TABLE public.document_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.document_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpl read all" ON public.document_templates FOR SELECT USING (true);
CREATE POLICY "tpl write anon pilot" ON public.document_templates FOR ALL USING (true) WITH CHECK (true);

-- keywords
CREATE TABLE public.keywords (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.keywords TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keywords TO authenticated;
GRANT ALL ON public.keywords TO service_role;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kw read all" ON public.keywords FOR SELECT USING (true);
CREATE POLICY "kw write anon pilot" ON public.keywords FOR ALL USING (true) WITH CHECK (true);

-- case_keywords
CREATE TABLE public.case_keywords (
  case_id uuid not null references public.practice_cases(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  primary key(case_id, keyword_id)
);
GRANT SELECT ON public.case_keywords TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_keywords TO authenticated;
GRANT ALL ON public.case_keywords TO service_role;
ALTER TABLE public.case_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ck read all" ON public.case_keywords FOR SELECT USING (true);
CREATE POLICY "ck write anon pilot" ON public.case_keywords FOR ALL USING (true) WITH CHECK (true);

-- roles
CREATE TABLE public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);
GRANT SELECT ON public.roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles read all" ON public.roles FOR SELECT USING (true);

INSERT INTO public.roles(name, description) VALUES
  ('admin','Vollzugriff auf alle Inhalte und Einstellungen'),
  ('editor','Kann Praxisfälle, Rechtsgrundlagen und Vorlagen pflegen'),
  ('viewer','Kann Inhalte lesen');
