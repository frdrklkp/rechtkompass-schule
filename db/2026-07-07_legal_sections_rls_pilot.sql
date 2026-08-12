-- Pilotbetrieb: RLS für legal_sections analog zu practice_cases.
-- Idempotent: kann mehrfach ausgeführt werden.
-- Betrifft ausschließlich public.legal_sections.

ALTER TABLE public.legal_sections ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.legal_sections TO authenticated;

DROP POLICY IF EXISTS "Pilot: SELECT legal_sections" ON public.legal_sections;
DROP POLICY IF EXISTS "Pilot: INSERT legal_sections" ON public.legal_sections;
DROP POLICY IF EXISTS "Pilot: UPDATE legal_sections" ON public.legal_sections;
DROP POLICY IF EXISTS "Pilot: DELETE legal_sections" ON public.legal_sections;

CREATE POLICY "Pilot: SELECT legal_sections"
  ON public.legal_sections
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pilot: INSERT legal_sections"
  ON public.legal_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Pilot: UPDATE legal_sections"
  ON public.legal_sections
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Pilot: DELETE legal_sections"
  ON public.legal_sections
  FOR DELETE
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
