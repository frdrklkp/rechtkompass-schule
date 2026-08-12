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
