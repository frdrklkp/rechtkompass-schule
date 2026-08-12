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
