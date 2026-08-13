-- Fix: case_feedback_reports war seit der rollenbasierten RLS-Härtung vom
-- 24.07.2026 (2026-07-24_sprint_1_2_role_based_rls.sql) fälschlich als reine
-- Backoffice-Tabelle eingestuft (nur authenticated + is_editor() dürfen
-- schreiben/lesen). Tatsächlich ist die Tabelle das Ziel des öffentlichen
-- Feedback-Formulars (FeedbackReportDialog), das auf den unauthentifizierten
-- Fallseiten (faelle.$id.tsx) eingebettet ist - für Lehrkräfte, die sich
-- nicht einloggen (es gibt aktuell keinen Login für Lehrkräfte, nur für den
-- Adminbereich). Ergebnis: jede Rückmeldung schlug seither mit einem von der
-- Datenbank verweigerten Schreibzugriff fehl (Code-Audit, 12.08.2026).
--
-- Fix: anon darf INSERT (nur schreibend, kein SELECT - Berichte bleiben nur
-- für Redakteure einsehbar, wie zuvor). UPDATE/DELETE bleiben unverändert
-- Redakteuren vorbehalten.
--
-- Idempotent, darf mehrfach ausgeführt werden.

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.case_feedback_reports') IS NOT NULL THEN
    GRANT INSERT ON TABLE public.case_feedback_reports TO anon;

    DROP POLICY IF EXISTS case_feedback_reports_role_insert_anon ON public.case_feedback_reports;
    CREATE POLICY case_feedback_reports_role_insert_anon
      ON public.case_feedback_reports
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- Verifikation nach Ausführung (im SQL Editor):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'case_feedback_reports' order by grantee;
--   -- erwartet: anon hat jetzt INSERT (aber nicht SELECT/UPDATE/DELETE).
