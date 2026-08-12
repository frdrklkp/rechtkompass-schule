-- 0) Öffentliches Schema komplett zurücksetzen
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- Kombiniertes Bootstrap-Skript für ein frisches Supabase-Projekt
-- 2026-07-25- und 2026-07-26-Gruppen nach echten Abhängigkeiten sortiert statt alphabetisch.

-- ===== supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql =====

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


-- Nachträgliche Korrektur: public.case_keywords (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.case_keywords ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.case_keywords ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.case_keywords ALTER COLUMN "id" SET NOT NULL;
-- Nachträgliche Korrektur: public.case_legal_links (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.case_legal_links ADD COLUMN IF NOT EXISTS "explanation" text;
ALTER TABLE public.case_legal_links ADD COLUMN IF NOT EXISTS "legal_section_id" uuid;
ALTER TABLE public.case_legal_links ADD COLUMN IF NOT EXISTS "relevance" text;
ALTER TABLE public.case_legal_links ALTER COLUMN "section_id" DROP NOT NULL;
-- Nachträgliche Korrektur: public.document_templates (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft'::text;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "template_type" text;
-- Nachträgliche Korrektur: public.keywords (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.keywords ADD COLUMN IF NOT EXISTS "keyword" text;
ALTER TABLE public.keywords ALTER COLUMN "keyword" SET NOT NULL;
ALTER TABLE public.keywords ALTER COLUMN "name" DROP NOT NULL;
-- Nachträgliche Korrektur: public.legal_sections (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "full_text" text;
ALTER TABLE public.legal_sections ALTER COLUMN "full_text" SET NOT NULL;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.legal_sections ALTER COLUMN "metadata" SET NOT NULL;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "official_url" text;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "section_number" text;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft'::text;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.legal_sections ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "valid_from" date;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "valid_to" date;
ALTER TABLE public.legal_sections ADD COLUMN IF NOT EXISTS "version_label" text;
ALTER TABLE public.legal_sections ALTER COLUMN "reference" DROP NOT NULL;
-- Nachträgliche Korrektur: public.legal_sources (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.legal_sources ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public.legal_sources ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE public.legal_sources ADD COLUMN IF NOT EXISTS "publisher" text;
ALTER TABLE public.legal_sources ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'law'::text;
ALTER TABLE public.legal_sources ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active'::text;
ALTER TABLE public.legal_sources ALTER COLUMN "title" DROP NOT NULL;
-- Nachträgliche Korrektur: public.practice_cases (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "action_steps" jsonb;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "current_version_id" uuid;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "documentation_notes" text;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "legal_update_required" boolean DEFAULT false;
ALTER TABLE public.practice_cases ALTER COLUMN "legal_update_required" SET NOT NULL;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "quality_grade" text;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "responsible_roles" jsonb;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "risk_notes" text;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "traffic_light" text;
ALTER TABLE public.practice_cases ADD COLUMN IF NOT EXISTS "updated_by" uuid;
ALTER TABLE public.practice_cases ALTER COLUMN "ampel" DROP NOT NULL;
-- Nachträgliche Korrektur: public.practice_categories (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.practice_categories ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public.practice_categories ADD COLUMN IF NOT EXISTS "icon" text;
-- Nachträgliche Korrektur: public.roles (Datei supabase/migrations/20260704145904_fc63b5d3-23b7-4027-8f22-99cdec0aec9b.sql)
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();

-- ===== supabase/migrations/20260704152758_8bb0c6d5-575d-4227-85c8-f38da854d6f4.sql =====

-- Drop existing permissive write policies
DROP POLICY IF EXISTS "ck write anon pilot" ON public.case_keywords;
DROP POLICY IF EXISTS "links write anon pilot" ON public.case_legal_links;
DROP POLICY IF EXISTS "tpl write anon pilot" ON public.document_templates;
DROP POLICY IF EXISTS "kw write anon pilot" ON public.keywords;
DROP POLICY IF EXISTS "sections write anon pilot" ON public.legal_sections;
DROP POLICY IF EXISTS "sources write anon pilot" ON public.legal_sources;
DROP POLICY IF EXISTS "cases write anon pilot" ON public.practice_cases;
DROP POLICY IF EXISTS "cat write anon pilot" ON public.practice_categories;

-- Revoke write privileges from anon and authenticated roles (SELECT stays)
REVOKE INSERT, UPDATE, DELETE ON
  public.case_keywords,
  public.case_legal_links,
  public.document_templates,
  public.keywords,
  public.legal_sections,
  public.legal_sources,
  public.practice_cases,
  public.practice_categories
FROM anon, authenticated;

-- Ensure service_role retains full access for future admin backend
GRANT ALL ON
  public.case_keywords,
  public.case_legal_links,
  public.document_templates,
  public.keywords,
  public.legal_sections,
  public.legal_sources,
  public.practice_cases,
  public.practice_categories
TO service_role;


-- ===== supabase/migrations/20260705140000_restore_pilot_write_access.sql =====
-- Pilotphase: Schreibrechte auf Redaktionstabellen wiederherstellen.
GRANT INSERT, UPDATE, DELETE ON
  public.case_keywords,
  public.case_legal_links,
  public.document_templates,
  public.keywords,
  public.legal_sections,
  public.legal_sources,
  public.practice_cases,
  public.practice_categories
TO anon, authenticated;

DROP POLICY IF EXISTS "cases write pilot" ON public.practice_cases;
CREATE POLICY "cases write pilot" ON public.practice_cases FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ck write pilot" ON public.case_keywords;
CREATE POLICY "ck write pilot" ON public.case_keywords FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "links write pilot" ON public.case_legal_links;
CREATE POLICY "links write pilot" ON public.case_legal_links FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tpl write pilot" ON public.document_templates;
CREATE POLICY "tpl write pilot" ON public.document_templates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "kw write pilot" ON public.keywords;
CREATE POLICY "kw write pilot" ON public.keywords FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sections write pilot" ON public.legal_sections;
CREATE POLICY "sections write pilot" ON public.legal_sections FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sources write pilot" ON public.legal_sources;
CREATE POLICY "sources write pilot" ON public.legal_sources FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cat write pilot" ON public.practice_categories;
CREATE POLICY "cat write pilot" ON public.practice_categories FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';


-- ===== scripts/_early_types.sql =====
-- ===== Vorgezogene Enum-Typen (werden in einem Backfill-Block referenziert, bevor ihre eigentliche Definition läuft) =====
DO $$
BEGIN
  IF to_regtype('public.case_workflow_status') IS NULL THEN
    CREATE TYPE public.case_workflow_status AS ENUM (
      'draft',
      'in_review',
      'approved',
      'published',
      'archived'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.case_publication_tier') IS NULL THEN
    CREATE TYPE public.case_publication_tier AS ENUM (
      'internal',
      'beta',
      'public',
      'premium'
    );
  END IF;
END $$;


-- ===== scripts/_missing_tables_create.sql =====
-- ===== Rekonstruierte Basistabellen: nur Struktur + Grants (Policies folgen ganz am Ende) =====
CREATE TABLE IF NOT EXISTS public.audit_logs (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "action" text NOT NULL,
  "table_name" text,
  "record_id" uuid,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.audit_logs TO service_role;

CREATE TABLE IF NOT EXISTS public.case_related_cases (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid,
  "related_case_id" uuid,
  "relation_type" text DEFAULT 'verwandt'::text,
  "explanation" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.case_related_cases ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.case_related_cases TO anon;
GRANT DELETE ON TABLE public.case_related_cases TO authenticated;
GRANT INSERT ON TABLE public.case_related_cases TO authenticated;
GRANT SELECT ON TABLE public.case_related_cases TO authenticated;
GRANT UPDATE ON TABLE public.case_related_cases TO authenticated;
GRANT ALL ON TABLE public.case_related_cases TO service_role;

CREATE TABLE IF NOT EXISTS public.case_roles (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid,
  "role_id" uuid,
  "responsibility" text,
  "priority" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.case_roles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.case_roles TO service_role;

CREATE TABLE IF NOT EXISTS public.case_templates (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid,
  "template_id" uuid,
  "relevance" text DEFAULT 'mittel'::text,
  "explanation" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.case_templates TO anon;
GRANT DELETE ON TABLE public.case_templates TO authenticated;
GRANT INSERT ON TABLE public.case_templates TO authenticated;
GRANT SELECT ON TABLE public.case_templates TO authenticated;
GRANT UPDATE ON TABLE public.case_templates TO authenticated;
GRANT ALL ON TABLE public.case_templates TO service_role;

CREATE TABLE IF NOT EXISTS public.decision_trees (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "tree_data" jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.decision_trees ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.decision_trees TO anon;
GRANT DELETE ON TABLE public.decision_trees TO authenticated;
GRANT INSERT ON TABLE public.decision_trees TO authenticated;
GRANT SELECT ON TABLE public.decision_trees TO authenticated;
GRANT UPDATE ON TABLE public.decision_trees TO authenticated;
GRANT ALL ON TABLE public.decision_trees TO service_role;

CREATE TABLE IF NOT EXISTS public.education_programs (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "school_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.education_programs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.education_programs TO service_role;

CREATE TABLE IF NOT EXISTS public.faq_entries (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "sort_order" integer DEFAULT 0,
  "status" text DEFAULT 'published'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.faq_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.faq_entries TO anon;
GRANT DELETE ON TABLE public.faq_entries TO authenticated;
GRANT INSERT ON TABLE public.faq_entries TO authenticated;
GRANT SELECT ON TABLE public.faq_entries TO authenticated;
GRANT UPDATE ON TABLE public.faq_entries TO authenticated;
GRANT ALL ON TABLE public.faq_entries TO service_role;

CREATE TABLE IF NOT EXISTS public.favorites (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "case_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.favorites TO service_role;

CREATE TABLE IF NOT EXISTS public.legal_changes (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "legal_section_id" uuid,
  "change_type" text,
  "old_text" text,
  "new_text" text,
  "change_note" text,
  "detected_at" timestamp with time zone DEFAULT now(),
  "status" text DEFAULT 'needs_review'::text,
  PRIMARY KEY ("id")
);
ALTER TABLE public.legal_changes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.legal_changes TO anon;
GRANT DELETE ON TABLE public.legal_changes TO authenticated;
GRANT INSERT ON TABLE public.legal_changes TO authenticated;
GRANT SELECT ON TABLE public.legal_changes TO authenticated;
GRANT UPDATE ON TABLE public.legal_changes TO authenticated;
GRANT ALL ON TABLE public.legal_changes TO service_role;

CREATE TABLE IF NOT EXISTS public.practice_subcategories (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "category_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.practice_subcategories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.practice_subcategories TO anon;
GRANT DELETE ON TABLE public.practice_subcategories TO authenticated;
GRANT INSERT ON TABLE public.practice_subcategories TO authenticated;
GRANT SELECT ON TABLE public.practice_subcategories TO authenticated;
GRANT UPDATE ON TABLE public.practice_subcategories TO authenticated;
GRANT ALL ON TABLE public.practice_subcategories TO service_role;

CREATE TABLE IF NOT EXISTS public.schools (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "short_name" text,
  "city" text,
  "status" text DEFAULT 'active'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.schools TO service_role;

CREATE TABLE IF NOT EXISTS public.case_versions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public.case_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.case_versions TO service_role;



-- ===== db/2026-07-05_document_templates_rls_pilot.sql =====
-- Pilotbetrieb: Schreibrechte für Dokumentationsvorlagen (analog practice_cases).
-- Idempotent. Nur public.document_templates und public.case_templates.
-- KEINE neue Tabelle, KEINE neue Spalte.

-- ============================================================
-- document_templates
-- ============================================================
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.document_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_templates TO authenticated;
GRANT ALL ON TABLE public.document_templates TO service_role;
-- Pilotphase: auch anon darf schreiben (kein Admin-Login aktiv).
GRANT INSERT, UPDATE, DELETE ON TABLE public.document_templates TO anon;

DROP POLICY IF EXISTS "Pilot write document_templates" ON public.document_templates;
CREATE POLICY "Pilot write document_templates"
  ON public.document_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- case_templates (Verknüpfung Praxisfall ↔ Vorlage)
-- ============================================================
ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.case_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_templates TO authenticated;
GRANT ALL ON TABLE public.case_templates TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.case_templates TO anon;

DROP POLICY IF EXISTS "Public read case_templates" ON public.case_templates;
CREATE POLICY "Public read case_templates"
  ON public.case_templates
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Pilot write case_templates" ON public.case_templates;
CREATE POLICY "Pilot write case_templates"
  ON public.case_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-05_extend_legal_sources_and_sections.sql =====
-- ============================================================
-- OBSOLETE / NICHT MEHR AUSFÜHREN
-- ------------------------------------------------------------
-- Diese Datei ist absichtlich leer. Frühere Versionen enthielten
-- riskante Rename-Blöcke (u. a. legal_section_id → section_id),
-- die nicht mit dem realen Live-Schema übereinstimmen.
--
-- Verbindliche Quelle für Schema-Änderungen:
--   db/2026-07-06_schema_introspection.sql   (Snapshot-Funktion)
--   scripts/schema-check.mjs                 (Validator)
--   db/schema.lock.json                      (Lockfile)
--
-- Falls Sie diese Datei früher bereits ausgeführt haben und
-- dabei Spalten falsch umbenannt wurden, bitte manuell im
-- Supabase-Editor prüfen. Neue Migrationen werden nach Bedarf
-- separat erzeugt.
-- ============================================================
SELECT 1;


-- ===== db/2026-07-06_schema_introspection.sql =====
-- ============================================================
-- Schema-Introspektion für den Schema Validator
-- ------------------------------------------------------------
-- Einmalig im Supabase SQL-Editor (Projekt mabbwunovhjaopnmzpfv)
-- ausführen. Idempotent.
--
-- Stellt die Funktion public.__schema_snapshot() bereit,
-- die Tabellen, Spalten, Foreign Keys, Indizes und RLS-Policies
-- des Schemas `public` als JSON liefert. Aufruf via PostgREST RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.__schema_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH cols AS (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',        c.column_name,
          'type',        c.data_type,
          'udt',         c.udt_name,
          'nullable',    (c.is_nullable = 'YES'),
          'default',     c.column_default
        )
        ORDER BY c.ordinal_position
      ) AS columns
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    GROUP BY c.table_name
  ),
  pks AS (
    SELECT
      tc.table_name,
      jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS pk
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema  = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    GROUP BY tc.table_name
  ),
  fks AS (
    SELECT
      tc.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',              tc.constraint_name,
          'column',            kcu.column_name,
          'referenced_table',  ccu.table_name,
          'referenced_column', ccu.column_name
        )
      ) AS fks
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema  = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema  = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    GROUP BY tc.table_name
  ),
  policies AS (
    SELECT
      p.tablename AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',       p.policyname,
          'permissive', p.permissive,
          'roles',      p.roles,
          'command',    p.cmd,
          'using',      p.qual,
          'check',      p.with_check
        )
      ) AS policies
    FROM pg_policies p
    WHERE p.schemaname = 'public'
    GROUP BY p.tablename
  ),
  rls AS (
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  tables AS (
    SELECT
      t.table_name,
      jsonb_build_object(
        'name',        t.table_name,
        'columns',     COALESCE(cols.columns, '[]'::jsonb),
        'primary_key', COALESCE(pks.pk, '[]'::jsonb),
        'foreign_keys',COALESCE(fks.fks, '[]'::jsonb),
        'policies',    COALESCE(policies.policies, '[]'::jsonb),
        'rls_enabled', COALESCE(rls.enabled, false)
      ) AS entry
    FROM information_schema.tables t
    LEFT JOIN cols     ON cols.table_name     = t.table_name
    LEFT JOIN pks      ON pks.table_name      = t.table_name
    LEFT JOIN fks      ON fks.table_name      = t.table_name
    LEFT JOIN policies ON policies.table_name = t.table_name
    LEFT JOIN rls      ON rls.table_name      = t.table_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'tables', jsonb_object_agg(table_name, entry)
  )
  FROM tables;
$$;

REVOKE ALL ON FUNCTION public.__schema_snapshot() FROM public;
GRANT EXECUTE ON FUNCTION public.__schema_snapshot() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.__schema_snapshot() IS
  'Read-only schema snapshot used by scripts/schema-check.mjs. Safe to expose to anon (no data, only metadata).';


-- ===== db/2026-07-07_legal_sections_editorial_fields.sql =====
-- ============================================================
-- Editorial fields for public.legal_sections
-- ------------------------------------------------------------
-- Idempotent. Ergänzt die im Rechtsquellen-Manager verwendeten
-- redaktionellen Felder und lädt den PostgREST-Schema-Cache neu.
--
-- Ausführen im Supabase SQL-Editor (Projekt mabbwunovhjaopnmzpfv).
-- Anschließend:  bun run schema:update && bun run schema:check
-- ============================================================

ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS summary             text,
  ADD COLUMN IF NOT EXISTS practice_relevance  text,
  ADD COLUMN IF NOT EXISTS recommendation      text,
  ADD COLUMN IF NOT EXISTS common_mistakes     text,
  ADD COLUMN IF NOT EXISTS related_section_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_reviewed_at    date;

COMMENT ON COLUMN public.legal_sections.summary             IS 'Kurzbeschreibung der Rechtsnorm (redaktionell).';
COMMENT ON COLUMN public.legal_sections.practice_relevance  IS 'Praxisbedeutung für Schulleitungen (redaktionell).';
COMMENT ON COLUMN public.legal_sections.recommendation      IS 'Handlungsempfehlung – keine Rechtsberatung.';
COMMENT ON COLUMN public.legal_sections.common_mistakes     IS 'Typische Fehler / Fallstricke (redaktionell).';
COMMENT ON COLUMN public.legal_sections.related_section_ids IS 'Verknüpfte legal_sections (Array von UUIDs).';
COMMENT ON COLUMN public.legal_sections.last_reviewed_at    IS 'Datum der letzten fachlichen Prüfung.';

-- PostgREST Schema-Cache neu laden.
NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-07_legal_sections_rls_pilot.sql =====
-- Pilotbetrieb: RLS für legal_sections analog zu practice_cases.
-- Idempotent: kann mehrfach ausgeführt werden.
-- Betrifft ausschließlich public.legal_sections.

ALTER TABLE public.legal_sections ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.legal_sections TO authenticated;

DROP POLICY IF EXISTS "Pilot: SELECT legal_sections" ON public.legal_sections;
DROP POLICY IF EXISTS "Pilot: INSERT legal_sections" ON public.legal_sections;
DROP POLICY IF EXISTS "Pilot: UPDATE legal_sections" ON public.legal_sections;
DROP POLICY IF EXISTS "Pilot: DELETE legal_sections" ON public.legal_sections;

CREATE POLICY "Pilot: SELECT legal_sections"
  ON public.legal_sections
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pilot: INSERT legal_sections"
  ON public.legal_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Pilot: UPDATE legal_sections"
  ON public.legal_sections
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Pilot: DELETE legal_sections"
  ON public.legal_sections
  FOR DELETE
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-08_legal_import_tracking.sql =====
-- ============================================================
-- Import-Tracking für offizielle Rechtsquellen
-- ------------------------------------------------------------
-- Ergänzt legal_sections um Felder, die den Ursprung eines
-- importierten Abschnitts nachvollziehbar machen.
--
-- Idempotent. Bitte im Supabase SQL-Editor ausführen und
-- anschließend `bun run schema:update && bun run schema:check`.
-- ============================================================

ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS import_url  text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_hash text;

COMMENT ON COLUMN public.legal_sections.import_url  IS 'URL, aus der dieser Abschnitt zuletzt importiert wurde.';
COMMENT ON COLUMN public.legal_sections.imported_at IS 'Zeitpunkt des letzten Imports aus der offiziellen Quelle.';
COMMENT ON COLUMN public.legal_sections.source_hash IS 'Kurzer Hash über den offiziellen Volltext (zur Änderungserkennung beim Re-Import).';

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-09_import_jobs.sql =====
-- ============================================================
-- Import-Job-System für Rechtsquellen (Pilot-Policies)
-- ------------------------------------------------------------
-- Legt import_jobs + import_job_items an und ergänzt
-- legal_sections.import_job_id.
--
-- Pilot: offene Policies (USING true / WITH CHECK true), RLS
-- aktiv. Später durch echte Rollenrechte ersetzen.
--
-- Idempotent. Im Supabase SQL-Editor ausführen, danach
-- `bun run schema:update && bun run schema:check`.
-- ============================================================

-- 1) Tabelle import_jobs -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid REFERENCES public.legal_sources(id) ON DELETE SET NULL,
  source_url        text,
  status            text NOT NULL DEFAULT 'running',   -- running | succeeded | failed | cancelled
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  duration_ms       integer,
  detected_count    integer NOT NULL DEFAULT 0,
  imported_count    integer NOT NULL DEFAULT 0,
  updated_count     integer NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  enriched_count    integer NOT NULL DEFAULT 0,
  error_count       integer NOT NULL DEFAULT 0,
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 2) Tabelle import_job_items -------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_job_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  section_number text,
  title          text,
  section_id     uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  action         text NOT NULL,   -- inserted | updated | skipped | failed | enriched
  error          text,
  source_hash    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3) legal_sections: import_job_id nachrüsten ---------------------------
ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS import_job_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'legal_sections'
      AND constraint_name = 'legal_sections_import_job_id_fkey'
  ) THEN
    ALTER TABLE public.legal_sections
      ADD CONSTRAINT legal_sections_import_job_id_fkey
      FOREIGN KEY (import_job_id) REFERENCES public.import_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_legal_sections_import_job_id
  ON public.legal_sections(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_job_items_job_id
  ON public.import_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_source_id
  ON public.import_jobs(source_id);

-- 4) Grants -------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_job_items TO anon, authenticated;
GRANT ALL ON public.import_jobs      TO service_role;
GRANT ALL ON public.import_job_items TO service_role;

-- 5) Row Level Security -------------------------------------------------
ALTER TABLE public.import_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_job_items ENABLE ROW LEVEL SECURITY;

-- Alte Admin-Policies entfernen, falls aus früherer Migration vorhanden
DROP POLICY IF EXISTS import_jobs_admin_all      ON public.import_jobs;
DROP POLICY IF EXISTS import_job_items_admin_all ON public.import_job_items;

-- Pilot-Policies: offen (später durch Rollenrechte ersetzen) ------------
DO $$
BEGIN
  -- import_jobs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_select_import_jobs') THEN
    CREATE POLICY pilot_select_import_jobs ON public.import_jobs
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_insert_import_jobs') THEN
    CREATE POLICY pilot_insert_import_jobs ON public.import_jobs
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_update_import_jobs') THEN
    CREATE POLICY pilot_update_import_jobs ON public.import_jobs
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_delete_import_jobs') THEN
    CREATE POLICY pilot_delete_import_jobs ON public.import_jobs
      FOR DELETE TO anon, authenticated USING (true);
  END IF;

  -- import_job_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_select_import_job_items') THEN
    CREATE POLICY pilot_select_import_job_items ON public.import_job_items
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_insert_import_job_items') THEN
    CREATE POLICY pilot_insert_import_job_items ON public.import_job_items
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_update_import_job_items') THEN
    CREATE POLICY pilot_update_import_job_items ON public.import_job_items
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_delete_import_job_items') THEN
    CREATE POLICY pilot_delete_import_job_items ON public.import_job_items
      FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE  public.import_jobs      IS 'Import-Job-Manager: ein Datensatz je Rechtsquellen-Import. Pilot-Policies offen.';
COMMENT ON TABLE  public.import_job_items IS 'Detailprotokoll pro Abschnitt eines Import-Jobs. Pilot-Policies offen.';
COMMENT ON COLUMN public.legal_sections.import_job_id
  IS 'Referenz auf import_jobs.id. Nur importierte Abschnitte tragen einen Wert; manuell gepflegte bleiben NULL.';

NOTIFY pgrst, 'reload schema';


-- Nachträgliche Korrektur: public.import_job_items (Datei db/2026-07-09_import_jobs.sql)
ALTER TABLE public.import_job_items ADD COLUMN IF NOT EXISTS "error" text;
-- Nachträgliche Korrektur: public.import_jobs (Datei db/2026-07-09_import_jobs.sql)
ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.import_jobs ALTER COLUMN "started_at" SET NOT NULL;

-- ===== db/2026-07-10_legal_sources_form_columns.sql =====
-- ============================================================
-- Rechtsquellen-Formular: fehlende Spalten idempotent ergänzen
-- ------------------------------------------------------------
-- Das Formular "Neue Rechtsquelle" (Core Builder) schreibt
-- Kurzname (name), Rechtsgebiet, Geltungsbereich, Beschreibung.
-- Im Live-Schema fehlten description, legal_area, scope,
-- short_name sowie die Datumsfelder. Ausserdem ist source_type
-- NOT NULL, das Formular liefert es aber nicht.
--
-- Diese Migration ergaenzt die Spalten ohne bestehende Daten
-- zu beruehren und laedt den PostgREST Schema-Cache neu.
-- ============================================================

ALTER TABLE public.legal_sources
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS legal_area text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS last_reviewed_at date;

-- source_type ist bislang NOT NULL. Das Formular liefert keinen
-- Wert. Wir setzen einen sinnvollen Default und lockern NOT NULL,
-- damit Bestandslogik unveraendert weiterlaeuft.
ALTER TABLE public.legal_sources
  ALTER COLUMN source_type DROP NOT NULL,
  ALTER COLUMN source_type SET DEFAULT 'law';

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-11_legal_import_pages.sql =====
-- ============================================================================
-- Migration: legal_import_pages (BASS-Import-Manifest) - Pilot-RLS
-- Datum:     2026-07-11 (korrigiert)
-- Zweck:     Vollständige Import-Übersicht je gecrawlter Vorschriftenseite.
--            Ermöglicht Chunking, Resume, Fortschrittsanzeige und
--            Wissenskarten-Abdeckung.
--
-- Hinweis:   Das externe Supabase-Projekt besitzt aktuell KEINE has_role-
--            Funktion. Für den Pilotbetrieb werden daher offene Pilot-RLS-
--            Policies verwendet (analog zu legal_sections_rls_pilot).
--
-- Idempotent: alle Statements sind mit IF (NOT) EXISTS / DROP IF EXISTS oder
-- DO-Blöcken abgesichert und können mehrfach ausgeführt werden – auch nach
-- einem teilweise fehlgeschlagenen ersten Durchlauf.
-- ============================================================================

-- 1) Status-Enum ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'legal_import_page_status') then
    create type public.legal_import_page_status as enum (
      'discovered',
      'imported',
      'partial',
      'error',
      'skipped'
    );
  end if;
end$$;

-- 2) Manifest-Tabelle -------------------------------------------------------
create table if not exists public.legal_import_pages (
  id                       uuid primary key default gen_random_uuid(),
  source_id                uuid not null references public.legal_sources(id) on delete cascade,
  import_job_id            uuid null references public.import_jobs(id) on delete set null,
  url                      text not null,
  normalized_url           text not null,
  title                    text null,
  bass_number              text null,
  crawl_depth              integer not null default 0,
  status                   public.legal_import_page_status not null default 'discovered',
  section_count            integer not null default 0,
  imported_section_count   integer not null default 0,
  knowledge_card_count     integer not null default 0,
  source_hash              text null,
  last_seen_at             timestamptz not null default now(),
  last_imported_at         timestamptz null,
  error_message            text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Falls die Tabelle in einer früheren Version ohne einzelne Spalten angelegt
-- wurde, hier defensiv nachziehen (idempotent).
alter table public.legal_import_pages add column if not exists import_job_id uuid null references public.import_jobs(id) on delete set null;
alter table public.legal_import_pages add column if not exists title text null;
alter table public.legal_import_pages add column if not exists bass_number text null;
alter table public.legal_import_pages add column if not exists crawl_depth integer not null default 0;
alter table public.legal_import_pages add column if not exists section_count integer not null default 0;
alter table public.legal_import_pages add column if not exists imported_section_count integer not null default 0;
alter table public.legal_import_pages add column if not exists knowledge_card_count integer not null default 0;
alter table public.legal_import_pages add column if not exists source_hash text null;
alter table public.legal_import_pages add column if not exists last_seen_at timestamptz not null default now();
alter table public.legal_import_pages add column if not exists last_imported_at timestamptz null;
alter table public.legal_import_pages add column if not exists error_message text null;

-- Unique (source_id, normalized_url) für Upsert / Dublettenschutz
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='legal_import_pages_source_normurl_key'
  ) then
    create unique index legal_import_pages_source_normurl_key
      on public.legal_import_pages(source_id, normalized_url);
  end if;
end$$;

create index if not exists legal_import_pages_source_idx  on public.legal_import_pages(source_id);
create index if not exists legal_import_pages_status_idx  on public.legal_import_pages(status);
create index if not exists legal_import_pages_job_idx     on public.legal_import_pages(import_job_id);
create index if not exists legal_import_pages_bass_idx    on public.legal_import_pages(bass_number);

-- updated_at Trigger
create or replace function public.tg_legal_import_pages_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_legal_import_pages_touch on public.legal_import_pages;
create trigger trg_legal_import_pages_touch
  before update on public.legal_import_pages
  for each row execute function public.tg_legal_import_pages_touch();

-- 3) Verknüpfung Abschnitt <-> Manifest-Seite -------------------------------
alter table public.legal_sections
  add column if not exists import_manifest_id uuid null
  references public.legal_import_pages(id) on delete set null;

create index if not exists legal_sections_import_manifest_idx
  on public.legal_sections(import_manifest_id);

-- 4) Grants -----------------------------------------------------------------
grant select, insert, update, delete on public.legal_import_pages to anon, authenticated;
grant all on public.legal_import_pages to service_role;

-- 5) Row Level Security (Pilot) --------------------------------------------
alter table public.legal_import_pages enable row level security;

-- Alte (fehlerhafte) Policies entfernen, falls vorhanden
drop policy if exists legal_import_pages_select_auth on public.legal_import_pages;
drop policy if exists legal_import_pages_write_admin on public.legal_import_pages;
drop policy if exists "legal_import_pages pilot all" on public.legal_import_pages;

-- Pilot-Policy: offener Zugriff für anon + authenticated
create policy "legal_import_pages pilot all"
  on public.legal_import_pages
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 6) Schema-Cache neu laden -------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- Fertig. Nach dem Ausführen:
--   bun run schema:update
--   bun run schema:check
-- ============================================================================


-- ===== db/2026-07-12_case_documents.sql =====
-- Fallspezifische Dokumententwürfe.
-- Idempotent. Speichert KI-generierte Dokumente pro Praxisfall + Vorlage.
-- KEINE Änderung an bestehenden Tabellen.

CREATE TABLE IF NOT EXISTS public.case_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  template_id          uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  title                text NOT NULL,
  content              text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'draft',
  quality              text,
  open_issues          jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_sources         jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_metadata  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_documents_case_idx ON public.case_documents(case_id);
CREATE INDEX IF NOT EXISTS case_documents_template_idx ON public.case_documents(template_id);

ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.case_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_documents TO authenticated;
GRANT ALL ON TABLE public.case_documents TO service_role;
-- Pilotphase: auch anon darf schreiben (analog document_templates / case_templates).
GRANT INSERT, UPDATE, DELETE ON TABLE public.case_documents TO anon;

DROP POLICY IF EXISTS "Public read case_documents" ON public.case_documents;
CREATE POLICY "Public read case_documents"
  ON public.case_documents
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Pilot write case_documents" ON public.case_documents;
CREATE POLICY "Pilot write case_documents"
  ON public.case_documents
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_case_documents_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS case_documents_set_updated_at ON public.case_documents;
CREATE TRIGGER case_documents_set_updated_at
  BEFORE UPDATE ON public.case_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_case_documents_updated_at();

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-13_case_feedback_reports.sql =====
-- Nutzer-Feedback / Fehlermeldungen zu Praxisfällen.
-- Idempotent. Analog Pilot-Architektur (document_templates / case_documents).
-- KEINE Änderung an bestehenden Tabellen.

CREATE TABLE IF NOT EXISTS public.case_feedback_reports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 uuid REFERENCES public.practice_cases(id) ON DELETE SET NULL,
  case_title              text,
  user_id                 uuid,
  report_type             text NOT NULL,
  message                 text NOT NULL,
  urgency                 text NOT NULL DEFAULT 'medium',
  route                   text,
  reported_area           text,
  status                  text NOT NULL DEFAULT 'open',
  admin_notes             text,
  quality_task_reference  text,
  resolved_at             timestamptz,
  resolved_by             uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_feedback_reports_status_chk
    CHECK (status IN ('open','in_review','quality_check','resolved','rejected')),
  CONSTRAINT case_feedback_reports_urgency_chk
    CHECK (urgency IN ('low','medium','high')),
  CONSTRAINT case_feedback_reports_message_chk
    CHECK (char_length(btrim(message)) >= 5)
);

CREATE INDEX IF NOT EXISTS case_feedback_reports_case_idx    ON public.case_feedback_reports(case_id);
CREATE INDEX IF NOT EXISTS case_feedback_reports_status_idx  ON public.case_feedback_reports(status);
CREATE INDEX IF NOT EXISTS case_feedback_reports_created_idx ON public.case_feedback_reports(created_at DESC);

ALTER TABLE public.case_feedback_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.case_feedback_reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_feedback_reports TO authenticated;
GRANT ALL ON TABLE public.case_feedback_reports TO service_role;
-- Pilotphase: anon darf Meldungen anlegen und (im Adminbereich) verwalten.
GRANT INSERT, UPDATE, DELETE ON TABLE public.case_feedback_reports TO anon;

DROP POLICY IF EXISTS "Public read case_feedback_reports" ON public.case_feedback_reports;
CREATE POLICY "Public read case_feedback_reports"
  ON public.case_feedback_reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Pilot write case_feedback_reports" ON public.case_feedback_reports;
CREATE POLICY "Pilot write case_feedback_reports"
  ON public.case_feedback_reports
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_case_feedback_reports_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS case_feedback_reports_set_updated_at ON public.case_feedback_reports;
CREATE TRIGGER case_feedback_reports_set_updated_at
  BEFORE UPDATE ON public.case_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_case_feedback_reports_updated_at();

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-14_practice_case_search_embeddings.sql =====
-- Semantische Suchindex-Tabelle für Praxisfälle.
-- Externes Supabase (nicht Lovable Cloud). Idempotent. Muss manuell ausgeführt werden.
-- Modell: openai/text-embedding-3-small via Lovable AI Gateway (1536 Dimensionen).
-- Bei Modellwechsel Spalte vector(<dims>) anpassen.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.practice_case_search_embeddings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  embedding        vector(1536) NOT NULL,
  content_hash     text NOT NULL,
  embedding_model  text NOT NULL DEFAULT 'openai/text-embedding-3-small',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_case_search_embeddings_case_uk UNIQUE (case_id)
);

-- HNSW-Index direkt (<= 2000 dims, kein halfvec-Cast nötig).
CREATE INDEX IF NOT EXISTS practice_case_search_embeddings_hnsw_idx
  ON public.practice_case_search_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS practice_case_search_embeddings_case_idx
  ON public.practice_case_search_embeddings(case_id);

ALTER TABLE public.practice_case_search_embeddings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.practice_case_search_embeddings TO anon;
GRANT SELECT ON TABLE public.practice_case_search_embeddings TO authenticated;
GRANT ALL    ON TABLE public.practice_case_search_embeddings TO service_role;

-- Pilot-RLS analog vorhandener Architektur. Ohne has_role().
DROP POLICY IF EXISTS "search_embeddings_read_public" ON public.practice_case_search_embeddings;
CREATE POLICY "search_embeddings_read_public"
  ON public.practice_case_search_embeddings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes ausschließlich service_role (RLS blockt anon/authenticated implizit).

-- Match-RPC: sucht ähnliche veröffentlichte Praxisfälle über Cosine-Distance.
-- Rückgabe: case_id + similarity in 0..1 (1 = identisch). Filtert published.
CREATE OR REPLACE FUNCTION public.match_practice_case_embeddings (
  query_embedding vector(1536),
  match_count     int DEFAULT 25
)
RETURNS TABLE (
  case_id    uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.case_id,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.practice_case_search_embeddings e
  INNER JOIN public.practice_cases c ON c.id = e.case_id
  WHERE c.status = 'published'
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_practice_case_embeddings(vector, int) TO anon, authenticated, service_role;


-- ===== db/2026-07-14_search_testset_overrides.sql =====
-- Ground-Truth-Overrides für das Suchtest-Set (/admin/suchtest → Editor).
-- Ersetzt/erweitert die statische SEARCH_TESTSET-Definition redaktionell,
-- ohne dass Code-Änderungen nötig sind. Idempotent. Manuell ausführen.

CREATE TABLE IF NOT EXISTS public.search_testset_overrides (
  test_id             text PRIMARY KEY,
  expected_case_ids   uuid[] NOT NULL DEFAULT '{}',
  acceptable_case_ids uuid[] NOT NULL DEFAULT '{}',
  audit               text,
  note                text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.search_testset_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_testset_overrides TO authenticated;
GRANT ALL ON public.search_testset_overrides TO service_role;

ALTER TABLE public.search_testset_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "testset_overrides_read_public" ON public.search_testset_overrides;
CREATE POLICY "testset_overrides_read_public"
  ON public.search_testset_overrides
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "testset_overrides_write_authenticated" ON public.search_testset_overrides;
CREATE POLICY "testset_overrides_write_authenticated"
  ON public.search_testset_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.search_testset_overrides_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS search_testset_overrides_touch_tg ON public.search_testset_overrides;
CREATE TRIGGER search_testset_overrides_touch_tg
  BEFORE UPDATE ON public.search_testset_overrides
  FOR EACH ROW EXECUTE FUNCTION public.search_testset_overrides_touch();


-- ===== db/2026-07-23_user_profiles_and_roles.sql =====
-- Sprint 1.1: Produktive Authentifizierung & Rollenmodell.
-- Ersetzt die frühere Dummy-Auth. Nur diese Tabelle/Enum/Policies sind neu;
-- bestehende Tabellen und Policies bleiben unangetastet.
-- Idempotent: darf mehrfach ausgeführt werden.

-- 1) Rollen-Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('teacher','editor','reviewer','admin','superadmin');
  end if;
end $$;

-- 2) user_profiles Tabelle
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role public.app_role not null default 'teacher',
  organization text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Grants (Data API)
grant select on public.user_profiles to authenticated;
grant update (display_name, organization) on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

-- 4) RLS
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles: self select" on public.user_profiles;
create policy "user_profiles: self select"
  on public.user_profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "user_profiles: self update" on public.user_profiles;
create policy "user_profiles: self update"
  on public.user_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 5) Security-Definer Rollen-Helfer (bricht keine RLS-Rekursion aus)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = _user_id and role = _role
  )
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_app_role() to authenticated;

-- Admin-Übersicht: alle Profile lesen dürfen admin/superadmin
drop policy if exists "user_profiles: admin read all" on public.user_profiles;
create policy "user_profiles: admin read all"
  on public.user_profiles for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  );

drop policy if exists "user_profiles: admin write all" on public.user_profiles;
create policy "user_profiles: admin write all"
  on public.user_profiles for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  );

-- 6) Trigger: Profil beim Signup anlegen (Standardrolle teacher)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) updated_at Autowartung
create or replace function public.touch_user_profiles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_user_profiles_updated_at();

notify pgrst, 'reload schema';


-- ===== db/2026-07-24_sprint_1_2_role_based_rls.sql =====
-- Sprint 1.2 — Rollenbasierte Datenbanksicherheit (RLS).
-- Ersetzt sämtliche Pilot-Policies (`USING (true)` für authenticated/anon-Schreiben)
-- durch rollenbasierte Policies auf Basis von public.has_role() bzw.
-- public.current_app_role() aus Sprint 1.1.
--
-- Regelwerk:
--   teacher     -> SELECT
--   editor      -> SELECT, INSERT, UPDATE
--   reviewer    -> SELECT, INSERT, UPDATE           (Freigabe = UPDATE)
--   admin       -> vollzugriff
--   superadmin  -> vollzugriff
--
-- Public Content (practice_cases, legal_sources, legal_sections,
-- case_legal_links, document_templates, case_templates, case_keywords,
-- keywords, legal_changes, faq_entries, decision_trees, case_related_cases,
-- practice_categories, practice_subcategories, practice_case_search_embeddings,
-- search_testset_overrides) bleibt für anon UND authenticated lesbar (SELECT).
-- Backoffice-Tabellen (import_jobs, import_job_items, legal_import_pages,
-- case_documents, case_feedback_reports) sind ausschließlich für Redaktions-
-- rollen lesbar.
--
-- Idempotent. Diese Migration darf mehrfach ausgeführt werden.
-- KEINE Schemaänderungen an Fachtabellen selbst.

BEGIN;

-- ============================================================
-- 1) Rollenprädikate als SECURITY DEFINER Funktionen
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('editor','reviewer','admin','superadmin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('reviewer','admin','superadmin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin','superadmin')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_editor()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_reviewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()    TO authenticated;

-- ============================================================
-- 2) Wiederverwendbare Applizierungsroutine
-- ============================================================
--   _tbl        : voll qualifizierter Tabellenname (public.xyz)
--   _select_anon: erlaubt anon SELECT? (öffentliche Inhaltstabelle)
--   _drop_names : Array bekannter Pilot-Policy-Namen zum Entfernen
--
-- Legt neue Policies an: <tbl>_select, <tbl>_write_editor,
-- <tbl>_update_editor, <tbl>_delete_admin. Vorhandene gleichnamige
-- Policies werden zuerst entfernt.

CREATE OR REPLACE FUNCTION public.__apply_role_rls(
  _tbl        regclass,
  _select_anon boolean,
  _drop_names  text[]
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pol text;
  short text := split_part(_tbl::text, '.', 2);
BEGIN
  -- 1. Pilot-/Alt-Policies entfernen
  FOREACH pol IN ARRAY COALESCE(_drop_names, ARRAY[]::text[]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol, _tbl::text);
  END LOOP;

  -- Vorherige rollenbasierte Policies dieser Migration ebenfalls entfernen
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short||'_role_select',       _tbl::text);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short||'_role_insert_editor',_tbl::text);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short||'_role_update_editor',_tbl::text);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short||'_role_delete_admin', _tbl::text);

  -- RLS sicherstellen
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _tbl::text);

  -- 2. Grants: anon nur SELECT (falls überhaupt), authenticated schreibt
  --    (RLS filtert), service_role bleibt Vollzugriff.
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE %s FROM anon', _tbl::text);
  IF _select_anon THEN
    EXECUTE format('GRANT SELECT ON TABLE %s TO anon', _tbl::text);
  ELSE
    EXECUTE format('REVOKE SELECT ON TABLE %s FROM anon', _tbl::text);
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO authenticated', _tbl::text);
  EXECUTE format('GRANT ALL ON TABLE %s TO service_role', _tbl::text);

  -- 3. Neue rollenbasierte Policies
  IF _select_anon THEN
    EXECUTE format($f$
      CREATE POLICY %I ON %s
        FOR SELECT TO anon, authenticated
        USING (true)
    $f$, short||'_role_select', _tbl::text);
  ELSE
    EXECUTE format($f$
      CREATE POLICY %I ON %s
        FOR SELECT TO authenticated
        USING (public.is_editor())
    $f$, short||'_role_select', _tbl::text);
  END IF;

  EXECUTE format($f$
    CREATE POLICY %I ON %s
      FOR INSERT TO authenticated
      WITH CHECK (public.is_editor())
  $f$, short||'_role_insert_editor', _tbl::text);

  EXECUTE format($f$
    CREATE POLICY %I ON %s
      FOR UPDATE TO authenticated
      USING (public.is_editor())
      WITH CHECK (public.is_editor())
  $f$, short||'_role_update_editor', _tbl::text);

  EXECUTE format($f$
    CREATE POLICY %I ON %s
      FOR DELETE TO authenticated
      USING (public.is_admin())
  $f$, short||'_role_delete_admin', _tbl::text);
END $$;

-- ============================================================
-- 3) Fachtabellen absichern
-- ============================================================

-- practice_cases: öffentlicher Katalog
SELECT public.__apply_role_rls(
  'public.practice_cases',
  true,
  ARRAY['Pilot write practice cases','Public read practice cases']
);

-- legal_sources: öffentlich
SELECT public.__apply_role_rls(
  'public.legal_sources',
  true,
  ARRAY['legal_sources pilot all','Public read legal sources']
);

-- legal_sections: öffentlich
SELECT public.__apply_role_rls(
  'public.legal_sections',
  true,
  ARRAY[
    'Pilot: INSERT legal_sections','Pilot: SELECT legal_sections',
    'Pilot: UPDATE legal_sections','Pilot: DELETE legal_sections',
    'Public read legal sections'
  ]
);

-- case_legal_links: öffentlich
SELECT public.__apply_role_rls(
  'public.case_legal_links',
  true,
  ARRAY[
    'Pilot select case_legal_links','Pilot insert case_legal_links',
    'Pilot update case_legal_links','Pilot delete case_legal_links',
    'Public read case legal links'
  ]
);

-- document_templates: öffentlich
SELECT public.__apply_role_rls(
  'public.document_templates',
  true,
  ARRAY[
    'Pilot: SELECT document_templates','Pilot: INSERT document_templates',
    'Pilot: UPDATE document_templates','Pilot: DELETE document_templates',
    'Pilot write document_templates','Public read document templates'
  ]
);

-- case_templates: öffentlich
SELECT public.__apply_role_rls(
  'public.case_templates',
  true,
  ARRAY[
    'Pilot: SELECT case_templates','Pilot: INSERT case_templates',
    'Pilot: UPDATE case_templates','Pilot: DELETE case_templates',
    'Pilot write case_templates','Public read case_templates'
  ]
);

-- keywords: öffentlich lesbar
SELECT public.__apply_role_rls(
  'public.keywords',
  true,
  ARRAY['keywords pilot all','Public read keywords']
);

-- case_keywords: öffentlich lesbar
SELECT public.__apply_role_rls(
  'public.case_keywords',
  true,
  ARRAY['case_keywords pilot all','Public read case keywords']
);

-- decision_trees: öffentlich lesbar (aber nur published — Policy separat unten)
SELECT public.__apply_role_rls(
  'public.decision_trees',
  false,
  ARRAY['Public read published decision trees']
);
-- decision_trees zusätzlich: anon liest nur veröffentlichte
DROP POLICY IF EXISTS decision_trees_role_select ON public.decision_trees;
GRANT SELECT ON public.decision_trees TO anon;
CREATE POLICY decision_trees_role_select ON public.decision_trees
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    OR public.is_editor()
  );

-- legal_changes: öffentlich lesbar
DO $$ BEGIN
  IF to_regclass('public.legal_changes') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.legal_changes', true, ARRAY[]::text[]);
  END IF;
END $$;

-- faq_entries: anon liest nur published (bereits vorhanden), authenticated
--   Redaktion schreibt
DO $$ BEGIN
  IF to_regclass('public.faq_entries') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.faq_entries', false, ARRAY[]::text[]);
    -- alten public-Read wieder mitnehmen für anon (nur published)
    DROP POLICY IF EXISTS faq_entries_role_select ON public.faq_entries;
    EXECUTE 'GRANT SELECT ON public.faq_entries TO anon';
    CREATE POLICY faq_entries_role_select ON public.faq_entries
      FOR SELECT TO anon, authenticated
      USING (status = 'published' OR public.is_editor());
  END IF;
END $$;

-- practice_categories / practice_subcategories: öffentlich lesen, admin schreibt
DO $$ BEGIN
  IF to_regclass('public.practice_categories') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.practice_categories', true, ARRAY[]::text[]);
  END IF;
  IF to_regclass('public.practice_subcategories') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.practice_subcategories', true, ARRAY[]::text[]);
  END IF;
END $$;

-- case_related_cases (Linktabelle)
DO $$ BEGIN
  IF to_regclass('public.case_related_cases') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.case_related_cases', true, ARRAY[]::text[]);
  END IF;
END $$;

-- Backoffice-Tabellen: keine anon Reads
SELECT public.__apply_role_rls(
  'public.import_jobs',
  false,
  ARRAY[
    'pilot_select_import_jobs','pilot_insert_import_jobs',
    'pilot_update_import_jobs','pilot_delete_import_jobs'
  ]
);

SELECT public.__apply_role_rls(
  'public.import_job_items',
  false,
  ARRAY[
    'pilot_select_import_job_items','pilot_insert_import_job_items',
    'pilot_update_import_job_items','pilot_delete_import_job_items'
  ]
);

DO $$ BEGIN
  IF to_regclass('public.legal_import_pages') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.legal_import_pages', false,
      ARRAY['legal_import_pages pilot all']);
  END IF;
END $$;

-- case_documents: Backoffice-relevant (können Nutzerdokumente sein) →
-- anon darf nicht lesen; Redaktion voll.
DO $$ BEGIN
  IF to_regclass('public.case_documents') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.case_documents', false, ARRAY[
      'Public read case_documents','Pilot write case_documents'
    ]);
  END IF;
END $$;

-- case_feedback_reports: Backoffice
DO $$ BEGIN
  IF to_regclass('public.case_feedback_reports') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.case_feedback_reports', false, ARRAY[
      'Public read case_feedback_reports','Pilot write case_feedback_reports'
    ]);
  END IF;
END $$;

-- practice_case_search_embeddings: öffentlich lesbar, keine App-Schreibrechte
DO $$ BEGIN
  IF to_regclass('public.practice_case_search_embeddings') IS NOT NULL THEN
    -- Nur Reindex-Server (service_role) schreibt. Trotzdem rollenbasiert:
    -- Redaktion darf reindexen.
    PERFORM public.__apply_role_rls('public.practice_case_search_embeddings',
      true, ARRAY['search_embeddings_read_public']);
  END IF;
END $$;

-- search_testset_overrides
DO $$ BEGIN
  IF to_regclass('public.search_testset_overrides') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.search_testset_overrides', true, ARRAY[
      'testset_overrides_read_public','testset_overrides_write_authenticated'
    ]);
  END IF;
END $$;

-- Optionale, ggf. später hinzugekommene Tabellen (aus Aufgabenstellung)
DO $$ BEGIN
  IF to_regclass('public.legal_source_documents') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.legal_source_documents', true, ARRAY[]::text[]);
  END IF;
  IF to_regclass('public.legal_section_embeddings') IS NOT NULL THEN
    PERFORM public.__apply_role_rls('public.legal_section_embeddings', true, ARRAY[]::text[]);
  END IF;
END $$;

-- ============================================================
-- 4) Performance: Index auf user_profiles(id, role)
-- ============================================================
-- has_role()/is_editor()/is_admin() filtern über (id, role). PK auf id
-- reicht funktional, ein zusammengesetzter Index vermeidet Table-Access.
CREATE INDEX IF NOT EXISTS user_profiles_id_role_idx
  ON public.user_profiles(id, role);

-- ============================================================
-- 5) Aufräumen Helferfunktion (bleibt für Rerun idempotent verfügbar)
-- ============================================================
-- __apply_role_rls bewusst nicht droppen: erlaubt spätere Migrationen.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-25_editorial_schema.sql =====
-- Sprint 3.1 – Editorial Schema (revidiert nach SQL-Review)
--
-- Enthält:
--   * Enums für Workflow-, Publikations- und Review-Status
--   * Editorial-Spalten auf public.practice_cases
--   * Neue Tabellen: case_versions, case_reviews, case_events,
--     case_legal_review_flags
--   * Referentielle Integritätsgarantien: current_version_id,
--     case_reviews.case_version_id und case_events.case_version_id
--     dürfen ausschließlich auf eine Version desselben Falls zeigen
--     (zusammengesetzte Fremdschlüssel über (case_id, id)).
--   * RLS wird auf allen neuen Tabellen aktiviert, aber ohne Policies
--     (Policies folgen in Sprint 3.2).
--
-- Bewusst NICHT enthalten:
--   * Trigger
--   * RPCs
--   * RLS-Policies
--   * Änderungen an der Legacy-Spalte practice_cases.status
--   * Automatische Ableitung von quality_grade aus quality_score
--     (Grenzwerte sind noch nicht verbindlich dokumentiert; die
--     Ableitung erfolgt in Sprint 3.2. Bis dahin bleibt quality_grade
--     nullable und wird redaktionell/programmatisch gefüllt.)
--
-- Idempotent. Kann mehrfach ausgeführt werden.

BEGIN;

-- 1. Enums -------------------------------------------------------------------
--    Prüfung schema-spezifisch über to_regtype('public.<typ>').

DO $$
BEGIN
  IF to_regtype('public.case_workflow_status') IS NULL THEN
    CREATE TYPE public.case_workflow_status AS ENUM (
      'draft',
      'in_review',
      'approved',
      'published',
      'archived'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.case_publication_tier') IS NULL THEN
    CREATE TYPE public.case_publication_tier AS ENUM (
      'internal',
      'beta',
      'public',
      'premium'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.review_status') IS NULL THEN
    CREATE TYPE public.review_status AS ENUM (
      'pending',
      'approved',
      'changes_requested',
      'rejected',
      'cancelled'
    );
  END IF;
END $$;

-- 2. practice_cases erweitern -----------------------------------------------
--    Die Legacy-Spalte "status" bleibt unverändert.
--
--    Hinweis quality_grade:
--      Nullable text. Automatische Ableitung aus quality_score erfolgt
--      in Sprint 3.2, sobald die Grenzwerte verbindlich dokumentiert
--      sind. CHECK-Constraint erlaubt aktuell nur die Werte A|B|C|D
--      oder NULL, damit eine spätere GENERATED-STORED-Umstellung
--      möglich bleibt.

ALTER TABLE public.practice_cases
  ADD COLUMN IF NOT EXISTS workflow_status       public.case_workflow_status  NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS publication_tier      public.case_publication_tier NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS quality_score         numeric(5,2),
  ADD COLUMN IF NOT EXISTS quality_grade         text,
  ADD COLUMN IF NOT EXISTS legal_update_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS published_at          timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at           timestamptz,
  ADD COLUMN IF NOT EXISTS current_version_id    uuid;

-- CHECK-Constraint für quality_grade (nur A|B|C|D oder NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practice_cases_quality_grade_chk'
      AND conrelid = 'public.practice_cases'::regclass
  ) THEN
    ALTER TABLE public.practice_cases
      ADD CONSTRAINT practice_cases_quality_grade_chk
      CHECK (quality_grade IS NULL OR quality_grade IN ('A','B','C','D'));
  END IF;
END $$;

-- 3. Neue Tabellen ----------------------------------------------------------

-- 3.1 case_versions: unveränderliche Snapshots eines Falls.
CREATE TABLE IF NOT EXISTS public.case_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  version_no   integer NOT NULL,
  payload      jsonb NOT NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_versions_case_version_uk UNIQUE (case_id, version_no)
);

-- Zusammengesetzter Unique-Key (case_id, id) als Ziel für Composite-FKs.
-- Damit lässt sich referentiell erzwingen, dass abhängige Zeilen nur auf
-- eine Version desselben Falls zeigen können.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_versions_case_id_id_uk'
      AND conrelid = 'public.case_versions'::regclass
  ) THEN
    ALTER TABLE public.case_versions
      ADD CONSTRAINT case_versions_case_id_id_uk UNIQUE (case_id, id);
  END IF;
END $$;

-- practice_cases.current_version_id -> case_versions (case_id, id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practice_cases_current_version_fk'
      AND conrelid = 'public.practice_cases'::regclass
  ) THEN
    ALTER TABLE public.practice_cases
      ADD CONSTRAINT practice_cases_current_version_fk
      FOREIGN KEY (id, current_version_id)
      REFERENCES public.case_versions(case_id, id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- 3.2 case_reviews: Reviewvorgänge (Reviewer-Entscheidungen).
--     Benennung gemäß eingefrorener Architektur:
--       version_id     -> case_version_id
--       reviewer_id    -> assigned_to
--       + decided_by
CREATE TABLE IF NOT EXISTS public.case_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  case_version_id  uuid,
  status           public.review_status NOT NULL DEFAULT 'pending',
  requested_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comment          text,
  decided_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Composite-FK auf (case_id, case_version_id) -> case_versions (case_id, id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_reviews_case_version_fk'
      AND conrelid = 'public.case_reviews'::regclass
  ) THEN
    ALTER TABLE public.case_reviews
      ADD CONSTRAINT case_reviews_case_version_fk
      FOREIGN KEY (case_id, case_version_id)
      REFERENCES public.case_versions(case_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3.3 case_events: zentraler Ereignis-/Audit-Log.
CREATE TABLE IF NOT EXISTS public.case_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  case_version_id    uuid,
  event_type         text NOT NULL,
  actor_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role         text,
  actor_type         text NOT NULL DEFAULT 'user',
  aggregate_version  integer,
  correlation_id     uuid,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- actor_type auf definierte Werte einschränken.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_events_actor_type_chk'
      AND conrelid = 'public.case_events'::regclass
  ) THEN
    ALTER TABLE public.case_events
      ADD CONSTRAINT case_events_actor_type_chk
      CHECK (actor_type IN ('user','system','ai','migration','scheduler'));
  END IF;
END $$;

-- Composite-FK: case_version_id muss zum selben case_id gehören.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_events_case_version_fk'
      AND conrelid = 'public.case_events'::regclass
  ) THEN
    ALTER TABLE public.case_events
      ADD CONSTRAINT case_events_case_version_fk
      FOREIGN KEY (case_id, case_version_id)
      REFERENCES public.case_versions(case_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3.4 case_legal_review_flags: markiert Fälle, die aufgrund einer
--     Rechtsänderung erneut redaktionell geprüft werden müssen.
CREATE TABLE IF NOT EXISTS public.case_legal_review_flags (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  legal_section_id  uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  reason            text,
  raised_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. RLS aktivieren (ohne Policies) -----------------------------------------
--    Policies folgen in Sprint 3.2. Ohne Policies bleibt der Zugriff für
--    nicht-privilegierte Rollen standardmäßig verweigert; service_role
--    umgeht RLS ohnehin.

ALTER TABLE public.case_versions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_legal_review_flags  ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-25_editorial_indexes.sql =====
-- Sprint 3.1 – Editorial Indexes (revidiert nach SQL-Review)
--
-- Bereinigte Indexliste:
--   * Keine Indizes, deren linkes Präfix bereits durch einen UNIQUE-
--     Constraint abgedeckt ist (z.B. case_versions(case_id) — vom
--     UNIQUE (case_id, version_no) getragen).
--   * Ein partieller UNIQUE-Index erzwingt maximal ein offenes Review
--     (status = 'pending') pro Fall.
--
-- Idempotent. Setzt das editorial_schema voraus.

BEGIN;

-- practice_cases -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS practice_cases_workflow_status_idx
  ON public.practice_cases (workflow_status);

CREATE INDEX IF NOT EXISTS practice_cases_publication_tier_idx
  ON public.practice_cases (publication_tier);

CREATE INDEX IF NOT EXISTS practice_cases_workflow_tier_idx
  ON public.practice_cases (workflow_status, publication_tier);

CREATE INDEX IF NOT EXISTS practice_cases_quality_grade_idx
  ON public.practice_cases (quality_grade);

CREATE INDEX IF NOT EXISTS practice_cases_legal_update_required_idx
  ON public.practice_cases (legal_update_required)
  WHERE legal_update_required = true;

CREATE INDEX IF NOT EXISTS practice_cases_created_by_idx
  ON public.practice_cases (created_by);

CREATE INDEX IF NOT EXISTS practice_cases_updated_by_idx
  ON public.practice_cases (updated_by);

CREATE INDEX IF NOT EXISTS practice_cases_published_at_idx
  ON public.practice_cases (published_at DESC);

CREATE INDEX IF NOT EXISTS practice_cases_submitted_at_idx
  ON public.practice_cases (submitted_at DESC);

CREATE INDEX IF NOT EXISTS practice_cases_current_version_idx
  ON public.practice_cases (current_version_id);

-- case_versions ------------------------------------------------------------
-- HINWEIS: kein separater Index auf (case_id) — das UNIQUE (case_id, version_no)
--          deckt das linke Präfix bereits ab. Nur DESC-Variante für Auflistungen.
CREATE INDEX IF NOT EXISTS case_versions_case_version_desc_idx
  ON public.case_versions (case_id, version_no DESC);

CREATE INDEX IF NOT EXISTS case_versions_created_at_idx
  ON public.case_versions (created_at DESC);

CREATE INDEX IF NOT EXISTS case_versions_created_by_idx
  ON public.case_versions (created_by);

-- case_reviews -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS case_reviews_case_idx
  ON public.case_reviews (case_id);

CREATE INDEX IF NOT EXISTS case_reviews_case_version_idx
  ON public.case_reviews (case_version_id);

CREATE INDEX IF NOT EXISTS case_reviews_status_idx
  ON public.case_reviews (status);

CREATE INDEX IF NOT EXISTS case_reviews_assigned_to_idx
  ON public.case_reviews (assigned_to);

CREATE INDEX IF NOT EXISTS case_reviews_requested_by_idx
  ON public.case_reviews (requested_by);

CREATE INDEX IF NOT EXISTS case_reviews_decided_by_idx
  ON public.case_reviews (decided_by);

CREATE INDEX IF NOT EXISTS case_reviews_created_at_idx
  ON public.case_reviews (created_at DESC);

-- Maximal ein offenes Review je Praxisfall.
CREATE UNIQUE INDEX IF NOT EXISTS case_reviews_one_pending_per_case_uk
  ON public.case_reviews (case_id)
  WHERE status = 'pending';

-- case_events --------------------------------------------------------------
-- HINWEIS: kein separater Index auf (case_id) — der kombinierte
--          (case_id, created_at DESC) deckt das linke Präfix ab.
CREATE INDEX IF NOT EXISTS case_events_case_created_desc_idx
  ON public.case_events (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS case_events_event_type_idx
  ON public.case_events (event_type);

CREATE INDEX IF NOT EXISTS case_events_actor_idx
  ON public.case_events (actor_id);

CREATE INDEX IF NOT EXISTS case_events_actor_type_idx
  ON public.case_events (actor_type);

CREATE INDEX IF NOT EXISTS case_events_case_version_idx
  ON public.case_events (case_version_id);

CREATE INDEX IF NOT EXISTS case_events_correlation_idx
  ON public.case_events (correlation_id);

-- aggregate_version wird nur im Kontext eines Falls ausgewertet
-- (Reihenfolge / Konsistenzprüfung pro case_id).
CREATE INDEX IF NOT EXISTS case_events_case_aggregate_version_idx
  ON public.case_events (case_id, aggregate_version);

CREATE INDEX IF NOT EXISTS case_events_created_at_idx
  ON public.case_events (created_at DESC);

-- case_legal_review_flags --------------------------------------------------
CREATE INDEX IF NOT EXISTS case_legal_review_flags_case_idx
  ON public.case_legal_review_flags (case_id);

CREATE INDEX IF NOT EXISTS case_legal_review_flags_section_idx
  ON public.case_legal_review_flags (legal_section_id);

CREATE INDEX IF NOT EXISTS case_legal_review_flags_open_idx
  ON public.case_legal_review_flags (case_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS case_legal_review_flags_raised_at_idx
  ON public.case_legal_review_flags (raised_at DESC);

COMMIT;


-- ===== db/2026-07-25_editorial_backfill.sql =====
-- Sprint 3.1 – Editorial Backfill (revidiert nach SQL-Review)
--
-- Übernimmt bestehende Legacy-Werte in die neuen Editorial-Spalten und
-- legt für jeden vorhandenen Fall eine initiale Version (version_no = 1) an.
--
-- WICHTIG:
--   * Die Legacy-Spalte practice_cases.status bleibt unverändert.
--   * quality_grade wird NICHT gesetzt — die Ableitung aus quality_score
--     erfolgt erst in Sprint 3.2 mit verbindlich dokumentierten Grenzwerten.
--   * Idempotent: mehrfache Ausführung ist sicher.
--   * Der Legacy->Workflow-Backfill wirkt ausschließlich auf Fälle, für
--     die noch KEINE initiale case_version existiert. Sobald ein Fall
--     einmal migriert wurde, überschreibt der Backfill keine späteren
--     redaktionellen Workflow-Änderungen.

BEGIN;

-- 1. workflow_status + publication_tier + published_at ---------------------
--    Nur Fälle ohne initiale Version werden angefasst — das ist der
--    verlässliche Marker für "noch nicht migriert".
--
--    Mapping Legacy status -> workflow_status:
--      'published' -> 'published'
--      'archived'  -> 'archived'
--      alles andere (inkl. 'draft', NULL) -> 'draft'

WITH unmigrated AS (
  SELECT pc.id, pc.status, pc.created_at, pc.updated_at
  FROM public.practice_cases pc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.case_versions cv WHERE cv.case_id = pc.id
  )
)
UPDATE public.practice_cases pc
SET
  workflow_status = CASE
    WHEN u.status = 'published' THEN 'published'::public.case_workflow_status
    WHEN u.status = 'archived'  THEN 'archived'::public.case_workflow_status
    ELSE 'draft'::public.case_workflow_status
  END,
  publication_tier = CASE
    WHEN u.status = 'published' THEN 'public'::public.case_publication_tier
    ELSE pc.publication_tier
  END,
  published_at = CASE
    WHEN u.status = 'published' AND pc.published_at IS NULL
      THEN COALESCE(u.updated_at, u.created_at)
    ELSE pc.published_at
  END
FROM unmigrated u
WHERE pc.id = u.id;

-- 2. Initiale Version (version_no = 1) für jeden Fall erzeugen -------------
--    Snapshot der aktuellen Zeile als jsonb. Nur einfügen, wenn noch
--    keine Version existiert.

INSERT INTO public.case_versions (case_id, version_no, payload, created_by, created_at)
SELECT
  pc.id,
  1,
  to_jsonb(pc.*) AS payload,
  pc.created_by,
  COALESCE(pc.created_at, now())
FROM public.practice_cases pc
WHERE NOT EXISTS (
  SELECT 1 FROM public.case_versions cv WHERE cv.case_id = pc.id
);

-- 3. current_version_id auf die frisch erzeugte v1 setzen ------------------

UPDATE public.practice_cases pc
SET current_version_id = cv.id
FROM public.case_versions cv
WHERE cv.case_id = pc.id
  AND cv.version_no = 1
  AND pc.current_version_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-26_editorial_helpers.sql =====
-- Sprint 3.2 – Editorial Helpers
--
-- Interne SECURITY-DEFINER-Hilfsfunktionen für die Workflow-Engine:
--   * _workflow_bypass()          Prüft die transaktionslokale Ausnahme-Flagge.
--   * _set_workflow_bypass()      Setzt die Flagge (nur intern verwendet).
--   * build_case_snapshot()       Baut den unveränderlichen Fall-Snapshot.
--   * create_case_version()       Erzeugt neue case_versions-Zeile.
--   * append_case_event()         Schreibt case_events append-only + aggregate_version.
--   * assert_case_transition()    Prüft erlaubte Workflow-Übergänge.
--
-- Idempotent. Interne Funktionen sind REVOKE EXECUTE FROM PUBLIC;
-- Zugriff läuft ausschließlich über die öffentlichen Workflow-RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Transaktionslokale Bypass-Flagge
-- ---------------------------------------------------------------------------
-- Der BEFORE-UPDATE-Trigger auf practice_cases blockiert direkte Änderungen
-- an Workflow-Feldern. Die offiziellen RPCs setzen für ihre Transaktion die
-- GUC 'app.workflow_bypass' auf 'on'. Der Trigger lässt die Änderung dann
-- durch. Die Flagge wird per set_config(..., is_local=true) gesetzt und
-- verlässt die Transaktion nie.

CREATE OR REPLACE FUNCTION public._workflow_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(current_setting('app.workflow_bypass', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION public._set_workflow_bypass(_on boolean)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public
AS $$
  SELECT set_config('app.workflow_bypass', CASE WHEN _on THEN 'on' ELSE 'off' END, true);
  SELECT NULL::void;
$$;

REVOKE EXECUTE ON FUNCTION public._workflow_bypass()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._set_workflow_bypass(boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2) Snapshot-Builder
-- ---------------------------------------------------------------------------
-- Nimmt eine unveränderliche Kopie der redaktionellen Felder eines Falls.
-- Volatile / rekursive Felder werden bewusst ausgeschlossen:
--   * current_version_id (rekursiver Verweis)
--   * submitted_at, approved_at, published_at, archived_at (Workflow-Timestamps)
--   * updated_at (volatile)
--
-- Behalten werden alle inhaltlichen Redaktionsfelder inkl. workflow_status,
-- publication_tier, quality_score, quality_grade, legal_update_required,
-- created_by, updated_by, created_at — als Zeitstempel des Snapshots.

CREATE OR REPLACE FUNCTION public.build_case_snapshot(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.practice_cases%ROWTYPE;
  v_json jsonb;
BEGIN
  SELECT * INTO v_row FROM public.practice_cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found: %', p_case_id USING ERRCODE = 'P0002';
  END IF;

  v_json := to_jsonb(v_row)
    - 'current_version_id'
    - 'submitted_at'
    - 'approved_at'
    - 'published_at'
    - 'archived_at'
    - 'updated_at';

  RETURN v_json;
END $$;

REVOKE EXECUTE ON FUNCTION public.build_case_snapshot(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3) Version anlegen
-- ---------------------------------------------------------------------------
-- Erwartet, dass der Aufrufer die Fallzeile bereits mit FOR UPDATE gesperrt hat.
-- Konsequenz: version_no = MAX+1 ist unter der Sperre sicher.

CREATE OR REPLACE FUNCTION public.create_case_version(p_case_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_next    int;
  v_payload jsonb;
  v_id      uuid;
  v_actor   uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(MAX(version_no), 0) + 1
    INTO v_next
    FROM public.case_versions
   WHERE case_id = p_case_id;

  v_payload := public.build_case_snapshot(p_case_id);

  INSERT INTO public.case_versions (case_id, version_no, payload, created_by, created_at)
  VALUES (p_case_id, v_next, v_payload, v_actor, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_case_version(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4) Event schreiben
-- ---------------------------------------------------------------------------
-- aggregate_version wird pro Fall monoton hochgezählt. Konkurrenzsicherheit
-- wird über die vom Aufrufer gehaltene FOR-UPDATE-Sperre auf practice_cases
-- (bzw. case_reviews) gewährleistet.

CREATE OR REPLACE FUNCTION public.append_case_event(
  p_case_id         uuid,
  p_event_type      text,
  p_case_version_id uuid    DEFAULT NULL,
  p_actor_type      text    DEFAULT 'user',
  p_payload         jsonb   DEFAULT '{}'::jsonb,
  p_correlation_id  uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_agg    int;
  v_actor  uuid := auth.uid();
  v_role   text;
  v_id     uuid;
BEGIN
  IF p_event_type IS NULL OR length(p_event_type) = 0 THEN
    RAISE EXCEPTION 'event_type_required';
  END IF;

  IF p_actor_type = 'user' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(MAX(aggregate_version), 0) + 1
    INTO v_agg
    FROM public.case_events
   WHERE case_id = p_case_id;

  v_role := (SELECT role::text FROM public.user_profiles WHERE id = v_actor);

  INSERT INTO public.case_events(
    case_id, case_version_id, event_type,
    actor_id, actor_role, actor_type,
    aggregate_version, correlation_id, payload, created_at
  ) VALUES (
    p_case_id, p_case_version_id, p_event_type,
    v_actor, v_role, coalesce(p_actor_type, 'user'),
    v_agg, p_correlation_id, coalesce(p_payload, '{}'::jsonb), now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.append_case_event(uuid, text, uuid, text, jsonb, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5) Transitions-Wächter
-- ---------------------------------------------------------------------------
-- Erlaubte Übergänge (Spec Sprint 3.2 §2):
--   draft      -> in_review
--   draft      -> archived
--   in_review  -> approved
--   in_review  -> draft
--   approved   -> published
--   published  -> archived
--   archived   -> draft

CREATE OR REPLACE FUNCTION public.assert_case_transition(
  p_from public.case_workflow_status,
  p_to   public.case_workflow_status
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_from = p_to THEN
    RAISE EXCEPTION 'invalid_transition_noop: %', p_from;
  END IF;

  IF NOT (
       (p_from = 'draft'      AND p_to IN ('in_review','archived'))
    OR (p_from = 'in_review'  AND p_to IN ('approved','draft'))
    OR (p_from = 'approved'   AND p_to = 'published')
    OR (p_from = 'published'  AND p_to = 'archived')
    OR (p_from = 'archived'   AND p_to = 'draft')
  ) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', p_from, p_to
      USING ERRCODE = '22023';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.assert_case_transition(
  public.case_workflow_status, public.case_workflow_status
) FROM PUBLIC;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-26_editorial_rls.sql =====
-- Sprint 3.2 – Editorial RLS
--
-- Ersetzt die aus Sprint 1.2 auf practice_cases gesetzten Policies gezielt
-- und legt neue Policies für die editoriale Sichtbarkeit fest. Ergänzt RLS
-- für case_versions, case_reviews, case_events, case_legal_review_flags.
--
-- Ersetzte (gezielt gedroppte) Policies auf practice_cases:
--   * practice_cases_role_select
--   * practice_cases_role_insert_editor
--   * practice_cases_role_update_editor
--   * practice_cases_role_delete_admin
--
-- Andere Policies werden NICHT angefasst.

BEGIN;

-- ============================================================
-- practice_cases
-- ============================================================
ALTER TABLE public.practice_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_cases_role_select        ON public.practice_cases;
DROP POLICY IF EXISTS practice_cases_role_insert_editor ON public.practice_cases;
DROP POLICY IF EXISTS practice_cases_role_update_editor ON public.practice_cases;
DROP POLICY IF EXISTS practice_cases_role_delete_admin  ON public.practice_cases;

-- Öffentliche Sichtbarkeit: nur wirklich veröffentlichte + öffentliche Tier.
CREATE POLICY practice_cases_select_public ON public.practice_cases
  FOR SELECT TO anon, authenticated
  USING (
    workflow_status = 'published'
    AND publication_tier = 'public'
  );

-- Editor/Reviewer: alle nicht-archivierten Fälle einsehbar.
CREATE POLICY practice_cases_select_editor ON public.practice_cases
  FOR SELECT TO authenticated
  USING (
    public.is_editor()
    AND workflow_status <> 'archived'
  );

-- Admin/Superadmin: alle Fälle inkl. archived.
CREATE POLICY practice_cases_select_admin ON public.practice_cases
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- INSERT: nur editor+, draft/internal, created_by = self (Trigger erzwingt Details).
CREATE POLICY practice_cases_insert_editor ON public.practice_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_editor()
    AND workflow_status = 'draft'
    AND publication_tier = 'internal'
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- UPDATE: editor+ (Feld-Restriktionen setzt der Trigger durch).
CREATE POLICY practice_cases_update_editor ON public.practice_cases
  FOR UPDATE TO authenticated
  USING (public.is_editor())
  WITH CHECK (public.is_editor());

-- DELETE: admin+ (Archivierung wird bevorzugt).
CREATE POLICY practice_cases_delete_admin ON public.practice_cases
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- case_versions
-- ============================================================
ALTER TABLE public.case_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_versions_select_editor   ON public.case_versions;
DROP POLICY IF EXISTS case_versions_no_client_write ON public.case_versions;

-- SELECT: nur editor+ (Redaktions-Kontext). Sichtbarkeit an practice_cases
-- gekoppelt via EXISTS: Fall muss aus der eigenen Sichtperspektive erlaubt
-- sein. Da wir editor+ verlangen, deckt das die Vorgabe ab (teacher/anon
-- sehen keine Versionen).
CREATE POLICY case_versions_select_editor ON public.case_versions
  FOR SELECT TO authenticated
  USING (
    public.is_editor()
    AND EXISTS (
      SELECT 1 FROM public.practice_cases pc
      WHERE pc.id = case_versions.case_id
        AND (public.is_admin() OR pc.workflow_status <> 'archived')
    )
  );

-- Client darf case_versions NICHT direkt beschreiben. Zusätzlich blockieren
-- die append-only-Trigger UPDATE/DELETE. INSERT läuft ausschließlich über
-- create_case_version() (SECURITY DEFINER, Owner umgeht RLS).
CREATE POLICY case_versions_no_client_write ON public.case_versions
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ============================================================
-- case_reviews
-- ============================================================
ALTER TABLE public.case_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_reviews_select_participants ON public.case_reviews;
DROP POLICY IF EXISTS case_reviews_no_client_write     ON public.case_reviews;
DROP POLICY IF EXISTS case_reviews_no_client_update    ON public.case_reviews;

CREATE POLICY case_reviews_select_participants ON public.case_reviews
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (public.is_reviewer() AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR requested_by = auth.uid()
    OR assigned_to  = auth.uid()
  );

CREATE POLICY case_reviews_no_client_write ON public.case_reviews
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY case_reviews_no_client_update ON public.case_reviews
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- case_events
-- ============================================================
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_events_select_editor    ON public.case_events;
DROP POLICY IF EXISTS case_events_no_client_write  ON public.case_events;

CREATE POLICY case_events_select_editor ON public.case_events
  FOR SELECT TO authenticated
  USING (
    public.is_editor()
    AND EXISTS (
      SELECT 1 FROM public.practice_cases pc
      WHERE pc.id = case_events.case_id
        AND (public.is_admin() OR pc.workflow_status <> 'archived')
    )
  );

CREATE POLICY case_events_no_client_write ON public.case_events
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ============================================================
-- case_legal_review_flags
-- ============================================================
ALTER TABLE public.case_legal_review_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clrf_select_reviewer ON public.case_legal_review_flags;
DROP POLICY IF EXISTS clrf_select_editor   ON public.case_legal_review_flags;
DROP POLICY IF EXISTS clrf_insert_reviewer ON public.case_legal_review_flags;
DROP POLICY IF EXISTS clrf_update_reviewer ON public.case_legal_review_flags;

CREATE POLICY clrf_select_reviewer ON public.case_legal_review_flags
  FOR SELECT TO authenticated
  USING (public.is_reviewer());

CREATE POLICY clrf_select_editor ON public.case_legal_review_flags
  FOR SELECT TO authenticated
  USING (
    public.is_editor()
    AND EXISTS (
      SELECT 1 FROM public.practice_cases pc
      WHERE pc.id = case_legal_review_flags.case_id
        AND pc.workflow_status <> 'archived'
    )
  );

CREATE POLICY clrf_insert_reviewer ON public.case_legal_review_flags
  FOR INSERT TO authenticated
  WITH CHECK (public.is_reviewer());

CREATE POLICY clrf_update_reviewer ON public.case_legal_review_flags
  FOR UPDATE TO authenticated
  USING (public.is_reviewer())
  WITH CHECK (public.is_reviewer());

-- kein DELETE-Policy => DELETE für Clients standardmäßig verboten.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-26_editorial_triggers.sql =====
-- Sprint 3.2 – Editorial Triggers
--
-- Erzwingt, dass Workflow-, Publikations- und Zeit-Felder sowie
-- current_version_id ausschließlich durch die vorgesehenen SECURITY-DEFINER-
-- RPCs verändert werden. Ausnahme: die transaktionslokale Bypass-Flagge
-- (app.workflow_bypass = 'on'), die nur intern von den RPCs gesetzt wird.
--
-- Zusätzlich: append-only-Absicherung für case_versions und case_events
-- (kein UPDATE, kein DELETE — auch nicht durch authenticated).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) practice_cases: Workflow-Felder direkt schreiben blockieren
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._practice_cases_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF public._workflow_bypass() THEN
    RETURN NEW;
  END IF;

  IF NEW.workflow_status IS DISTINCT FROM OLD.workflow_status THEN
    RAISE EXCEPTION 'workflow_status_direct_change_forbidden. Use workflow RPCs.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.publication_tier IS DISTINCT FROM OLD.publication_tier THEN
    RAISE EXCEPTION 'publication_tier_direct_change_forbidden. Use publish_case().'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'submitted_at_direct_change_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'approved_at_direct_change_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'published_at_direct_change_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    RAISE EXCEPTION 'archived_at_direct_change_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    RAISE EXCEPTION 'current_version_id_direct_change_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Legacy-Spalte "status" darf nicht als Umgehung dienen.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'legacy_status_direct_change_forbidden. Legacy status is derived from workflow_status.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS practice_cases_workflow_guard ON public.practice_cases;
CREATE TRIGGER practice_cases_workflow_guard
BEFORE UPDATE ON public.practice_cases
FOR EACH ROW EXECUTE FUNCTION public._practice_cases_guard();

-- INSERT-Guard: Startwerte erzwingen (draft/internal, keine Zeitstempel,
-- keine current_version_id). Bypass respektiert (für Bootstrap-Migrationen).
CREATE OR REPLACE FUNCTION public._practice_cases_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF public._workflow_bypass() THEN
    RETURN NEW;
  END IF;

  IF NEW.workflow_status IS DISTINCT FROM 'draft'::public.case_workflow_status THEN
    RAISE EXCEPTION 'insert_requires_workflow_status_draft' USING ERRCODE = '42501';
  END IF;
  IF NEW.publication_tier IS DISTINCT FROM 'internal'::public.case_publication_tier THEN
    RAISE EXCEPTION 'insert_requires_publication_tier_internal' USING ERRCODE = '42501';
  END IF;
  IF NEW.submitted_at IS NOT NULL
     OR NEW.approved_at IS NOT NULL
     OR NEW.published_at IS NOT NULL
     OR NEW.archived_at IS NOT NULL
     OR NEW.current_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'insert_workflow_timestamps_must_be_null' USING ERRCODE = '42501';
  END IF;
  -- Legacy "status" muss beim Insert 'draft' sein.
  IF coalesce(NEW.status, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'insert_requires_legacy_status_draft' USING ERRCODE = '42501';
  END IF;

  -- created_by automatisch setzen, falls leer
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS practice_cases_insert_guard ON public.practice_cases;
CREATE TRIGGER practice_cases_insert_guard
BEFORE INSERT ON public.practice_cases
FOR EACH ROW EXECUTE FUNCTION public._practice_cases_insert_guard();

-- ---------------------------------------------------------------------------
-- 2) case_versions: append-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._case_versions_readonly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF public._workflow_bypass() THEN
    -- Auch mit Bypass sind UPDATE/DELETE nicht erlaubt.
    RAISE EXCEPTION 'case_versions_are_append_only' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'case_versions_are_append_only' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS case_versions_no_update ON public.case_versions;
CREATE TRIGGER case_versions_no_update
BEFORE UPDATE ON public.case_versions
FOR EACH ROW EXECUTE FUNCTION public._case_versions_readonly();

DROP TRIGGER IF EXISTS case_versions_no_delete ON public.case_versions;
CREATE TRIGGER case_versions_no_delete
BEFORE DELETE ON public.case_versions
FOR EACH ROW EXECUTE FUNCTION public._case_versions_readonly();

-- ---------------------------------------------------------------------------
-- 3) case_events: append-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._case_events_readonly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  RAISE EXCEPTION 'case_events_are_append_only' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS case_events_no_update ON public.case_events;
CREATE TRIGGER case_events_no_update
BEFORE UPDATE ON public.case_events
FOR EACH ROW EXECUTE FUNCTION public._case_events_readonly();

DROP TRIGGER IF EXISTS case_events_no_delete ON public.case_events;
CREATE TRIGGER case_events_no_delete
BEFORE DELETE ON public.case_events
FOR EACH ROW EXECUTE FUNCTION public._case_events_readonly();

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-26_editorial_workflow_rpcs.sql =====
-- Sprint 3.2 – Workflow RPCs
--
-- Öffentliche SECURITY-DEFINER-Endpoints für den Redaktions-Workflow.
-- Nur diese Funktionen dürfen Workflow-/Publikations-/Zeit-Felder ändern.
-- Sie setzen dazu die transaktionslokale Bypass-Flagge (siehe Trigger).
--
--   1) submit_case_for_review
--   2) decide_case_review
--   3) publish_case
--   4) archive_case
--   5) reactivate_case
--
-- Alle Funktionen sind atomar (eine Transaktion pro Aufruf) und erzeugen
-- die vorgeschriebenen Events in append_case_event().

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) submit_case_for_review
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_case_for_review(
  p_case_id        uuid,
  p_assigned_to    uuid   DEFAULT NULL,
  p_comment        text   DEFAULT NULL,
  p_correlation_id uuid   DEFAULT gen_random_uuid()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_case      public.practice_cases%ROWTYPE;
  v_actor     uuid := auth.uid();
  v_version   uuid;
  v_review_id uuid;
  v_pending   uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_editor() THEN
    RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case
    FROM public.practice_cases
   WHERE id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found: %', p_case_id USING ERRCODE = 'P0002';
  END IF;

  IF v_case.workflow_status <> 'draft' THEN
    RAISE EXCEPTION 'invalid_workflow_state: current=%', v_case.workflow_status
      USING ERRCODE = '22023';
  END IF;

  -- Nur ein pending-Review pro Fall (der Partial-UNIQUE-Index sichert das
  -- zusätzlich ab; wir prüfen früh für saubere Fehlermeldung).
  SELECT id INTO v_pending
    FROM public.case_reviews
   WHERE case_id = p_case_id AND status = 'pending'
   LIMIT 1;
  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'pending_review_already_exists: %', v_pending
      USING ERRCODE = '23505';
  END IF;

  PERFORM public._set_workflow_bypass(true);

  -- Snapshot & neue Version
  v_version := public.create_case_version(p_case_id);

  UPDATE public.practice_cases
     SET workflow_status    = 'in_review',
         current_version_id = v_version,
         submitted_at       = now(),
         updated_by         = v_actor,
         updated_at         = now()
   WHERE id = p_case_id;

  -- Review-Eintrag
  INSERT INTO public.case_reviews (
    case_id, case_version_id, status,
    requested_by, assigned_to, comment, created_at
  ) VALUES (
    p_case_id, v_version, 'pending',
    v_actor, p_assigned_to, p_comment, now()
  ) RETURNING id INTO v_review_id;

  -- Events
  PERFORM public.append_case_event(
    p_case_id, 'case.submitted_for_review', v_version, 'user',
    jsonb_build_object('review_id', v_review_id, 'assigned_to', p_assigned_to),
    p_correlation_id
  );
  PERFORM public.append_case_event(
    p_case_id, 'review.created', v_version, 'user',
    jsonb_build_object('review_id', v_review_id, 'assigned_to', p_assigned_to),
    p_correlation_id
  );

  PERFORM public._set_workflow_bypass(false);
  RETURN v_review_id;
END $$;

-- ---------------------------------------------------------------------------
-- 2) decide_case_review
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_case_review(
  p_review_id      uuid,
  p_decision       public.review_status,
  p_comment        text   DEFAULT NULL,
  p_correlation_id uuid   DEFAULT gen_random_uuid()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_review  public.case_reviews%ROWTYPE;
  v_case    public.practice_cases%ROWTYPE;
  v_actor   uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_reviewer() THEN
    RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved','changes_requested','rejected','cancelled') THEN
    RAISE EXCEPTION 'invalid_decision: %', p_decision USING ERRCODE = '22023';
  END IF;

  IF p_decision IN ('changes_requested','rejected')
     AND (p_comment IS NULL OR btrim(p_comment) = '') THEN
    RAISE EXCEPTION 'comment_required_for_%', p_decision USING ERRCODE = '22023';
  END IF;

  -- Review sperren
  SELECT * INTO v_review
    FROM public.case_reviews
   WHERE id = p_review_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_not_found: %', p_review_id USING ERRCODE = 'P0002';
  END IF;

  IF v_review.status <> 'pending' THEN
    RAISE EXCEPTION 'review_not_pending: current=%', v_review.status
      USING ERRCODE = '22023';
  END IF;

  -- Fall sperren
  SELECT * INTO v_case
    FROM public.practice_cases
   WHERE id = v_review.case_id
   FOR UPDATE;

  IF v_case.workflow_status <> 'in_review' THEN
    RAISE EXCEPTION 'invalid_workflow_state: current=%', v_case.workflow_status
      USING ERRCODE = '22023';
  END IF;

  -- Berechtigung: assigned_to = Aufrufer, oder Aufrufer ist Admin,
  -- oder assigned_to IS NULL und Aufrufer ist Reviewer+.
  IF NOT (
       public.is_admin()
    OR (v_review.assigned_to = v_actor)
    OR (v_review.assigned_to IS NULL AND public.is_reviewer())
  ) THEN
    RAISE EXCEPTION 'review_not_assigned' USING ERRCODE = '42501';
  END IF;

  PERFORM public._set_workflow_bypass(true);

  UPDATE public.case_reviews
     SET status     = p_decision,
         decided_by = v_actor,
         decided_at = now(),
         comment    = coalesce(p_comment, comment)
   WHERE id = p_review_id;

  IF p_decision = 'approved' THEN
    UPDATE public.practice_cases
       SET workflow_status = 'approved',
           approved_at     = now(),
           updated_by      = v_actor,
           updated_at      = now()
     WHERE id = v_case.id;

    PERFORM public.append_case_event(
      v_case.id, 'review.decided', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id, 'decision', 'approved'),
      p_correlation_id
    );
    PERFORM public.append_case_event(
      v_case.id, 'case.approved', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id),
      p_correlation_id
    );

  ELSIF p_decision = 'changes_requested' THEN
    UPDATE public.practice_cases
       SET workflow_status = 'draft',
           updated_by      = v_actor,
           updated_at      = now()
     WHERE id = v_case.id;

    PERFORM public.append_case_event(
      v_case.id, 'review.decided', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id, 'decision', 'changes_requested'),
      p_correlation_id
    );
    PERFORM public.append_case_event(
      v_case.id, 'case.changes_requested', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id, 'comment', p_comment),
      p_correlation_id
    );

  ELSIF p_decision = 'rejected' THEN
    UPDATE public.practice_cases
       SET workflow_status = 'draft',
           updated_by      = v_actor,
           updated_at      = now()
     WHERE id = v_case.id;

    PERFORM public.append_case_event(
      v_case.id, 'review.decided', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id, 'decision', 'rejected'),
      p_correlation_id
    );
    PERFORM public.append_case_event(
      v_case.id, 'case.rejected', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id, 'comment', p_comment),
      p_correlation_id
    );

  ELSE  -- cancelled: Workflow bleibt unverändert. Fall aus in_review lösen
        -- ist nicht Aufgabe von 'cancelled'; der Fall bleibt in_review, bis
        -- ein neues Review entschieden wird oder der Editor zurückzieht.
    PERFORM public.append_case_event(
      v_case.id, 'review.decided', v_review.case_version_id, 'user',
      jsonb_build_object('review_id', p_review_id, 'decision', 'cancelled'),
      p_correlation_id
    );
  END IF;

  PERFORM public._set_workflow_bypass(false);
END $$;

-- ---------------------------------------------------------------------------
-- 3) publish_case  (approved -> published, admin+)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_case(
  p_case_id          uuid,
  p_publication_tier public.case_publication_tier,
  p_correlation_id   uuid DEFAULT gen_random_uuid()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_case  public.practice_cases%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case
    FROM public.practice_cases
   WHERE id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found: %', p_case_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_case_transition(v_case.workflow_status, 'published');

  PERFORM public._set_workflow_bypass(true);

  UPDATE public.practice_cases
     SET workflow_status  = 'published',
         publication_tier = p_publication_tier,
         published_at     = now(),
         status           = 'published',  -- Legacy-Sync
         updated_by       = v_actor,
         updated_at       = now()
   WHERE id = p_case_id;

  PERFORM public.append_case_event(
    p_case_id, 'case.published', v_case.current_version_id, 'user',
    jsonb_build_object('publication_tier', p_publication_tier),
    p_correlation_id
  );

  PERFORM public._set_workflow_bypass(false);
END $$;

-- ---------------------------------------------------------------------------
-- 4) archive_case
--    editor+ darf draft archivieren, admin+ darf published archivieren.
--    Legacy-status wird auf 'archived' gesetzt (Legacy-Spalte ist freies
--    text, kein Enum -> Wert 'archived' ist zulässig).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_case(
  p_case_id        uuid,
  p_reason         text DEFAULT NULL,
  p_correlation_id uuid DEFAULT gen_random_uuid()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_case  public.practice_cases%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case
    FROM public.practice_cases
   WHERE id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found: %', p_case_id USING ERRCODE = 'P0002';
  END IF;

  IF v_case.workflow_status = 'draft' THEN
    IF NOT public.is_editor() THEN
      RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
    END IF;
  ELSIF v_case.workflow_status = 'published' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_workflow_state: current=%', v_case.workflow_status
      USING ERRCODE = '22023';
  END IF;

  PERFORM public._set_workflow_bypass(true);

  UPDATE public.practice_cases
     SET workflow_status = 'archived',
         archived_at     = now(),
         status          = 'archived',
         updated_by      = v_actor,
         updated_at      = now()
   WHERE id = p_case_id;

  PERFORM public.append_case_event(
    p_case_id, 'case.archived', v_case.current_version_id, 'user',
    jsonb_build_object('reason', p_reason, 'from', v_case.workflow_status),
    p_correlation_id
  );

  PERFORM public._set_workflow_bypass(false);
END $$;

-- ---------------------------------------------------------------------------
-- 5) reactivate_case  (archived -> draft, admin+)
--    Nur archived_at wird geleert. approved_at / submitted_at / published_at
--    bleiben als historische Zeitstempel unverändert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivate_case(
  p_case_id        uuid,
  p_correlation_id uuid DEFAULT gen_random_uuid()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_case  public.practice_cases%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case
    FROM public.practice_cases
   WHERE id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found: %', p_case_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_case_transition(v_case.workflow_status, 'draft');

  PERFORM public._set_workflow_bypass(true);

  UPDATE public.practice_cases
     SET workflow_status = 'draft',
         archived_at     = NULL,
         status          = 'draft',
         updated_by      = v_actor,
         updated_at      = now()
   WHERE id = p_case_id;

  PERFORM public.append_case_event(
    p_case_id, 'case.reactivated', v_case.current_version_id, 'user',
    '{}'::jsonb,
    p_correlation_id
  );

  PERFORM public._set_workflow_bypass(false);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-26_editorial_grants.sql =====
-- Sprint 3.2 – Editorial Grants & Revokes
--
-- Verteilt EXECUTE-Rechte auf die Workflow-RPCs und entzieht sie den
-- internen Helferfunktionen. service_role bleibt uneingeschränkt.

BEGIN;

-- --------------------------------------------------------------------
-- Interne Helper: für Client-Rollen sperren
-- --------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._workflow_bypass()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._set_workflow_bypass(boolean)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_case_snapshot(uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_case_version(uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_case_event(uuid, text, uuid, text, jsonb, uuid)
                                                                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_case_transition(public.case_workflow_status, public.case_workflow_status)
                                                                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._practice_cases_guard()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._practice_cases_insert_guard()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._case_versions_readonly()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._case_events_readonly()                        FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------
-- Öffentliche Workflow-RPCs: nur authenticated
-- --------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.submit_case_for_review(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_case_for_review(uuid, uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.decide_case_review(uuid, public.review_status, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decide_case_review(uuid, public.review_status, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_case(uuid, public.case_publication_tier, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_case(uuid, public.case_publication_tier, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.archive_case(uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_case(uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reactivate_case(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reactivate_case(uuid, uuid) TO authenticated;

-- --------------------------------------------------------------------
-- Tabellengrants für neue Editorial-Tabellen konsolidieren
-- --------------------------------------------------------------------
-- Für Client-Rollen (anon, authenticated) sind Direktzugriffe auf
-- case_versions/case_events auf SELECT begrenzt; Schreibrechte laufen
-- ausschließlich über SECURITY-DEFINER-RPCs (Owner umgeht RLS).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.case_versions             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.case_events               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.case_reviews              FROM anon, authenticated;
REVOKE ALL                    ON TABLE public.case_versions             FROM anon;
REVOKE ALL                    ON TABLE public.case_events               FROM anon;
REVOKE ALL                    ON TABLE public.case_reviews              FROM anon;
REVOKE ALL                    ON TABLE public.case_legal_review_flags   FROM anon;

GRANT  SELECT                 ON TABLE public.case_versions             TO authenticated;
GRANT  SELECT                 ON TABLE public.case_events               TO authenticated;
GRANT  SELECT                 ON TABLE public.case_reviews              TO authenticated;
GRANT  SELECT, INSERT, UPDATE ON TABLE public.case_legal_review_flags   TO authenticated;

GRANT  ALL ON TABLE public.case_versions            TO service_role;
GRANT  ALL ON TABLE public.case_events              TO service_role;
GRANT  ALL ON TABLE public.case_reviews             TO service_role;
GRANT  ALL ON TABLE public.case_legal_review_flags  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-26_editorial_tests.sql =====
-- Sprint 3.2 – Editorial Tests
--
-- Prüfqueries. Diese Datei erzeugt KEINE dauerhaften Daten:
-- alle Test-DML-Operationen laufen in einer Transaktion und werden am
-- Ende zurückgerollt. Reine Introspektionsqueries laufen darüber hinaus.
--
-- Vor der Ausführung:
--   * mindestens ein user_profiles-Eintrag mit role='editor' (v_editor)
--   * mindestens ein user_profiles-Eintrag mit role='reviewer' (v_reviewer)
--   * mindestens ein user_profiles-Eintrag mit role='admin'    (v_admin)
--   * mindestens ein user_profiles-Eintrag mit role='teacher'  (v_teacher)
--
-- Die Tests simulieren den auth-Kontext über SET LOCAL request.jwt.claims.

-- =========================================================================
-- A) Introspektion (ohne Transaktion)
-- =========================================================================

-- A1: Vorhandene Workflow-RPCs
SELECT proname
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN (
     'submit_case_for_review','decide_case_review',
     'publish_case','archive_case','reactivate_case',
     'build_case_snapshot','create_case_version','append_case_event',
     'assert_case_transition','_workflow_bypass','_set_workflow_bypass'
   )
 ORDER BY proname;

-- A2: Trigger vorhanden
SELECT tgname, tgrelid::regclass
  FROM pg_trigger
 WHERE tgname IN (
   'practice_cases_workflow_guard','practice_cases_insert_guard',
   'case_versions_no_update','case_versions_no_delete',
   'case_events_no_update','case_events_no_delete'
 )
 ORDER BY tgname;

-- A3: RLS-Policies auf editorialen Tabellen
SELECT schemaname, tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('practice_cases','case_versions','case_reviews',
                     'case_events','case_legal_review_flags')
 ORDER BY tablename, policyname;

-- A4: Grants auf Workflow-RPCs
SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
  FROM pg_proc p
  CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('submit_case_for_review','decide_case_review',
                     'publish_case','archive_case','reactivate_case')
 ORDER BY p.proname, r.rolname;

-- =========================================================================
-- B) Funktionale Tests (in Transaktion, mit ROLLBACK)
-- =========================================================================
BEGIN;

-- helper: request.jwt.claims setzen
--   Nutze die tatsächlichen UUIDs aus deiner user_profiles-Tabelle.
--   Beispiel unten mit Platzhaltern.

-- Beispiel-Aufruf (Platzhalter durch echte IDs ersetzen):
-- SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- B1: Direkter Workflow-Change scheitert (auch für admin)
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.practice_cases LIMIT 1;
  IF v_id IS NULL THEN RAISE NOTICE 'B1 skipped: no cases'; RETURN; END IF;
  BEGIN
    UPDATE public.practice_cases SET workflow_status = 'in_review' WHERE id = v_id;
    RAISE EXCEPTION 'B1 FAIL: direct workflow_status change succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'B1 OK: blocked (%)', SQLERRM;
  END;
END $$;

-- B2: Direkter Legacy-status-Change scheitert
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.practice_cases LIMIT 1;
  IF v_id IS NULL THEN RAISE NOTICE 'B2 skipped'; RETURN; END IF;
  BEGIN
    UPDATE public.practice_cases SET status = 'archived' WHERE id = v_id;
    RAISE EXCEPTION 'B2 FAIL: legacy status change succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'B2 OK: legacy status blocked';
  END;
END $$;

-- B3: assert_case_transition
DO $$
BEGIN
  PERFORM public.assert_case_transition('draft','in_review');   -- ok
  PERFORM public.assert_case_transition('approved','published');-- ok
  PERFORM public.assert_case_transition('archived','draft');    -- ok
  BEGIN
    PERFORM public.assert_case_transition('draft','published');
    RAISE EXCEPTION 'B3 FAIL: draft->published allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B3 OK: draft->published blocked';
  END;
  BEGIN
    PERFORM public.assert_case_transition('in_review','published');
    RAISE EXCEPTION 'B3 FAIL: in_review->published allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B3 OK: in_review->published blocked';
  END;
  BEGIN
    PERFORM public.assert_case_transition('published','draft');
    RAISE EXCEPTION 'B3 FAIL: published->draft allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B3 OK: published->draft blocked';
  END;
END $$;

-- B4: case_versions ist append-only
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.case_versions LIMIT 1;
  IF v_id IS NULL THEN RAISE NOTICE 'B4 skipped'; RETURN; END IF;
  BEGIN
    UPDATE public.case_versions SET payload = '{}'::jsonb WHERE id = v_id;
    RAISE EXCEPTION 'B4 FAIL: case_versions UPDATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'B4 OK: case_versions immutable';
  END;
END $$;

-- B5: Partial-UNIQUE verhindert doppelte pending-Reviews
--    (nur ausführen, wenn manuelle IDs eingesetzt wurden — sonst überspringen)

-- B6: End-to-End (Skizze – erfordert echte JWT-Claims der Rollen):
--     1. SET LOCAL request.jwt.claims = editor
--     2. SELECT public.submit_case_for_review(:case_id, :reviewer_id, 'bitte prüfen');
--     3. Erwartung: workflow_status='in_review', version_no MAX+1, pending-Review vorhanden,
--                   Events case.submitted_for_review + review.created erzeugt.
--     4. SET LOCAL request.jwt.claims = reviewer
--     5. SELECT public.decide_case_review(:review_id, 'approved');
--     6. Erwartung: workflow_status='approved', approved_at gesetzt, Events review.decided + case.approved.
--     7. SET LOCAL request.jwt.claims = admin
--     8. SELECT public.publish_case(:case_id, 'public');
--     9. Erwartung: workflow_status='published', publication_tier='public', legacy status='published'.
--    10. SELECT public.archive_case(:case_id, 'reason');  -- published -> archived
--    11. SELECT public.reactivate_case(:case_id);        -- archived -> draft

ROLLBACK;

-- =========================================================================
-- C) Weitere reine SELECT-Prüfungen
-- =========================================================================

-- C1: RLS aktiv?
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname IN ('practice_cases','case_versions','case_reviews',
                   'case_events','case_legal_review_flags')
 ORDER BY relname;

-- C2: aggregate_version steigt monoton pro Fall (sofern Events existieren)
SELECT case_id,
       COUNT(*) AS n_events,
       MIN(aggregate_version) AS min_v,
       MAX(aggregate_version) AS max_v,
       COUNT(*) = MAX(aggregate_version) AS strictly_monotone
  FROM public.case_events
 GROUP BY case_id
 LIMIT 20;

-- =========================================================================
-- D) Sicherheits-Härtung (Sprint 3.2 – Final Review)
-- =========================================================================

-- D1: Alle SECURITY-DEFINER-Funktionen in public haben expliziten search_path
--     (proconfig enthält 'search_path=...'-Eintrag).
SELECT n.nspname, p.proname,
       CASE WHEN EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
          WHERE c LIKE 'search_path=%'
       ) THEN 'ok' ELSE 'MISSING' END AS search_path_state,
       p.prosecdef AS is_security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'submit_case_for_review','decide_case_review','publish_case',
     'archive_case','reactivate_case',
     'build_case_snapshot','create_case_version','append_case_event',
     'assert_case_transition','_workflow_bypass','_set_workflow_bypass',
     '_practice_cases_guard','_practice_cases_insert_guard',
     '_case_versions_readonly','_case_events_readonly'
   )
 ORDER BY p.proname;

-- D2: Interne Helper haben KEIN EXECUTE für PUBLIC/anon/authenticated.
--     Öffentliche RPCs haben EXECUTE nur für authenticated (nicht anon/PUBLIC).
SELECT p.proname,
       has_function_privilege('anon',           p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated',  p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('public',         p.oid, 'EXECUTE') AS public_exec
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN (
     'submit_case_for_review','decide_case_review','publish_case',
     'archive_case','reactivate_case',
     'build_case_snapshot','create_case_version','append_case_event',
     'assert_case_transition','_workflow_bypass','_set_workflow_bypass'
   )
 ORDER BY p.proname;
-- Erwartung:
--   public RPCs:   anon=false, authenticated=true, public=false
--   Helper (_/build/create/append/assert): alle false

-- D3: RPC-Sicherheit – ohne JWT scheitert jeder Aufruf mit authentication_required.
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{}';  -- kein sub -> auth.uid() IS NULL
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.practice_cases LIMIT 1;
  IF v_id IS NULL THEN RAISE NOTICE 'D3 skipped: no cases'; RETURN; END IF;
  BEGIN
    PERFORM public.submit_case_for_review(v_id);
    RAISE EXCEPTION 'D3 FAIL: submit ohne auth erlaubt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%authentication_required%' THEN
      RAISE NOTICE 'D3 OK: submit blockiert (%)', SQLERRM;
    ELSE
      RAISE EXCEPTION 'D3 FAIL: falscher Fehler: %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.publish_case(v_id, 'public');
    RAISE EXCEPTION 'D3 FAIL: publish ohne auth erlaubt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%authentication_required%' OR SQLERRM LIKE '%insufficient_role%'
    THEN RAISE NOTICE 'D3 OK: publish blockiert (%)', SQLERRM;
    ELSE RAISE EXCEPTION 'D3 FAIL: falscher Fehler: %', SQLERRM;
    END IF;
  END;
END $$;
ROLLBACK;

-- D4: Rollen-Härtung (Skizze – erfordert echte user_profiles-IDs).
--     Ersetze die Platzhalter, dann ausführen.
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<TEACHER_UUID>","role":"authenticated"}';
--   -- Erwartung: submit_case_for_review scheitert mit insufficient_role
--   -- Erwartung: publish_case scheitert mit insufficient_role
--   SET LOCAL "request.jwt.claims" = '{"sub":"<EDITOR_UUID>","role":"authenticated"}';
--   -- Erwartung: decide_case_review scheitert mit insufficient_role (nicht reviewer)
--   -- Erwartung: publish_case scheitert mit insufficient_role (nicht admin)
--   SET LOCAL "request.jwt.claims" = '{"sub":"<REVIEWER_UUID>","role":"authenticated"}';
--   -- Erwartung: publish_case scheitert mit insufficient_role (nicht admin)
--   SET LOCAL "request.jwt.claims" = '{"sub":"<ADMIN_UUID>","role":"authenticated"}';
--   -- Erwartung: publish_case eines approved-Falls erfolgreich
--   ROLLBACK;

-- D5: Ungültiger Workflow-Ausgangszustand -> invalid_workflow_state
--     (Skizze; erfordert JWT von editor + Fall im Zustand != draft)
--   BEGIN;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<EDITOR_UUID>","role":"authenticated"}';
--   PERFORM public.submit_case_for_review('<published_case_id>');
--   -- Erwartung: 'invalid_workflow_state: current=published'
--   ROLLBACK;

-- =========================================================================
-- E) Legacy-status Kompatibilität
-- =========================================================================

-- E1: Direktes Setzen von practice_cases.status ist weiterhin blockiert
--     (Trigger _practice_cases_guard). Bereits abgedeckt durch B2. Zusätzlich:
--     Prüfe, dass Legacy-Wert bei publish/archive/reactivate synchron gehalten wird.
--     (Skizze – JWT eines admin einsetzen.)
--   BEGIN;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<ADMIN_UUID>","role":"authenticated"}';
--   PERFORM public.publish_case('<approved_case_id>', 'public');
--   -- Erwartung: workflow_status='published' AND status='published'
--   PERFORM public.archive_case('<published_case_id>');
--   -- Erwartung: workflow_status='archived' AND status='archived'
--   PERFORM public.reactivate_case('<archived_case_id>');
--   -- Erwartung: workflow_status='draft' AND status='draft'
--   ROLLBACK;

-- E2: Archivierte Fälle sind für anon NICHT über die neue RLS sichtbar.
--     Anon-Selects mit RLS liefern nur workflow_status='published'
--     UND publication_tier='public'.
SELECT COUNT(*) FILTER (
         WHERE workflow_status = 'archived'
       ) AS archived_total,
       COUNT(*) FILTER (
         WHERE workflow_status = 'archived' AND publication_tier = 'public'
       ) AS archived_but_public_tier
  FROM public.practice_cases;
-- archived_but_public_tier zeigt Datenqualitätsrisiken; RLS filtert diese
-- ebenfalls, da workflow_status <> 'published'.

-- E3: Anon sieht keinen archivierten Fall (RLS-Rundgang).
--   BEGIN;
--   SET LOCAL role anon;
--   SELECT COUNT(*) FROM public.practice_cases WHERE workflow_status='archived';
--   -- Erwartung: 0
--   ROLLBACK;



-- ===== db/2026-07-27_legal_knowledge_foundation.sql =====
-- ============================================================================
-- Sprint 4.1A – Legal Source Registry & Ingestion Foundation
-- Datum: 2026-07-27
-- Zweck: Erweitert legal_sources um Lifecycle-, Verifikations- und
--        Metadatenfelder. Ergänzt zwei neue Tabellen für Ingestion-Jobs und
--        Review-Ereignisse. Idempotent, additiv, ohne destruktive Umbenennungen.
--
-- WICHTIG: Kein pgvector, keine Embeddings, keine Chunks, kein RAG.
--          Bestehendes 'source_type' (text) bleibt unverändert. Neue Enum-Spalte
--          'source_type_v2' wird additiv ergänzt und aus dem Bestand befüllt.
-- ============================================================================

-- 1) Enums ------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_source_lifecycle') then
    create type public.legal_source_lifecycle as enum (
      'draft','imported','needs_review','verified','active','outdated','archived','rejected'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_source_verification') then
    create type public.legal_source_verification as enum (
      'unverified','technical_validated','editorial_reviewed','authority_verified'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_source_type') then
    create type public.legal_source_type as enum (
      'law','ordinance','administrative_regulation','circular','court_decision',
      'eu_regulation','internal_guideline','editorial_guideline','other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_ingestion_status') then
    create type public.legal_ingestion_status as enum (
      'pending','loading','loaded','normalizing','validating',
      'ready_for_review','completed','failed','cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_ingestion_input') then
    create type public.legal_ingestion_input as enum (
      'manual_text','official_url','existing_db','pdf','html','docx','markdown'
    );
  end if;
end $$;

-- 2) legal_sources – additive Erweiterung ----------------------------------
alter table public.legal_sources
  add column if not exists source_type_v2      public.legal_source_type,
  add column if not exists jurisdiction        text,
  add column if not exists authority           text,
  add column if not exists official_url        text,
  add column if not exists federal_state       text,
  add column if not exists school_type         text,
  add column if not exists educational_area    text,
  add column if not exists legal_domain        text,
  add column if not exists version_label       text,
  add column if not exists published_at        date,
  add column if not exists last_verified_at    timestamptz,
  add column if not exists supersedes_source_id  uuid references public.legal_sources(id) on delete set null,
  add column if not exists replaced_by_source_id uuid references public.legal_sources(id) on delete set null,
  add column if not exists official_source     boolean default false,
  add column if not exists authority_verified  boolean default false,
  add column if not exists editorial_verified  boolean default false,
  add column if not exists verification_status public.legal_source_verification default 'unverified',
  add column if not exists lifecycle_status    public.legal_source_lifecycle    default 'draft',
  add column if not exists source_format       text,
  add column if not exists source_language     text default 'de',
  add column if not exists checksum            text,
  add column if not exists ingestion_status    public.legal_ingestion_status,
  add column if not exists last_ingested_at    timestamptz,
  add column if not exists original_content    text,
  add column if not exists normalized_content  text,
  add column if not exists updated_at          timestamptz default now();

-- Backfill – nur Bestandsdatensätze berühren
update public.legal_sources
   set source_type_v2 = case
         when source_type in ('law','ordinance','administrative_regulation','circular',
                              'court_decision','eu_regulation','internal_guideline',
                              'editorial_guideline','other')
              then source_type::public.legal_source_type
         else 'other'::public.legal_source_type
       end
 where source_type_v2 is null;

update public.legal_sources
   set lifecycle_status = 'active'
 where lifecycle_status is null;

-- updated_at Trigger
create or replace function public.tg_legal_sources_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_sources_touch on public.legal_sources;
create trigger trg_legal_sources_touch
  before update on public.legal_sources
  for each row execute function public.tg_legal_sources_touch();

create index if not exists legal_sources_lifecycle_idx    on public.legal_sources(lifecycle_status);
create index if not exists legal_sources_verification_idx on public.legal_sources(verification_status);
create index if not exists legal_sources_type_v2_idx      on public.legal_sources(source_type_v2);
create index if not exists legal_sources_official_url_idx on public.legal_sources(official_url);
create index if not exists legal_sources_checksum_idx     on public.legal_sources(checksum);
create index if not exists legal_sources_supersedes_idx   on public.legal_sources(supersedes_source_id);

-- 3) legal_ingestion_jobs --------------------------------------------------
create table if not exists public.legal_ingestion_jobs (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid null references public.legal_sources(id) on delete set null,
  input_type          public.legal_ingestion_input not null,
  input_location      text,
  status              public.legal_ingestion_status not null default 'pending',
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  created_by          uuid,
  error_code          text,
  error_message       text,
  warnings            jsonb not null default '[]'::jsonb,
  extracted_metadata  jsonb not null default '{}'::jsonb,
  content_stats       jsonb not null default '{}'::jsonb,
  checksum            text,
  raw_input           text,
  normalized_output   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists legal_ingestion_jobs_source_idx on public.legal_ingestion_jobs(source_id);
create index if not exists legal_ingestion_jobs_status_idx on public.legal_ingestion_jobs(status);
create index if not exists legal_ingestion_jobs_created_idx on public.legal_ingestion_jobs(created_at desc);

create or replace function public.tg_legal_ingestion_jobs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_ingestion_jobs_touch on public.legal_ingestion_jobs;
create trigger trg_legal_ingestion_jobs_touch
  before update on public.legal_ingestion_jobs
  for each row execute function public.tg_legal_ingestion_jobs_touch();

-- 4) legal_source_review_events -------------------------------------------
create table if not exists public.legal_source_review_events (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.legal_sources(id) on delete cascade,
  from_status  public.legal_source_lifecycle,
  to_status    public.legal_source_lifecycle not null,
  actor_id     uuid,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists legal_source_review_events_source_idx on public.legal_source_review_events(source_id);
create index if not exists legal_source_review_events_created_idx on public.legal_source_review_events(created_at desc);

-- 5) Grants (analog bestehender Muster) ------------------------------------
grant select, insert, update, delete on public.legal_ingestion_jobs      to anon, authenticated;
grant all on public.legal_ingestion_jobs to service_role;
grant select, insert, update, delete on public.legal_source_review_events to anon, authenticated;
grant all on public.legal_source_review_events to service_role;

-- 6) RLS (Pilot-Policy, konsistent mit legal_import_pages) ----------------
alter table public.legal_ingestion_jobs       enable row level security;
alter table public.legal_source_review_events enable row level security;

drop policy if exists "legal_ingestion_jobs pilot all"       on public.legal_ingestion_jobs;
create policy "legal_ingestion_jobs pilot all"
  on public.legal_ingestion_jobs for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_source_review_events pilot all" on public.legal_source_review_events;
create policy "legal_source_review_events pilot all"
  on public.legal_source_review_events for all to anon, authenticated
  using (true) with check (true);

-- 7) Schema-Cache neu laden ------------------------------------------------
notify pgrst, 'reload schema';


-- ===== db/2026-07-28_legal_document_structure.sql =====
-- Sprint 4.1B — Legal Document Intelligence Engine
-- Structural document model on top of legal_sections. No embeddings, no RAG.

-- 1) Enum for section types
DO $$ BEGIN
  CREATE TYPE legal_section_type AS ENUM (
    'document','book','part','title','chapter','subchapter','section','subsection',
    'paragraph','article','absatz','sentence','number','letter','annex','table',
    'image','definition','example','footnote','reference','unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend legal_sections with hierarchy + parser metadata
ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.legal_sections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS section_type legal_section_type NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS depth int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_index int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS display_path text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS original_text text,
  ADD COLUMN IF NOT EXISTS normalized_text text,
  ADD COLUMN IF NOT EXISTS start_offset int,
  ADD COLUMN IF NOT EXISTS end_offset int,
  ADD COLUMN IF NOT EXISTS stable_hash text,
  ADD COLUMN IF NOT EXISTS parser_method text,
  ADD COLUMN IF NOT EXISTS parser_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS legal_sections_source_path_idx
  ON public.legal_sections(source_id, path);
CREATE INDEX IF NOT EXISTS legal_sections_source_parent_order_idx
  ON public.legal_sections(source_id, parent_id, order_index);
CREATE INDEX IF NOT EXISTS legal_sections_source_type_idx
  ON public.legal_sections(source_id, section_type);
CREATE UNIQUE INDEX IF NOT EXISTS legal_sections_source_stable_hash_uidx
  ON public.legal_sections(source_id, stable_hash)
  WHERE stable_hash IS NOT NULL;

-- 3) Structured references (deterministic; resolution deferred)
CREATE TABLE IF NOT EXISTS public.legal_section_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.legal_sections(id) ON DELETE CASCADE,
  raw_text text NOT NULL,
  ref_type text NOT NULL,
  ref_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_section_id uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  start_offset int,
  end_offset int,
  confidence numeric(4,3),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.legal_section_references TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.legal_section_references TO authenticated;
GRANT ALL ON public.legal_section_references TO service_role;

ALTER TABLE public.legal_section_references ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "_role_select" ON public.legal_section_references
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "_role_insert_editor" ON public.legal_section_references
    FOR INSERT TO authenticated WITH CHECK (is_editor());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "_role_update_editor" ON public.legal_section_references
    FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "_role_delete_editor" ON public.legal_section_references
    FOR DELETE TO authenticated USING (is_editor());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS legal_section_references_section_idx
  ON public.legal_section_references(section_id);
CREATE INDEX IF NOT EXISTS legal_section_references_resolved_idx
  ON public.legal_section_references(resolved_section_id);
CREATE INDEX IF NOT EXISTS legal_section_references_type_idx
  ON public.legal_section_references(ref_type);


-- ===== db/2026-07-29_legal_embeddings.sql =====
-- ============================================================================
-- Sprint 4.1D – Legal Embedding Platform
-- Datum: 2026-07-29
-- Zweck: Persistente Chunks (legal_chunks) sowie providerunabhängige
--        Embedding-Speicherung (legal_chunk_embeddings) inkl. Batch-Jobs
--        (legal_embedding_jobs, legal_embedding_job_items).
--
-- ARCHITEKTURENTSCHEIDUNGEN
--  E1: Persistente Chunks werden eingeführt (für stabile FK, Rebuilds,
--      Invalidierung). InMemory-Chunks bleiben als Testfixture.
--  E2: Erste Produktversion nutzt EIN Standardmodell mit 1536 Dimensionen
--      (openai/text-embedding-3-small). embedding vector(1536) wird
--      typisiert. Modelle mit abweichenden Dimensionen erfordern eine
--      separate Tabelle oder halfvec-Strategie in einem späteren Sprint.
--  E3: Cosine als Standardmetrik. Vektorindex per Feature-Flag (nicht in
--      dieser Migration erzwungen; bei kleinen Datenmengen unnötig).
--  E4: DB-basierte Queue (worker_id + processing_started_at + Lease).
--
-- Keine Änderungen an Editorial-Workflow, Review oder Publishing.
-- ============================================================================

create extension if not exists vector;

-- 1) Enums --------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_status') then
    create type public.legal_embedding_status as enum (
      'embedded','outdated','failed','disabled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_job_status') then
    create type public.legal_embedding_job_status as enum (
      'queued','preparing','running','partially_completed','completed','failed','cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_job_trigger') then
    create type public.legal_embedding_job_trigger as enum (
      'manual','source_import','source_rebuild','model_migration','retry','maintenance'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_item_status') then
    create type public.legal_embedding_item_status as enum (
      'pending','processing','completed','skipped','retryable','failed'
    );
  end if;
end $$;

-- 2) legal_chunks -------------------------------------------------------------
create table if not exists public.legal_chunks (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.legal_sources(id) on delete cascade,
  primary_section_id  uuid references public.legal_sections(id) on delete set null,
  chunk_id            text not null,
  stable_hash         text not null,
  content_hash        text not null,
  path                text not null,
  display_path        text,
  breadcrumb          jsonb not null default '[]'::jsonb,
  chunk_type          text not null,
  title               text,
  content             text not null,
  normalized_content  text not null,
  section_ids         jsonb not null default '[]'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  "references"        jsonb not null default '[]'::jsonb,
  token_estimate      integer not null default 0,
  character_count     integer not null default 0,
  word_count          integer not null default 0,
  sentence_count      integer not null default 0,
  order_index         integer not null default 0,
  parent_chunk_id     uuid references public.legal_chunks(id) on delete set null,
  confidence          numeric,
  chunk_version       integer not null default 1,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_id, chunk_id, chunk_version)
);

create index if not exists legal_chunks_source_idx        on public.legal_chunks(source_id);
create index if not exists legal_chunks_stable_hash_idx   on public.legal_chunks(stable_hash);
create index if not exists legal_chunks_active_idx        on public.legal_chunks(active);
create index if not exists legal_chunks_primary_section_idx on public.legal_chunks(primary_section_id);
create index if not exists legal_chunks_type_idx          on public.legal_chunks(chunk_type);

create or replace function public.tg_legal_chunks_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_chunks_touch on public.legal_chunks;
create trigger trg_legal_chunks_touch
  before update on public.legal_chunks
  for each row execute function public.tg_legal_chunks_touch();

-- 3) legal_chunk_embeddings ---------------------------------------------------
create table if not exists public.legal_chunk_embeddings (
  id                     uuid primary key default gen_random_uuid(),
  source_id              uuid not null references public.legal_sources(id) on delete cascade,
  chunk_id               uuid not null references public.legal_chunks(id) on delete cascade,
  chunk_stable_hash      text not null,
  chunk_path             text not null,
  provider_id            text not null,
  model_id               text not null,
  model_version          text not null,
  dimensions             integer not null,
  embedding              vector(1536) not null,
  embedding_status       public.legal_embedding_status not null default 'embedded',
  content_hash           text not null,
  input_format_version   integer not null default 1,
  token_count            integer,
  input_character_count  integer,
  usage_metadata         jsonb not null default '{}'::jsonb,
  cost_metadata          jsonb not null default '{}'::jsonb,
  error_code             text,
  error_message          text,
  attempt_count          integer not null default 0,
  embedded_at            timestamptz not null default now(),
  invalidated_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Nur ein aktives Embedding pro Chunk × Modell × Modellversion × Inputformat.
create unique index if not exists legal_chunk_embeddings_active_uniq
  on public.legal_chunk_embeddings (chunk_id, model_id, model_version, input_format_version)
  where invalidated_at is null;

create index if not exists legal_chunk_embeddings_source_idx      on public.legal_chunk_embeddings(source_id);
create index if not exists legal_chunk_embeddings_chunk_idx       on public.legal_chunk_embeddings(chunk_id);
create index if not exists legal_chunk_embeddings_stable_hash_idx on public.legal_chunk_embeddings(chunk_stable_hash);
create index if not exists legal_chunk_embeddings_model_idx       on public.legal_chunk_embeddings(model_id, model_version);
create index if not exists legal_chunk_embeddings_status_idx      on public.legal_chunk_embeddings(embedding_status);
create index if not exists legal_chunk_embeddings_embedded_at_idx on public.legal_chunk_embeddings(embedded_at desc);

create or replace function public.tg_legal_chunk_embeddings_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_chunk_embeddings_touch on public.legal_chunk_embeddings;
create trigger trg_legal_chunk_embeddings_touch
  before update on public.legal_chunk_embeddings
  for each row execute function public.tg_legal_chunk_embeddings_touch();

-- 4) legal_embedding_jobs -----------------------------------------------------
create table if not exists public.legal_embedding_jobs (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.legal_sources(id) on delete cascade,
  provider_id         text not null,
  model_id            text not null,
  model_version       text not null,
  input_format_version integer not null default 1,
  status              public.legal_embedding_job_status not null default 'queued',
  requested_by        uuid,
  trigger_type        public.legal_embedding_job_trigger not null default 'manual',
  total_chunks        integer not null default 0,
  pending_chunks      integer not null default 0,
  processed_chunks    integer not null default 0,
  successful_chunks   integer not null default 0,
  failed_chunks       integer not null default 0,
  skipped_chunks      integer not null default 0,
  estimated_tokens    integer not null default 0,
  actual_tokens       integer not null default 0,
  estimated_cost      numeric not null default 0,
  actual_cost         numeric not null default 0,
  cost_source         text not null default 'estimated',
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  error_summary       jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists legal_embedding_jobs_source_idx  on public.legal_embedding_jobs(source_id);
create index if not exists legal_embedding_jobs_status_idx  on public.legal_embedding_jobs(status);
create index if not exists legal_embedding_jobs_created_idx on public.legal_embedding_jobs(created_at desc);

create or replace function public.tg_legal_embedding_jobs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_embedding_jobs_touch on public.legal_embedding_jobs;
create trigger trg_legal_embedding_jobs_touch
  before update on public.legal_embedding_jobs
  for each row execute function public.tg_legal_embedding_jobs_touch();

-- 5) legal_embedding_job_items ------------------------------------------------
create table if not exists public.legal_embedding_job_items (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.legal_embedding_jobs(id) on delete cascade,
  chunk_id              uuid not null references public.legal_chunks(id) on delete cascade,
  chunk_stable_hash     text not null,
  status                public.legal_embedding_item_status not null default 'pending',
  attempt_count         integer not null default 0,
  provider_request_id   text,
  token_count           integer,
  latency_ms            integer,
  worker_id             text,
  processing_started_at timestamptz,
  processing_lease_until timestamptz,
  error_code            text,
  error_message         text,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists legal_embedding_job_items_job_idx    on public.legal_embedding_job_items(job_id);
create index if not exists legal_embedding_job_items_chunk_idx  on public.legal_embedding_job_items(chunk_id);
create index if not exists legal_embedding_job_items_status_idx on public.legal_embedding_job_items(status);

create or replace function public.tg_legal_embedding_job_items_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_embedding_job_items_touch on public.legal_embedding_job_items;
create trigger trg_legal_embedding_job_items_touch
  before update on public.legal_embedding_job_items
  for each row execute function public.tg_legal_embedding_job_items_touch();

-- 6) Grants (analog Sprint 4.1A/B) -------------------------------------------
grant select, insert, update, delete on public.legal_chunks              to anon, authenticated;
grant all on public.legal_chunks              to service_role;
grant select, insert, update, delete on public.legal_chunk_embeddings    to anon, authenticated;
grant all on public.legal_chunk_embeddings    to service_role;
grant select, insert, update, delete on public.legal_embedding_jobs      to anon, authenticated;
grant all on public.legal_embedding_jobs      to service_role;
grant select, insert, update, delete on public.legal_embedding_job_items to anon, authenticated;
grant all on public.legal_embedding_job_items to service_role;

-- 7) RLS (Pilot-Policy, konsistent mit anderen legal_*-Tabellen) -------------
alter table public.legal_chunks              enable row level security;
alter table public.legal_chunk_embeddings    enable row level security;
alter table public.legal_embedding_jobs      enable row level security;
alter table public.legal_embedding_job_items enable row level security;

drop policy if exists "legal_chunks pilot all" on public.legal_chunks;
create policy "legal_chunks pilot all"
  on public.legal_chunks for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_chunk_embeddings pilot all" on public.legal_chunk_embeddings;
create policy "legal_chunk_embeddings pilot all"
  on public.legal_chunk_embeddings for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_embedding_jobs pilot all" on public.legal_embedding_jobs;
create policy "legal_embedding_jobs pilot all"
  on public.legal_embedding_jobs for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_embedding_job_items pilot all" on public.legal_embedding_job_items;
create policy "legal_embedding_job_items pilot all"
  on public.legal_embedding_job_items for all to anon, authenticated
  using (true) with check (true);

-- 8) Schema-Cache neu laden ---------------------------------------------------
notify pgrst, 'reload schema';


-- ===== db/2026-07-30_workflow_platform.sql =====
-- Sprint 4.3 – Data-Driven Workflow Platform
-- Rein datengetriebene Workflow-Engine: 14 Tabellen, RLS, Grants,
-- Seed für einen Pilot-Workflow ("Verdacht auf Lese-Rechtschreib-Schwäche").
--
-- Redaktionelle Templates werden über die bestehenden Editorial-Rollen
-- (is_editor/is_admin) verwaltet. Ausführungssessions gehören dem
-- eingeloggten Nutzer und sind über auth.uid() abgeschottet.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.workflow_template_status AS ENUM
    ('draft','in_review','approved','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_publication_tier AS ENUM ('internal','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_session_status AS ENUM
    ('draft','ready','running','paused','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step_status AS ENUM
    ('open','active','waiting','completed','skipped','blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step_type AS ENUM
    ('information','decision','action','document','review','communication','wait');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_priority AS ENUM ('low','normal','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_risk_level AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_role AS ENUM
    ('teacher','class_lead','principal','deputy','office','social_worker','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1) workflow_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  description text,
  icon        text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workflow_categories TO anon, authenticated;
GRANT ALL    ON public.workflow_categories TO service_role;
ALTER TABLE public.workflow_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_cat_read ON public.workflow_categories;
CREATE POLICY wf_cat_read ON public.workflow_categories
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_cat_write ON public.workflow_categories;
CREATE POLICY wf_cat_write ON public.workflow_categories
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 2) workflow_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         uuid REFERENCES public.workflow_categories(id) ON DELETE SET NULL,
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,
  subtitle            text,
  description         text,
  workflow_status     public.workflow_template_status NOT NULL DEFAULT 'draft',
  publication_tier    public.workflow_publication_tier NOT NULL DEFAULT 'internal',
  current_version_id  uuid,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT SELECT ON public.workflow_templates TO anon;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_tpl_read_pub ON public.workflow_templates;
CREATE POLICY wf_tpl_read_pub ON public.workflow_templates
  FOR SELECT TO anon, authenticated
  USING (workflow_status = 'published' AND publication_tier = 'public');
DROP POLICY IF EXISTS wf_tpl_read_editor ON public.workflow_templates;
CREATE POLICY wf_tpl_read_editor ON public.workflow_templates
  FOR SELECT TO authenticated USING (public.is_editor() OR workflow_status = 'published');
DROP POLICY IF EXISTS wf_tpl_write ON public.workflow_templates;
CREATE POLICY wf_tpl_write ON public.workflow_templates
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 3) workflow_template_versions (immutable snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_template_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  snapshot     jsonb NOT NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
GRANT SELECT, INSERT ON public.workflow_template_versions TO authenticated;
GRANT SELECT ON public.workflow_template_versions TO anon;
GRANT ALL ON public.workflow_template_versions TO service_role;
ALTER TABLE public.workflow_template_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_ver_read ON public.workflow_template_versions;
CREATE POLICY wf_ver_read ON public.workflow_template_versions
  FOR SELECT TO authenticated USING (
    public.is_editor() OR EXISTS (
      SELECT 1 FROM public.workflow_templates t
      WHERE t.id = template_id AND t.workflow_status = 'published'
    )
  );
DROP POLICY IF EXISTS wf_ver_read_anon ON public.workflow_template_versions;
CREATE POLICY wf_ver_read_anon ON public.workflow_template_versions
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.workflow_templates t
      WHERE t.id = template_id
        AND t.workflow_status = 'published'
        AND t.publication_tier = 'public'
    )
  );
DROP POLICY IF EXISTS wf_ver_write ON public.workflow_template_versions;
CREATE POLICY wf_ver_write ON public.workflow_template_versions
  FOR INSERT TO authenticated WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 4) workflow_phases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_phases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  sort_order            int  NOT NULL DEFAULT 0,
  title                 text NOT NULL,
  description           text,
  is_required           boolean NOT NULL DEFAULT true,
  completion_condition  text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_phases TO authenticated;
GRANT SELECT ON public.workflow_phases TO anon;
GRANT ALL ON public.workflow_phases TO service_role;
ALTER TABLE public.workflow_phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_phase_read ON public.workflow_phases;
CREATE POLICY wf_phase_read ON public.workflow_phases
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = template_id
      AND (t.workflow_status = 'published' OR public.is_editor()))
  );
DROP POLICY IF EXISTS wf_phase_write ON public.workflow_phases;
CREATE POLICY wf_phase_write ON public.workflow_phases
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 5) workflow_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  phase_id          uuid NOT NULL REFERENCES public.workflow_phases(id) ON DELETE CASCADE,
  sort_order        int  NOT NULL DEFAULT 0,
  title             text NOT NULL,
  description       text,
  goal              text,
  step_type         public.workflow_step_type NOT NULL DEFAULT 'action',
  priority          public.workflow_priority NOT NULL DEFAULT 'normal',
  is_required       boolean NOT NULL DEFAULT true,
  estimated_minutes int,
  primary_role      public.workflow_role,
  risk_level        public.workflow_risk_level NOT NULL DEFAULT 'low'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO authenticated;
GRANT SELECT ON public.workflow_steps TO anon;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_step_read ON public.workflow_steps;
CREATE POLICY wf_step_read ON public.workflow_steps
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = template_id
      AND (t.workflow_status = 'published' OR public.is_editor()))
  );
DROP POLICY IF EXISTS wf_step_write ON public.workflow_steps;
CREATE POLICY wf_step_write ON public.workflow_steps
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 6) workflow_step_dependencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_dependencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id              uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  depends_on_step_id   uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  UNIQUE (step_id, depends_on_step_id),
  CHECK (step_id <> depends_on_step_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_dependencies TO authenticated;
GRANT SELECT ON public.workflow_step_dependencies TO anon;
GRANT ALL ON public.workflow_step_dependencies TO service_role;
ALTER TABLE public.workflow_step_dependencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_dep_read ON public.workflow_step_dependencies;
CREATE POLICY wf_dep_read ON public.workflow_step_dependencies
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_dep_write ON public.workflow_step_dependencies;
CREATE POLICY wf_dep_write ON public.workflow_step_dependencies
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 7) workflow_step_checklists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_checklists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id      uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  sort_order   int  NOT NULL DEFAULT 0,
  title        text NOT NULL,
  is_required  boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_checklists TO authenticated;
GRANT SELECT ON public.workflow_step_checklists TO anon;
GRANT ALL ON public.workflow_step_checklists TO service_role;
ALTER TABLE public.workflow_step_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_check_read ON public.workflow_step_checklists;
CREATE POLICY wf_check_read ON public.workflow_step_checklists
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_check_write ON public.workflow_step_checklists;
CREATE POLICY wf_check_write ON public.workflow_step_checklists
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 8) workflow_step_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id        uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  template_slug  text NOT NULL,
  title          text NOT NULL,
  note           text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_documents TO authenticated;
GRANT SELECT ON public.workflow_step_documents TO anon;
GRANT ALL ON public.workflow_step_documents TO service_role;
ALTER TABLE public.workflow_step_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_doc_read ON public.workflow_step_documents;
CREATE POLICY wf_doc_read ON public.workflow_step_documents
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_doc_write ON public.workflow_step_documents;
CREATE POLICY wf_doc_write ON public.workflow_step_documents
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 9) workflow_step_roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id       uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  role          public.workflow_role NOT NULL,
  can_edit      boolean NOT NULL DEFAULT true,
  can_complete  boolean NOT NULL DEFAULT true,
  UNIQUE (step_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_roles TO authenticated;
GRANT SELECT ON public.workflow_step_roles TO anon;
GRANT ALL ON public.workflow_step_roles TO service_role;
ALTER TABLE public.workflow_step_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_role_read ON public.workflow_step_roles;
CREATE POLICY wf_role_read ON public.workflow_step_roles
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_role_write ON public.workflow_step_roles;
CREATE POLICY wf_role_write ON public.workflow_step_roles
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 10) workflow_step_sources (referenzieren Rechtsquellen)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id           uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  legal_section_id  uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  citation_hint     text,
  note              text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_sources TO authenticated;
GRANT SELECT ON public.workflow_step_sources TO anon;
GRANT ALL ON public.workflow_step_sources TO service_role;
ALTER TABLE public.workflow_step_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_src_read ON public.workflow_step_sources;
CREATE POLICY wf_src_read ON public.workflow_step_sources
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_src_write ON public.workflow_step_sources;
CREATE POLICY wf_src_write ON public.workflow_step_sources
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 11) workflow_rules (redaktionell gepflegte if/then)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  when_type    text NOT NULL,   -- z.B. 'step_completed', 'checklist_missing', 'document_missing'
  when_ref     text,             -- Referenz (Step-Slug, Checklisten-Slug ...)
  then_action  text NOT NULL,   -- z.B. 'unlock_step','block_workflow','set_priority'
  then_ref     text,
  priority     int  NOT NULL DEFAULT 100
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_rules TO authenticated;
GRANT SELECT ON public.workflow_rules TO anon;
GRANT ALL ON public.workflow_rules TO service_role;
ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_rule_read ON public.workflow_rules;
CREATE POLICY wf_rule_read ON public.workflow_rules
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_rule_write ON public.workflow_rules;
CREATE POLICY wf_rule_write ON public.workflow_rules
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 12) workflow_execution_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_execution_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE RESTRICT,
  template_version_id   uuid REFERENCES public.workflow_template_versions(id) ON DELETE SET NULL,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_status        public.workflow_session_status NOT NULL DEFAULT 'ready',
  context               jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at            timestamptz,
  paused_at             timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_execution_sessions TO authenticated;
GRANT ALL ON public.workflow_execution_sessions TO service_role;
ALTER TABLE public.workflow_execution_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_sess_owner ON public.workflow_execution_sessions;
CREATE POLICY wf_sess_owner ON public.workflow_execution_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 13) workflow_execution_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_execution_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.workflow_execution_sessions(id) ON DELETE CASCADE,
  step_id          uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE RESTRICT,
  step_status      public.workflow_step_status NOT NULL DEFAULT 'open',
  checklist_state  jsonb NOT NULL DEFAULT '[]'::jsonb,
  note             text,
  started_at       timestamptz,
  completed_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, step_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_execution_steps TO authenticated;
GRANT ALL ON public.workflow_execution_steps TO service_role;
ALTER TABLE public.workflow_execution_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_exec_step_owner ON public.workflow_execution_steps;
CREATE POLICY wf_exec_step_owner ON public.workflow_execution_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
                 WHERE s.id = session_id
                   AND (s.user_id = auth.uid() OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
                      WHERE s.id = session_id
                        AND (s.user_id = auth.uid() OR public.is_admin())));

-- ---------------------------------------------------------------------------
-- 14) workflow_events (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.workflow_execution_sessions(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  actor        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  at           timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_event_read ON public.workflow_events;
CREATE POLICY wf_event_read ON public.workflow_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
      WHERE s.id = session_id AND (s.user_id = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS wf_event_write ON public.workflow_events;
CREATE POLICY wf_event_write ON public.workflow_events
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid())
  );

-- append-only: kein UPDATE/DELETE
CREATE OR REPLACE FUNCTION public._workflow_events_readonly()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$ BEGIN
  RAISE EXCEPTION 'workflow_events are append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS wf_events_no_update ON public.workflow_events;
CREATE TRIGGER wf_events_no_update BEFORE UPDATE ON public.workflow_events
  FOR EACH ROW EXECUTE FUNCTION public._workflow_events_readonly();
DROP TRIGGER IF EXISTS wf_events_no_delete ON public.workflow_events;
CREATE TRIGGER wf_events_no_delete BEFORE DELETE ON public.workflow_events
  FOR EACH ROW EXECUTE FUNCTION public._workflow_events_readonly();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wf_templates_category  ON public.workflow_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_wf_templates_status    ON public.workflow_templates(workflow_status);
CREATE INDEX IF NOT EXISTS idx_wf_versions_template   ON public.workflow_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_wf_phases_template     ON public.workflow_phases(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wf_steps_template      ON public.workflow_steps(template_id, phase_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wf_deps_step           ON public.workflow_step_dependencies(step_id);
CREATE INDEX IF NOT EXISTS idx_wf_deps_depends        ON public.workflow_step_dependencies(depends_on_step_id);
CREATE INDEX IF NOT EXISTS idx_wf_sess_user           ON public.workflow_execution_sessions(user_id, session_status);
CREATE INDEX IF NOT EXISTS idx_wf_exec_step_session   ON public.workflow_execution_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_wf_events_session      ON public.workflow_events(session_id, at DESC);



COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-07-31_workflow_pilot_reference.sql =====
-- Sprint 4.3 – Referenz-Pilot-Workflow
--
-- Ein einziger, vollständig ausgearbeiteter Workflow als reine Seed-Definition.
-- Zweck: Demonstrations- und Referenzimplementierung für alle Fähigkeiten der
-- generischen Workflow-Engine. Es wird KEIN Engine-Code geändert. Fachliche
-- Logik lebt ausschließlich in dieser Seed-Datei.
--
-- Genutzte Fähigkeiten:
--   • Kategorie + Template (published, internal)
--   • 5 Phasen mit unterschiedlichen Anforderungen
--   • 10 Schritte über ALLE workflow_step_type-Varianten
--     (information, decision, action, document, review, communication, wait)
--   • Verzweigte Abhängigkeitsgraphen (kein reiner linearer Pfad)
--   • Prioritäten (low/normal/high/critical) und Risiko-Level
--   • Checklisten (required + optional)
--   • Dokumentvorschläge (template_slug + note)
--   • Rollen mit differenzierten Rechten (can_edit / can_complete)
--   • Rechtsgrundlagen-Referenzen via citation_hint (+ optional legal_section_id)
--   • Regeln über alle Aktionstypen der WorkflowRuleEngine:
--       when: step_completed, checklist_missing, document_missing
--       then: unlock_step, block_workflow, set_priority, recommend
--
-- Slug: 'ordnungsmassnahme-pflichtverletzung' – Referenz-Workflow zur
-- strukturierten Bearbeitung eines schwerwiegenden Vorfalls bis zur
-- Ordnungsmaßnahme.

BEGIN;

DO $$
DECLARE
  cat_id  uuid;
  tpl_id  uuid;
  ph1_id  uuid;  -- Sofortlage
  ph2_id  uuid;  -- Sachverhaltsklärung
  ph3_id  uuid;  -- Anhörung
  ph4_id  uuid;  -- Entscheidung
  ph5_id  uuid;  -- Umsetzung & Nachsorge
  st_sichern_id      uuid;
  st_meldung_id      uuid;
  st_zeugen_id       uuid;
  st_beweise_id      uuid;
  st_einordnung_id   uuid;
  st_anhoerung_id    uuid;
  st_bescheid_id     uuid;
  st_wartefrist_id   uuid;
  st_umsetzung_id    uuid;
  st_nachsorge_id    uuid;
BEGIN
  -- ---------------------------------------------------------------------
  -- Kategorie
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_categories (slug, title, description, icon, sort_order)
  VALUES ('ordnungsmassnahmen','Ordnungsmaßnahmen & Konflikte',
          'Workflows für schwerwiegende Pflichtverletzungen und Konflikte.',
          'gavel', 20)
  ON CONFLICT (slug) DO UPDATE SET
    title       = EXCLUDED.title,
    description = EXCLUDED.description,
    icon        = EXCLUDED.icon,
    sort_order  = EXCLUDED.sort_order
  RETURNING id INTO cat_id;

  -- ---------------------------------------------------------------------
  -- Template
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_templates
    (category_id, slug, title, subtitle, description,
     workflow_status, publication_tier)
  VALUES (cat_id,'ordnungsmassnahme-pflichtverletzung',
          'Ordnungsmaßnahme nach schwerer Pflichtverletzung',
          'Referenz-Workflow: von der Sofortlage bis zur formalen Maßnahme',
          'Vollständig ausgearbeiteter Referenz-Workflow. Führt strukturiert '
          || 'durch Sicherung, Sachverhaltsklärung, Anhörung, Entscheidung '
          || 'und Nachsorge. Nutzt alle Fähigkeiten der Workflow-Engine.',
          'published','internal')
  ON CONFLICT (slug) DO UPDATE SET
    title            = EXCLUDED.title,
    subtitle         = EXCLUDED.subtitle,
    description      = EXCLUDED.description,
    workflow_status  = EXCLUDED.workflow_status,
    publication_tier = EXCLUDED.publication_tier
  RETURNING id INTO tpl_id;

  -- Alte Kind-Datensätze aufräumen (idempotent re-seed)
  DELETE FROM public.workflow_rules            WHERE template_id = tpl_id;
  DELETE FROM public.workflow_step_sources
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_roles
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_documents
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_checklists
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_dependencies
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_steps  WHERE template_id = tpl_id;
  DELETE FROM public.workflow_phases WHERE template_id = tpl_id;

  -- ---------------------------------------------------------------------
  -- Phasen
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 10, 'Sofortlage',
          'Sicherheit herstellen und Vorfall unverzüglich dokumentieren.',
          true, 'Alle Pflicht-Schritte der Phase abgeschlossen.')
  RETURNING id INTO ph1_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 20, 'Sachverhaltsklärung',
          'Beweise sichern, Zeugen befragen, Sachverhalt objektiv einordnen.',
          true, 'Sachverhalt ist konsolidiert dokumentiert.')
  RETURNING id INTO ph2_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 30, 'Anhörung',
          'Rechtliches Gehör für Betroffene und Erziehungsberechtigte.',
          true, 'Protokolliertes Anhörungsgespräch liegt vor.')
  RETURNING id INTO ph3_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 40, 'Entscheidung',
          'Ordnungsmaßnahme wählen, Verhältnismäßigkeit prüfen, Bescheid erstellen.',
          true, 'Bescheid ist unterschrieben und zugestellt.')
  RETURNING id INTO ph4_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 50, 'Umsetzung & Nachsorge',
          'Maßnahme umsetzen, Frist wahren, pädagogisch begleiten.',
          false, 'Nachsorge dokumentiert oder Frist abgelaufen.')
  RETURNING id INTO ph5_id;

  -- ---------------------------------------------------------------------
  -- Schritte – decken alle workflow_step_type-Werte ab
  -- ---------------------------------------------------------------------
  -- Phase 1: Sofortlage
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph1_id, 10, 'Situation sichern',
          'Beteiligte trennen, akute Gefährdung abwenden, Ruhe herstellen.',
          'Keine weitere Eskalation.',
          'action','critical', true, 15, 'teacher','high')
  RETURNING id INTO st_sichern_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph1_id, 20, 'Vorfall an Schulleitung melden',
          'Kurze, sachliche Meldung mit Zeit, Ort, Beteiligten und Kernaussage.',
          'Schulleitung ist informiert und einbezogen.',
          'communication','high', true, 15, 'teacher','medium')
  RETURNING id INTO st_meldung_id;

  -- Phase 2: Sachverhaltsklärung
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph2_id, 10, 'Zeuginnen und Zeugen befragen',
          'Einzeln, sachlich, mit Datum und Wortlaut protokollieren.',
          'Belastbare Zeugenaussagen liegen vor.',
          'information','normal', true, 60, 'class_lead','medium')
  RETURNING id INTO st_zeugen_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph2_id, 20, 'Beweise sichern',
          'Fotos, Screenshots, Sachbeschädigungen dokumentieren; Originale aufbewahren.',
          'Beweislage ist gesichert und nachvollziehbar abgelegt.',
          'document','high', false, 30, 'class_lead','medium')
  RETURNING id INTO st_beweise_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph2_id, 30, 'Sachverhalt einordnen',
          'Ist eine erzieherische Einwirkung ausreichend oder ist eine förmliche '
          || 'Ordnungsmaßnahme erforderlich?',
          'Rechtliche Einordnung getroffen.',
          'decision','high', true, 30, 'principal','high')
  RETURNING id INTO st_einordnung_id;

  -- Phase 3: Anhörung
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph3_id, 10, 'Anhörung durchführen',
          'Betroffene Schülerin/Schüler sowie Erziehungsberechtigte anhören und protokollieren.',
          'Rechtliches Gehör gewährt und dokumentiert.',
          'communication','high', true, 60, 'principal','high')
  RETURNING id INTO st_anhoerung_id;

  -- Phase 4: Entscheidung
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph4_id, 10, 'Bescheid erstellen und unterzeichnen',
          'Ordnungsmaßnahme festlegen, Verhältnismäßigkeit begründen, Bescheid ausfertigen.',
          'Rechtsmittelfähiger Bescheid liegt vor.',
          'review','critical', true, 45, 'principal','high')
  RETURNING id INTO st_bescheid_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph4_id, 20, 'Zustellung & Wartefrist',
          'Bescheid nachweisbar zustellen und Rechtsmittelfrist abwarten.',
          'Zustellung dokumentiert, Frist läuft.',
          'wait','normal', true, 5, 'office','low')
  RETURNING id INTO st_wartefrist_id;

  -- Phase 5: Umsetzung & Nachsorge
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph5_id, 10, 'Maßnahme umsetzen',
          'Angeordnete Maßnahme organisatorisch umsetzen (z. B. Kursausschluss, Klassenwechsel).',
          'Maßnahme wirksam umgesetzt.',
          'action','normal', true, 30, 'deputy','medium')
  RETURNING id INTO st_umsetzung_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph5_id, 20, 'Pädagogische Nachsorge',
          'Reflexionsgespräch, Wiedergutmachung, Anbindung Schulsozialarbeit.',
          'Reintegration angebahnt.',
          'communication','normal', false, 45, 'social_worker','low')
  RETURNING id INTO st_nachsorge_id;

  -- ---------------------------------------------------------------------
  -- Abhängigkeitsgraph (verzweigt, kein reiner linearer Pfad)
  --
  --   sichern
  --      └─► meldung
  --             ├─► zeugen ──┐
  --             └─► beweise ─┤
  --                          └─► einordnung ──► anhörung
  --                                                 └─► bescheid ──► wartefrist
  --                                                                      ├─► umsetzung
  --                                                                      └─► nachsorge
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_dependencies (step_id, depends_on_step_id) VALUES
    (st_meldung_id,    st_sichern_id),
    (st_zeugen_id,     st_meldung_id),
    (st_beweise_id,    st_meldung_id),
    (st_einordnung_id, st_zeugen_id),
    (st_einordnung_id, st_beweise_id),
    (st_anhoerung_id,  st_einordnung_id),
    (st_bescheid_id,   st_anhoerung_id),
    (st_wartefrist_id, st_bescheid_id),
    (st_umsetzung_id,  st_wartefrist_id),
    (st_nachsorge_id,  st_wartefrist_id);

  -- ---------------------------------------------------------------------
  -- Checklisten (Pflicht + optional)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_checklists (step_id, sort_order, title, is_required) VALUES
    (st_sichern_id,     10, 'Beteiligte räumlich getrennt',                   true),
    (st_sichern_id,     20, 'Notruf / Erste Hilfe geprüft',                   true),
    (st_sichern_id,     30, 'Zeitpunkt und Ort notiert',                      false),

    (st_meldung_id,     10, 'Schulleitung mündlich informiert',               true),
    (st_meldung_id,     20, 'Kurznotiz schriftlich an Sekretariat',           true),

    (st_zeugen_id,      10, 'Einzelbefragungen durchgeführt',                 true),
    (st_zeugen_id,      20, 'Protokolle unterschrieben',                      false),

    (st_beweise_id,     10, 'Fotos/Screenshots gesichert',                    false),
    (st_beweise_id,     20, 'Originale abgelegt',                             false),

    (st_einordnung_id,  10, 'Verhältnismäßigkeit geprüft',                    true),
    (st_einordnung_id,  20, 'Milderes Mittel abgewogen',                      true),

    (st_anhoerung_id,   10, 'Erziehungsberechtigte eingeladen',               true),
    (st_anhoerung_id,   20, 'Anhörungsprotokoll erstellt',                    true),
    (st_anhoerung_id,   30, 'Gegenvortrag zur Kenntnis genommen',             true),

    (st_bescheid_id,    10, 'Begründung enthält Sachverhalt',                 true),
    (st_bescheid_id,    20, 'Rechtsbehelfsbelehrung enthalten',               true),
    (st_bescheid_id,    30, 'Unterschrift Schulleitung',                      true),

    (st_wartefrist_id,  10, 'Zustellungsnachweis in Akte',                    true),

    (st_umsetzung_id,   10, 'Klassenleitung informiert',                      true),
    (st_umsetzung_id,   20, 'Stundenplan/Organisatorisches angepasst',        false),

    (st_nachsorge_id,   10, 'Reflexionsgespräch geführt',                     false),
    (st_nachsorge_id,   20, 'Schulsozialarbeit einbezogen',                   false);

  -- ---------------------------------------------------------------------
  -- Dokumentvorschläge (verweisen auf template_slug in Vorlagen-Bibliothek)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_documents (step_id, template_slug, title, note) VALUES
    (st_meldung_id,    'meldung-schulleitung',   'Meldung an Schulleitung',
       'Kurze sachliche Erstmeldung.'),
    (st_zeugen_id,     'zeugenprotokoll',        'Zeugenprotokoll',
       'Ein Formular je Zeugin/Zeuge.'),
    (st_beweise_id,    'beweisverzeichnis',      'Beweisverzeichnis',
       'Nummerierte Ablage mit Fundort.'),
    (st_anhoerung_id,  'anhoerungsprotokoll',    'Anhörungsprotokoll',
       'Wortlautprotokoll, von beiden Seiten unterschrieben.'),
    (st_bescheid_id,   'bescheid-ordnungsmassnahme','Bescheid Ordnungsmaßnahme',
       'Mit Rechtsbehelfsbelehrung.'),
    (st_nachsorge_id,  'reflexionsprotokoll',    'Reflexionsprotokoll',
       'Pädagogische Nachsorge.');

  -- ---------------------------------------------------------------------
  -- Rollen (differenzierte Rechte je Schritt)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_roles (step_id, role, can_edit, can_complete) VALUES
    (st_sichern_id,     'teacher',       true,  true),
    (st_sichern_id,     'class_lead',    true,  true),

    (st_meldung_id,     'teacher',       true,  true),
    (st_meldung_id,     'office',        true,  false),

    (st_zeugen_id,      'class_lead',    true,  true),
    (st_zeugen_id,      'teacher',       true,  false),

    (st_beweise_id,     'class_lead',    true,  true),

    (st_einordnung_id,  'principal',     true,  true),
    (st_einordnung_id,  'deputy',        true,  false),

    (st_anhoerung_id,   'principal',     true,  true),
    (st_anhoerung_id,   'deputy',        true,  true),

    (st_bescheid_id,    'principal',     true,  true),
    (st_bescheid_id,    'office',        false, false),

    (st_wartefrist_id,  'office',        true,  true),

    (st_umsetzung_id,   'deputy',        true,  true),
    (st_umsetzung_id,   'office',        true,  false),

    (st_nachsorge_id,   'social_worker', true,  true),
    (st_nachsorge_id,   'class_lead',    true,  false);

  -- ---------------------------------------------------------------------
  -- Rechtsgrundlagen-Referenzen
  -- (legal_section_id bleibt NULL, wenn Bibliothek den Eintrag noch nicht kennt)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_sources (step_id, legal_section_id, citation_hint, note) VALUES
    (st_sichern_id,     NULL, 'Aufsichtspflicht der Lehrkraft',
       'Grundlage für sofortiges Handeln.'),
    (st_einordnung_id,  NULL, 'Schulgesetz – Ordnungsmaßnahmen (Verhältnismäßigkeit)',
       'Ist die formale Maßnahme geboten?'),
    (st_anhoerung_id,   NULL, 'Anspruch auf rechtliches Gehör',
       'Vor jeder belastenden Maßnahme.'),
    (st_bescheid_id,    NULL, 'Schulgesetz – Katalog der Ordnungsmaßnahmen',
       'Auswahl der konkreten Maßnahme.'),
    (st_bescheid_id,    NULL, 'Verwaltungsverfahrensrecht – Bescheidbestandteile',
       'Begründung und Rechtsbehelfsbelehrung.'),
    (st_wartefrist_id,  NULL, 'Rechtsmittelfrist nach Zustellung',
       'Fristbeginn dokumentieren.');

  -- ---------------------------------------------------------------------
  -- Regeln – decken alle Aktions- und Ereignistypen der RuleEngine ab
  --   when: step_completed | checklist_missing | document_missing
  --   then: unlock_step | block_workflow | set_priority | recommend
  --
  -- Referenzen werden per Titel/Slug aufgelöst (siehe WorkflowRuleEngine).
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_rules
    (template_id, when_type, when_ref, then_action, then_ref, priority) VALUES
    -- 1) Bescheid darf ohne Anhörungsprotokoll niemals versendet werden.
    (tpl_id, 'checklist_missing', 'Anhörungsprotokoll erstellt',
             'block_workflow',    NULL, 10),

    -- 2) Ohne Rechtsbehelfsbelehrung darf der Workflow nicht abgeschlossen werden.
    (tpl_id, 'checklist_missing', 'Rechtsbehelfsbelehrung enthalten',
             'block_workflow',    NULL, 10),

    -- 3) Fehlt der Bescheid als Dokument, blockieren.
    (tpl_id, 'document_missing',  'bescheid-ordnungsmassnahme',
             'block_workflow',    NULL, 15),

    -- 4) Sobald Sofortlage gesichert ist, Meldung an Schulleitung freigeben.
    (tpl_id, 'step_completed',    'Situation sichern',
             'unlock_step',       'Vorfall an Schulleitung melden', 20),

    -- 5) Nach der Einordnung Anhörung mit hoher Priorität führen.
    (tpl_id, 'step_completed',    'Sachverhalt einordnen',
             'set_priority',      'Anhörung durchführen', 30),

    -- 6) Nach der Anhörung Bescheid als kritisch markieren.
    (tpl_id, 'step_completed',    'Anhörung durchführen',
             'set_priority',      'Bescheid erstellen und unterzeichnen', 30),

    -- 7) Nach Zustellung Nachsorge empfehlen (optional, keine Blockade).
    (tpl_id, 'step_completed',    'Zustellung & Wartefrist',
             'recommend',         'Pädagogische Nachsorge', 40),

    -- 8) Fehlt das Zeugenprotokoll, Beweissicherung mit höherer Priorität empfehlen.
    (tpl_id, 'document_missing',  'zeugenprotokoll',
             'set_priority',      'Beweise sichern', 50);

END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ===== db/2026-08-01_workflow_session_documents.sql =====
-- Sprint 4.5A – Document Generation Core
-- Reuse: document_templates + workflow_step_documents. Neu: workflow_session_documents.
-- Idempotent.

-- 1. Vorlagen um Markdown-Body und Dokumenttyp ergänzen (optional, non-breaking).
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS markdown_body text;
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS document_type text;

-- 2. Erzeugte Dokumente pro Session.
CREATE TABLE IF NOT EXISTS public.workflow_session_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES public.workflow_execution_sessions(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  template_slug         text NOT NULL,
  step_id               text,
  title                 text NOT NULL,
  markdown              text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'draft',
  workflow_version_id   uuid,
  used_context          jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_placeholders  jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wsd_session_idx  ON public.workflow_session_documents(session_id);
CREATE INDEX IF NOT EXISTS wsd_template_idx ON public.workflow_session_documents(template_id);

ALTER TABLE public.workflow_session_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_session_documents TO authenticated;
GRANT ALL ON public.workflow_session_documents TO service_role;

DROP POLICY IF EXISTS "Session owner reads documents" ON public.workflow_session_documents;
CREATE POLICY "Session owner reads documents"
  ON public.workflow_session_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_execution_sessions s
    WHERE s.id = workflow_session_documents.session_id
      AND s.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Session owner writes documents" ON public.workflow_session_documents;
CREATE POLICY "Session owner writes documents"
  ON public.workflow_session_documents FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_execution_sessions s
    WHERE s.id = workflow_session_documents.session_id
      AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workflow_execution_sessions s
    WHERE s.id = workflow_session_documents.session_id
      AND s.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.set_workflow_session_documents_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wsd_set_updated_at ON public.workflow_session_documents;
CREATE TRIGGER wsd_set_updated_at
  BEFORE UPDATE ON public.workflow_session_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_workflow_session_documents_updated_at();

NOTIFY pgrst, 'reload schema';


-- ===== scripts/_missing_tables_fk.sql =====
-- ===== Fremdschlüssel der rekonstruierten Tabellen =====
ALTER TABLE public.case_related_cases ADD CONSTRAINT case_related_cases_related_case_id_fkey FOREIGN KEY ("related_case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.case_related_cases ADD CONSTRAINT case_related_cases_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.case_roles ADD CONSTRAINT case_roles_role_id_fkey FOREIGN KEY ("role_id") REFERENCES public.roles("id");
ALTER TABLE public.case_roles ADD CONSTRAINT case_roles_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.case_templates ADD CONSTRAINT case_templates_template_id_fkey FOREIGN KEY ("template_id") REFERENCES public.document_templates("id");
ALTER TABLE public.case_templates ADD CONSTRAINT case_templates_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.decision_trees ADD CONSTRAINT decision_trees_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.education_programs ADD CONSTRAINT education_programs_school_id_fkey FOREIGN KEY ("school_id") REFERENCES public.schools("id");
ALTER TABLE public.faq_entries ADD CONSTRAINT faq_entries_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.favorites ADD CONSTRAINT favorites_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");
ALTER TABLE public.legal_changes ADD CONSTRAINT legal_changes_legal_section_id_fkey FOREIGN KEY ("legal_section_id") REFERENCES public.legal_sections("id");
ALTER TABLE public.practice_subcategories ADD CONSTRAINT practice_subcategories_category_id_fkey FOREIGN KEY ("category_id") REFERENCES public.practice_categories("id");
ALTER TABLE public.case_versions ADD CONSTRAINT case_versions_case_id_fkey FOREIGN KEY ("case_id") REFERENCES public.practice_cases("id");


-- ===== scripts/_missing_tables_policies.sql =====
-- ===== Zugriffsregeln der rekonstruierten Tabellen =====
DROP POLICY IF EXISTS "_role_delete_admin" ON public.case_related_cases;
CREATE POLICY "_role_delete_admin" ON public.case_related_cases FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "_role_select" ON public.case_related_cases;
CREATE POLICY "_role_select" ON public.case_related_cases FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "_role_insert_editor" ON public.case_related_cases;
CREATE POLICY "_role_insert_editor" ON public.case_related_cases FOR INSERT TO authenticated WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_update_editor" ON public.case_related_cases;
CREATE POLICY "_role_update_editor" ON public.case_related_cases FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_insert_editor" ON public.case_templates;
CREATE POLICY "_role_insert_editor" ON public.case_templates FOR INSERT TO authenticated WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_select" ON public.case_templates;
CREATE POLICY "_role_select" ON public.case_templates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "_role_update_editor" ON public.case_templates;
CREATE POLICY "_role_update_editor" ON public.case_templates FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_delete_admin" ON public.case_templates;
CREATE POLICY "_role_delete_admin" ON public.case_templates FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "_role_insert_editor" ON public.decision_trees;
CREATE POLICY "_role_insert_editor" ON public.decision_trees FOR INSERT TO authenticated WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_select" ON public.decision_trees;
CREATE POLICY "_role_select" ON public.decision_trees FOR SELECT TO authenticated USING (is_editor());
DROP POLICY IF EXISTS "_role_delete_admin" ON public.decision_trees;
CREATE POLICY "_role_delete_admin" ON public.decision_trees FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "_role_update_editor" ON public.decision_trees;
CREATE POLICY "_role_update_editor" ON public.decision_trees FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
DROP POLICY IF EXISTS "decision_trees_role_select" ON public.decision_trees;
CREATE POLICY "decision_trees_role_select" ON public.decision_trees FOR SELECT TO anon, authenticated USING (((status = 'published'::text) OR is_editor()));
DROP POLICY IF EXISTS "Public read education programs" ON public.education_programs;
CREATE POLICY "Public read education programs" ON public.education_programs FOR SELECT TO public USING ((status = 'active'::text));
DROP POLICY IF EXISTS "Public read published faq entries" ON public.faq_entries;
CREATE POLICY "Public read published faq entries" ON public.faq_entries FOR SELECT TO public USING ((status = 'published'::text));
DROP POLICY IF EXISTS "_role_select" ON public.faq_entries;
CREATE POLICY "_role_select" ON public.faq_entries FOR SELECT TO authenticated USING (is_editor());
DROP POLICY IF EXISTS "_role_delete_admin" ON public.faq_entries;
CREATE POLICY "_role_delete_admin" ON public.faq_entries FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "_role_insert_editor" ON public.faq_entries;
CREATE POLICY "_role_insert_editor" ON public.faq_entries FOR INSERT TO authenticated WITH CHECK (is_editor());
DROP POLICY IF EXISTS "faq_entries_role_select" ON public.faq_entries;
CREATE POLICY "faq_entries_role_select" ON public.faq_entries FOR SELECT TO anon, authenticated USING (((status = 'published'::text) OR is_editor()));
DROP POLICY IF EXISTS "_role_update_editor" ON public.faq_entries;
CREATE POLICY "_role_update_editor" ON public.faq_entries FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_delete_admin" ON public.legal_changes;
CREATE POLICY "_role_delete_admin" ON public.legal_changes FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "_role_insert_editor" ON public.legal_changes;
CREATE POLICY "_role_insert_editor" ON public.legal_changes FOR INSERT TO authenticated WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_select" ON public.legal_changes;
CREATE POLICY "_role_select" ON public.legal_changes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "_role_update_editor" ON public.legal_changes;
CREATE POLICY "_role_update_editor" ON public.legal_changes FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_insert_editor" ON public.practice_subcategories;
CREATE POLICY "_role_insert_editor" ON public.practice_subcategories FOR INSERT TO authenticated WITH CHECK (is_editor());
DROP POLICY IF EXISTS "_role_select" ON public.practice_subcategories;
CREATE POLICY "_role_select" ON public.practice_subcategories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "_role_delete_admin" ON public.practice_subcategories;
CREATE POLICY "_role_delete_admin" ON public.practice_subcategories FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "_role_update_editor" ON public.practice_subcategories;
CREATE POLICY "_role_update_editor" ON public.practice_subcategories FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
DROP POLICY IF EXISTS "Public read practice subcategories" ON public.practice_subcategories;
CREATE POLICY "Public read practice subcategories" ON public.practice_subcategories FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public read schools" ON public.schools;
CREATE POLICY "Public read schools" ON public.schools FOR SELECT TO public USING ((status = 'active'::text));

