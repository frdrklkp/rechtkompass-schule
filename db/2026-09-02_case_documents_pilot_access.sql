-- 2026-09-02: Fallseiten-Dokumente für Pilot-Lehrkräfte freischalten.
--
-- Befund: Die Rollen-RLS-Härtung vom 24.07. (sprint_1_2_role_based_rls)
-- hat case_documents komplett auf Redaktionsrollen beschränkt - seither
-- können Pilot-Lehrkräfte auf Fallseiten weder Dokumente erzeugen noch
-- lesen, und der E-Mail-Versand lief ins Leere ("permission denied").
--
-- Neues Modell: Eigentümer-basiert statt alles-oder-nichts.
--  - created_by (neu, Default auth.uid()) hält den Ersteller fest.
--  - Freigeschaltete Pilot-Nutzer (is_pilot_approved) dürfen Dokumente
--    anlegen; jeder sieht/ändert nur die EIGENEN Dokumente, die Redaktion
--    weiterhin alle. Löschen: Eigentümer oder Admin.
--  - Altbestand ohne created_by bleibt redaktions-exklusiv (kein stilles
--    Öffnen fremder, potenziell personenbezogener Vorfalldokumente).
--  - anon bleibt vollständig ausgesperrt (Datenschutz-Härtung unverändert).
--
-- Idempotent; im Supabase SQL Editor ausführen.

BEGIN;

ALTER TABLE public.case_documents
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

-- Policies der Rollen-Härtung ersetzen
DROP POLICY IF EXISTS case_documents_role_select        ON public.case_documents;
DROP POLICY IF EXISTS case_documents_role_insert_editor ON public.case_documents;
DROP POLICY IF EXISTS case_documents_role_update_editor ON public.case_documents;
DROP POLICY IF EXISTS case_documents_role_delete_admin  ON public.case_documents;
DROP POLICY IF EXISTS case_documents_select_own_or_editor ON public.case_documents;
DROP POLICY IF EXISTS case_documents_insert_pilot         ON public.case_documents;
DROP POLICY IF EXISTS case_documents_update_own_or_editor ON public.case_documents;
DROP POLICY IF EXISTS case_documents_delete_own_or_admin  ON public.case_documents;

CREATE POLICY case_documents_select_own_or_editor ON public.case_documents
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_editor());

CREATE POLICY case_documents_insert_pilot ON public.case_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_pilot_approved() OR public.is_editor())
    AND (created_by = auth.uid() OR created_by IS NULL)
  );

CREATE POLICY case_documents_update_own_or_editor ON public.case_documents
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_editor())
  WITH CHECK (created_by = auth.uid() OR public.is_editor());

CREATE POLICY case_documents_delete_own_or_admin ON public.case_documents
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

COMMIT;
