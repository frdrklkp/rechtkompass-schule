-- Sprint 4.5A – Document Generation Core
-- Reuse: document_templates + workflow_step_documents. Neu: workflow_session_documents.
-- Idempotent.

-- 1. Vorlagen um Markdown-Body und Dokumenttyp ergänzen (optional, non-breaking).
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS markdown_body text;
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS document_type text;

-- 2. Erzeugte Dokumente pro Session.
CREATE TABLE IF NOT EXISTS public.workflow_session_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES public.workflow_execution_sessions(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  template_slug         text NOT NULL,
  step_id               text,
  title                 text NOT NULL,
  markdown              text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'draft',
  workflow_version_id   uuid,
  used_context          jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_placeholders  jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wsd_session_idx  ON public.workflow_session_documents(session_id);
CREATE INDEX IF NOT EXISTS wsd_template_idx ON public.workflow_session_documents(template_id);

ALTER TABLE public.workflow_session_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_session_documents TO authenticated;
GRANT ALL ON public.workflow_session_documents TO service_role;

DROP POLICY IF EXISTS "Session owner reads documents" ON public.workflow_session_documents;
CREATE POLICY "Session owner reads documents"
  ON public.workflow_session_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_execution_sessions s
    WHERE s.id = workflow_session_documents.session_id
      AND s.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Session owner writes documents" ON public.workflow_session_documents;
CREATE POLICY "Session owner writes documents"
  ON public.workflow_session_documents FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_execution_sessions s
    WHERE s.id = workflow_session_documents.session_id
      AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workflow_execution_sessions s
    WHERE s.id = workflow_session_documents.session_id
      AND s.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.set_workflow_session_documents_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wsd_set_updated_at ON public.workflow_session_documents;
CREATE TRIGGER wsd_set_updated_at
  BEFORE UPDATE ON public.workflow_session_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_workflow_session_documents_updated_at();

NOTIFY pgrst, 'reload schema';
