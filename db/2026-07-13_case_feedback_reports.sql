-- Nutzer-Feedback / Fehlermeldungen zu Praxisfällen.
-- Idempotent. Analog Pilot-Architektur (document_templates / case_documents).
-- KEINE Änderung an bestehenden Tabellen.

CREATE TABLE IF NOT EXISTS public.case_feedback_reports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 uuid REFERENCES public.practice_cases(id) ON DELETE SET NULL,
  case_title              text,
  user_id                 uuid,
  report_type             text NOT NULL,
  message                 text NOT NULL,
  urgency                 text NOT NULL DEFAULT 'medium',
  route                   text,
  reported_area           text,
  status                  text NOT NULL DEFAULT 'open',
  admin_notes             text,
  quality_task_reference  text,
  resolved_at             timestamptz,
  resolved_by             uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_feedback_reports_status_chk
    CHECK (status IN ('open','in_review','quality_check','resolved','rejected')),
  CONSTRAINT case_feedback_reports_urgency_chk
    CHECK (urgency IN ('low','medium','high')),
  CONSTRAINT case_feedback_reports_message_chk
    CHECK (char_length(btrim(message)) >= 5)
);

CREATE INDEX IF NOT EXISTS case_feedback_reports_case_idx    ON public.case_feedback_reports(case_id);
CREATE INDEX IF NOT EXISTS case_feedback_reports_status_idx  ON public.case_feedback_reports(status);
CREATE INDEX IF NOT EXISTS case_feedback_reports_created_idx ON public.case_feedback_reports(created_at DESC);

ALTER TABLE public.case_feedback_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.case_feedback_reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_feedback_reports TO authenticated;
GRANT ALL ON TABLE public.case_feedback_reports TO service_role;
-- Pilotphase: anon darf Meldungen anlegen und (im Adminbereich) verwalten.
GRANT INSERT, UPDATE, DELETE ON TABLE public.case_feedback_reports TO anon;

DROP POLICY IF EXISTS "Public read case_feedback_reports" ON public.case_feedback_reports;
CREATE POLICY "Public read case_feedback_reports"
  ON public.case_feedback_reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Pilot write case_feedback_reports" ON public.case_feedback_reports;
CREATE POLICY "Pilot write case_feedback_reports"
  ON public.case_feedback_reports
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_case_feedback_reports_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS case_feedback_reports_set_updated_at ON public.case_feedback_reports;
CREATE TRIGGER case_feedback_reports_set_updated_at
  BEFORE UPDATE ON public.case_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_case_feedback_reports_updated_at();

NOTIFY pgrst, 'reload schema';
