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
