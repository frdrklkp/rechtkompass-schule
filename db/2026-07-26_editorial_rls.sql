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
