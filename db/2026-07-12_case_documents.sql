-- Fallspezifische Dokumententwürfe.
-- Idempotent. Speichert KI-generierte Dokumente pro Praxisfall + Vorlage.
-- KEINE Änderung an bestehenden Tabellen.

CREATE TABLE IF NOT EXISTS public.case_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  template_id          uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  title                text NOT NULL,
  content              text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'draft',
  quality              text,
  open_issues          jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_sources         jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_metadata  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_documents_case_idx ON public.case_documents(case_id);
CREATE INDEX IF NOT EXISTS case_documents_template_idx ON public.case_documents(template_id);

ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.case_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_documents TO authenticated;
GRANT ALL ON TABLE public.case_documents TO service_role;
-- Pilotphase: auch anon darf schreiben (analog document_templates / case_templates).
GRANT INSERT, UPDATE, DELETE ON TABLE public.case_documents TO anon;

DROP POLICY IF EXISTS "Public read case_documents" ON public.case_documents;
CREATE POLICY "Public read case_documents"
  ON public.case_documents
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Pilot write case_documents" ON public.case_documents;
CREATE POLICY "Pilot write case_documents"
  ON public.case_documents
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_case_documents_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS case_documents_set_updated_at ON public.case_documents;
CREATE TRIGGER case_documents_set_updated_at
  BEFORE UPDATE ON public.case_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_case_documents_updated_at();

NOTIFY pgrst, 'reload schema';
