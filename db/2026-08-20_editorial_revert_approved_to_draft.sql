-- Erlaubt es Admins, einen bereits genehmigten Fall ("approved") wieder in
-- den Entwurfsstatus zurückzusetzen, ohne den Umweg über Veröffentlichen ->
-- Archivieren -> Reaktivieren zu gehen. Bisher war approved -> draft in
-- assert_case_transition() nicht enthalten (siehe 2026-07-26_editorial_helpers.sql);
-- der einzige Rückweg zu draft lief über eine Review-Entscheidung
-- (in_review -> draft), also VOR der Genehmigung.
--
-- Analog zu reactivate_case() (siehe 2026-07-26_editorial_workflow_rpcs.sql):
-- nur approved_at wird geleert, submitted_at/published_at/archived_at
-- bleiben als historische Zeitstempel unverändert.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Transition erlauben
-- ---------------------------------------------------------------------------
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
    OR (p_from = 'approved'   AND p_to IN ('published','draft'))
    OR (p_from = 'published'  AND p_to = 'archived')
    OR (p_from = 'archived'   AND p_to = 'draft')
  ) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', p_from, p_to
      USING ERRCODE = '22023';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) revert_case_to_draft  (approved -> draft, admin+)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_case_to_draft(
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
         approved_at     = NULL,
         status          = 'draft',
         updated_by      = v_actor,
         updated_at      = now()
   WHERE id = p_case_id;

  PERFORM public.append_case_event(
    p_case_id, 'case.reverted_to_draft', v_case.current_version_id, 'user',
    '{}'::jsonb,
    p_correlation_id
  );

  PERFORM public._set_workflow_bypass(false);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
