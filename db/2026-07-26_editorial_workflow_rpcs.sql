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
