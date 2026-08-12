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
