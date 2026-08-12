-- Pilotbetrieb: Schreibrechte für Dokumentationsvorlagen (analog practice_cases).
-- Idempotent. Nur public.document_templates und public.case_templates.
-- KEINE neue Tabelle, KEINE neue Spalte.

-- ============================================================
-- document_templates
-- ============================================================
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.document_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_templates TO authenticated;
GRANT ALL ON TABLE public.document_templates TO service_role;
-- Pilotphase: auch anon darf schreiben (kein Admin-Login aktiv).
GRANT INSERT, UPDATE, DELETE ON TABLE public.document_templates TO anon;

DROP POLICY IF EXISTS "Pilot write document_templates" ON public.document_templates;
CREATE POLICY "Pilot write document_templates"
  ON public.document_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- case_templates (Verknüpfung Praxisfall ↔ Vorlage)
-- ============================================================
ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.case_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_templates TO authenticated;
GRANT ALL ON TABLE public.case_templates TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.case_templates TO anon;

DROP POLICY IF EXISTS "Public read case_templates" ON public.case_templates;
CREATE POLICY "Public read case_templates"
  ON public.case_templates
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Pilot write case_templates" ON public.case_templates;
CREATE POLICY "Pilot write case_templates"
  ON public.case_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
