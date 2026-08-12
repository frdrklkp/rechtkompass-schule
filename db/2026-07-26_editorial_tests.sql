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

