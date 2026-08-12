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
