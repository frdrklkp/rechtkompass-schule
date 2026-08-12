-- Sprint 4.3 – Data-Driven Workflow Platform
-- Rein datengetriebene Workflow-Engine: 14 Tabellen, RLS, Grants,
-- Seed für einen Pilot-Workflow ("Verdacht auf Lese-Rechtschreib-Schwäche").
--
-- Redaktionelle Templates werden über die bestehenden Editorial-Rollen
-- (is_editor/is_admin) verwaltet. Ausführungssessions gehören dem
-- eingeloggten Nutzer und sind über auth.uid() abgeschottet.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.workflow_template_status AS ENUM
    ('draft','in_review','approved','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_publication_tier AS ENUM ('internal','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_session_status AS ENUM
    ('draft','ready','running','paused','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step_status AS ENUM
    ('open','active','waiting','completed','skipped','blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step_type AS ENUM
    ('information','decision','action','document','review','communication','wait');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_priority AS ENUM ('low','normal','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_risk_level AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_role AS ENUM
    ('teacher','class_lead','principal','deputy','office','social_worker','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1) workflow_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  description text,
  icon        text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workflow_categories TO anon, authenticated;
GRANT ALL    ON public.workflow_categories TO service_role;
ALTER TABLE public.workflow_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_cat_read ON public.workflow_categories;
CREATE POLICY wf_cat_read ON public.workflow_categories
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_cat_write ON public.workflow_categories;
CREATE POLICY wf_cat_write ON public.workflow_categories
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 2) workflow_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         uuid REFERENCES public.workflow_categories(id) ON DELETE SET NULL,
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,
  subtitle            text,
  description         text,
  workflow_status     public.workflow_template_status NOT NULL DEFAULT 'draft',
  publication_tier    public.workflow_publication_tier NOT NULL DEFAULT 'internal',
  current_version_id  uuid,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT SELECT ON public.workflow_templates TO anon;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_tpl_read_pub ON public.workflow_templates;
CREATE POLICY wf_tpl_read_pub ON public.workflow_templates
  FOR SELECT TO anon, authenticated
  USING (workflow_status = 'published' AND publication_tier = 'public');
DROP POLICY IF EXISTS wf_tpl_read_editor ON public.workflow_templates;
CREATE POLICY wf_tpl_read_editor ON public.workflow_templates
  FOR SELECT TO authenticated USING (public.is_editor() OR workflow_status = 'published');
DROP POLICY IF EXISTS wf_tpl_write ON public.workflow_templates;
CREATE POLICY wf_tpl_write ON public.workflow_templates
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 3) workflow_template_versions (immutable snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_template_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  snapshot     jsonb NOT NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
GRANT SELECT, INSERT ON public.workflow_template_versions TO authenticated;
GRANT SELECT ON public.workflow_template_versions TO anon;
GRANT ALL ON public.workflow_template_versions TO service_role;
ALTER TABLE public.workflow_template_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_ver_read ON public.workflow_template_versions;
CREATE POLICY wf_ver_read ON public.workflow_template_versions
  FOR SELECT TO authenticated USING (
    public.is_editor() OR EXISTS (
      SELECT 1 FROM public.workflow_templates t
      WHERE t.id = template_id AND t.workflow_status = 'published'
    )
  );
DROP POLICY IF EXISTS wf_ver_read_anon ON public.workflow_template_versions;
CREATE POLICY wf_ver_read_anon ON public.workflow_template_versions
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.workflow_templates t
      WHERE t.id = template_id
        AND t.workflow_status = 'published'
        AND t.publication_tier = 'public'
    )
  );
DROP POLICY IF EXISTS wf_ver_write ON public.workflow_template_versions;
CREATE POLICY wf_ver_write ON public.workflow_template_versions
  FOR INSERT TO authenticated WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 4) workflow_phases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_phases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  sort_order            int  NOT NULL DEFAULT 0,
  title                 text NOT NULL,
  description           text,
  is_required           boolean NOT NULL DEFAULT true,
  completion_condition  text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_phases TO authenticated;
GRANT SELECT ON public.workflow_phases TO anon;
GRANT ALL ON public.workflow_phases TO service_role;
ALTER TABLE public.workflow_phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_phase_read ON public.workflow_phases;
CREATE POLICY wf_phase_read ON public.workflow_phases
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = template_id
      AND (t.workflow_status = 'published' OR public.is_editor()))
  );
DROP POLICY IF EXISTS wf_phase_write ON public.workflow_phases;
CREATE POLICY wf_phase_write ON public.workflow_phases
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 5) workflow_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  phase_id          uuid NOT NULL REFERENCES public.workflow_phases(id) ON DELETE CASCADE,
  sort_order        int  NOT NULL DEFAULT 0,
  title             text NOT NULL,
  description       text,
  goal              text,
  step_type         public.workflow_step_type NOT NULL DEFAULT 'action',
  priority          public.workflow_priority NOT NULL DEFAULT 'normal',
  is_required       boolean NOT NULL DEFAULT true,
  estimated_minutes int,
  primary_role      public.workflow_role,
  risk_level        public.workflow_risk_level NOT NULL DEFAULT 'low'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO authenticated;
GRANT SELECT ON public.workflow_steps TO anon;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_step_read ON public.workflow_steps;
CREATE POLICY wf_step_read ON public.workflow_steps
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = template_id
      AND (t.workflow_status = 'published' OR public.is_editor()))
  );
DROP POLICY IF EXISTS wf_step_write ON public.workflow_steps;
CREATE POLICY wf_step_write ON public.workflow_steps
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 6) workflow_step_dependencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_dependencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id              uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  depends_on_step_id   uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  UNIQUE (step_id, depends_on_step_id),
  CHECK (step_id <> depends_on_step_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_dependencies TO authenticated;
GRANT SELECT ON public.workflow_step_dependencies TO anon;
GRANT ALL ON public.workflow_step_dependencies TO service_role;
ALTER TABLE public.workflow_step_dependencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_dep_read ON public.workflow_step_dependencies;
CREATE POLICY wf_dep_read ON public.workflow_step_dependencies
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_dep_write ON public.workflow_step_dependencies;
CREATE POLICY wf_dep_write ON public.workflow_step_dependencies
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 7) workflow_step_checklists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_checklists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id      uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  sort_order   int  NOT NULL DEFAULT 0,
  title        text NOT NULL,
  is_required  boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_checklists TO authenticated;
GRANT SELECT ON public.workflow_step_checklists TO anon;
GRANT ALL ON public.workflow_step_checklists TO service_role;
ALTER TABLE public.workflow_step_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_check_read ON public.workflow_step_checklists;
CREATE POLICY wf_check_read ON public.workflow_step_checklists
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_check_write ON public.workflow_step_checklists;
CREATE POLICY wf_check_write ON public.workflow_step_checklists
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 8) workflow_step_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id        uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  template_slug  text NOT NULL,
  title          text NOT NULL,
  note           text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_documents TO authenticated;
GRANT SELECT ON public.workflow_step_documents TO anon;
GRANT ALL ON public.workflow_step_documents TO service_role;
ALTER TABLE public.workflow_step_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_doc_read ON public.workflow_step_documents;
CREATE POLICY wf_doc_read ON public.workflow_step_documents
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_doc_write ON public.workflow_step_documents;
CREATE POLICY wf_doc_write ON public.workflow_step_documents
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 9) workflow_step_roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id       uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  role          public.workflow_role NOT NULL,
  can_edit      boolean NOT NULL DEFAULT true,
  can_complete  boolean NOT NULL DEFAULT true,
  UNIQUE (step_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_roles TO authenticated;
GRANT SELECT ON public.workflow_step_roles TO anon;
GRANT ALL ON public.workflow_step_roles TO service_role;
ALTER TABLE public.workflow_step_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_role_read ON public.workflow_step_roles;
CREATE POLICY wf_role_read ON public.workflow_step_roles
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_role_write ON public.workflow_step_roles;
CREATE POLICY wf_role_write ON public.workflow_step_roles
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 10) workflow_step_sources (referenzieren Rechtsquellen)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id           uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  legal_section_id  uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  citation_hint     text,
  note              text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_sources TO authenticated;
GRANT SELECT ON public.workflow_step_sources TO anon;
GRANT ALL ON public.workflow_step_sources TO service_role;
ALTER TABLE public.workflow_step_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_src_read ON public.workflow_step_sources;
CREATE POLICY wf_src_read ON public.workflow_step_sources
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_src_write ON public.workflow_step_sources;
CREATE POLICY wf_src_write ON public.workflow_step_sources
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 11) workflow_rules (redaktionell gepflegte if/then)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  when_type    text NOT NULL,   -- z.B. 'step_completed', 'checklist_missing', 'document_missing'
  when_ref     text,             -- Referenz (Step-Slug, Checklisten-Slug ...)
  then_action  text NOT NULL,   -- z.B. 'unlock_step','block_workflow','set_priority'
  then_ref     text,
  priority     int  NOT NULL DEFAULT 100
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_rules TO authenticated;
GRANT SELECT ON public.workflow_rules TO anon;
GRANT ALL ON public.workflow_rules TO service_role;
ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_rule_read ON public.workflow_rules;
CREATE POLICY wf_rule_read ON public.workflow_rules
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS wf_rule_write ON public.workflow_rules;
CREATE POLICY wf_rule_write ON public.workflow_rules
  FOR ALL TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- ---------------------------------------------------------------------------
-- 12) workflow_execution_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_execution_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE RESTRICT,
  template_version_id   uuid REFERENCES public.workflow_template_versions(id) ON DELETE SET NULL,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_status        public.workflow_session_status NOT NULL DEFAULT 'ready',
  context               jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at            timestamptz,
  paused_at             timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_execution_sessions TO authenticated;
GRANT ALL ON public.workflow_execution_sessions TO service_role;
ALTER TABLE public.workflow_execution_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_sess_owner ON public.workflow_execution_sessions;
CREATE POLICY wf_sess_owner ON public.workflow_execution_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 13) workflow_execution_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_execution_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.workflow_execution_sessions(id) ON DELETE CASCADE,
  step_id          uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE RESTRICT,
  step_status      public.workflow_step_status NOT NULL DEFAULT 'open',
  checklist_state  jsonb NOT NULL DEFAULT '[]'::jsonb,
  note             text,
  started_at       timestamptz,
  completed_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, step_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_execution_steps TO authenticated;
GRANT ALL ON public.workflow_execution_steps TO service_role;
ALTER TABLE public.workflow_execution_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_exec_step_owner ON public.workflow_execution_steps;
CREATE POLICY wf_exec_step_owner ON public.workflow_execution_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
                 WHERE s.id = session_id
                   AND (s.user_id = auth.uid() OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
                      WHERE s.id = session_id
                        AND (s.user_id = auth.uid() OR public.is_admin())));

-- ---------------------------------------------------------------------------
-- 14) workflow_events (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.workflow_execution_sessions(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  actor        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  at           timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_event_read ON public.workflow_events;
CREATE POLICY wf_event_read ON public.workflow_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
      WHERE s.id = session_id AND (s.user_id = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS wf_event_write ON public.workflow_events;
CREATE POLICY wf_event_write ON public.workflow_events
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workflow_execution_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid())
  );

-- append-only: kein UPDATE/DELETE
CREATE OR REPLACE FUNCTION public._workflow_events_readonly()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$ BEGIN
  RAISE EXCEPTION 'workflow_events are append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS wf_events_no_update ON public.workflow_events;
CREATE TRIGGER wf_events_no_update BEFORE UPDATE ON public.workflow_events
  FOR EACH ROW EXECUTE FUNCTION public._workflow_events_readonly();
DROP TRIGGER IF EXISTS wf_events_no_delete ON public.workflow_events;
CREATE TRIGGER wf_events_no_delete BEFORE DELETE ON public.workflow_events
  FOR EACH ROW EXECUTE FUNCTION public._workflow_events_readonly();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wf_templates_category  ON public.workflow_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_wf_templates_status    ON public.workflow_templates(workflow_status);
CREATE INDEX IF NOT EXISTS idx_wf_versions_template   ON public.workflow_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_wf_phases_template     ON public.workflow_phases(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wf_steps_template      ON public.workflow_steps(template_id, phase_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wf_deps_step           ON public.workflow_step_dependencies(step_id);
CREATE INDEX IF NOT EXISTS idx_wf_deps_depends        ON public.workflow_step_dependencies(depends_on_step_id);
CREATE INDEX IF NOT EXISTS idx_wf_sess_user           ON public.workflow_execution_sessions(user_id, session_status);
CREATE INDEX IF NOT EXISTS idx_wf_exec_step_session   ON public.workflow_execution_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_wf_events_session      ON public.workflow_events(session_id, at DESC);



COMMIT;

NOTIFY pgrst, 'reload schema';
