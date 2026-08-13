-- Diagnose + Fix: "permission denied for function _workflow_bypass" beim
-- Aufruf von submit_case_for_review() (und vermutlich auch bei
-- decide_case_review/publish_case/archive_case/reactivate_case).
--
-- Ursache: die SECURITY-DEFINER-RPCs und die internen Helper-Funktionen
-- (die absichtlich per REVOKE FROM authenticated gesperrt sind, siehe
-- db/2026-07-26_editorial_grants.sql) wurden bei der manuellen
-- Rekonstruktion von bootstrap-schema.sql offenbar nicht mit demselben
-- Owner angelegt. SECURITY DEFINER erlaubt einer Funktion nur dann
-- automatisch den Aufruf gesperrter interner Helper, wenn beide denselben
-- Owner haben - sonst greift die REVOKE-Sperre auch innerhalb der Kette.
--
-- Betrifft NICHT nur dieses Skript: JEDE Einreichung eines Falls zur
-- Redaktionsprüfung über die echte Admin-UI würde an derselben Stelle
-- scheitern, da dieser Workflow bislang noch nie real durchlaufen wurde
-- (keine echten Fälle existierten vorher).

-- 1) Diagnose zuerst laufen lassen (zeigt die aktuellen Owner):
select p.proname, r.rolname as owner, p.prosecdef as security_definer
from pg_proc p join pg_roles r on r.oid = p.proowner
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'submit_case_for_review', 'decide_case_review', 'publish_case',
    'archive_case', 'reactivate_case',
    '_workflow_bypass', '_set_workflow_bypass', 'build_case_snapshot',
    'create_case_version', 'append_case_event', 'assert_case_transition',
    '_practice_cases_guard', '_practice_cases_insert_guard',
    '_case_versions_readonly', '_case_events_readonly'
  )
order by 1;

-- 2) Fix: Owner der gesamten Kette auf postgres vereinheitlichen (Standard-
--    Owner beim Ausführen im SQL Editor). Danach haben die SECURITY-
--    DEFINER-RPCs automatisch Ausführungsrechte auf alle intern
--    aufgerufenen Helper - unabhängig vom REVOKE FROM authenticated,
--    das für direkte Client-Aufrufe weiterhin in Kraft bleibt.
alter function public._workflow_bypass()                                     owner to postgres;
alter function public._set_workflow_bypass(boolean)                          owner to postgres;
alter function public.build_case_snapshot(uuid)                              owner to postgres;
alter function public.create_case_version(uuid)                              owner to postgres;
alter function public.append_case_event(uuid, text, uuid, text, jsonb, uuid) owner to postgres;
alter function public.assert_case_transition(public.case_workflow_status, public.case_workflow_status)
                                                                              owner to postgres;
alter function public._practice_cases_guard()                                owner to postgres;
alter function public._practice_cases_insert_guard()                         owner to postgres;
alter function public._case_versions_readonly()                              owner to postgres;
alter function public._case_events_readonly()                                owner to postgres;
alter function public.submit_case_for_review(uuid, uuid, text, uuid)         owner to postgres;
alter function public.decide_case_review(uuid, public.review_status, text, uuid) owner to postgres;
alter function public.publish_case(uuid, public.case_publication_tier, uuid) owner to postgres;
alter function public.archive_case(uuid, text, uuid)                         owner to postgres;
alter function public.reactivate_case(uuid, uuid)                            owner to postgres;

-- 3) Diagnose erneut laufen lassen (Schritt 1 wiederholen), um zu
--    bestätigen, dass alle Zeilen jetzt "postgres" als owner zeigen.
