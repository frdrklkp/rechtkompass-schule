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
