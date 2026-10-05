-- 2026-10-05: Mandantenkonzept, Stufe 2 - Trennung je Schule (school_id).
--
-- Voraussetzung: Stufe 1 (db/2026-10-05_mandanten_stufe1.sql) ist angewendet.
--
-- Was diese Stufe tut:
--   1. Jede personenbezogene Tabelle bekommt eine Spalte school_id. Ein
--      BEFORE-INSERT-Trigger füllt sie aus der aktiven Mitgliedschaft der
--      Person, die die Zeile besitzt (user_id / created_by / owner_id) - auch
--      bei Schreibvorgängen der Service-Rolle (Copilot-Route), bei denen
--      auth.uid() leer ist. Zeilen von Nicht-Mitgliedern (Betreiber-Admins,
--      Testkonten) behalten school_id NULL.
--   2. Bestandsdaten werden rückwirkend der Schule der Person zugeordnet.
--   3. RESTRICTIVE-Policies ergänzen die bestehenden Eigentümer-Regeln um die
--      Schulprüfung: Eine Person sieht und schreibt nur Zeilen ihrer eigenen
--      Schule (bzw. ohne Schule, wenn sie selbst keiner angehört). Redaktion
--      und Betreiber-Admin bleiben unberührt, wo sie heute Zugriff haben.
--
-- Warum RESTRICTIVE: Sie werden mit allen vorhandenen (permissiven) Policies
-- per UND verknüpft. Die bestehenden Regeln bleiben wie sie sind; keine
-- Zeile wird sichtbarer als heute, nur enger.
--
-- Tabellen: copilot_conversations (user_id), workflow_execution_sessions
-- (user_id), case_documents (created_by), case_files (owner_id),
-- pilot_survey_responses (user_id), case_feedback_reports (user_id),
-- favorites (user_id; Tabelle ohne Policies, ungenutzt - nur Spalte/Trigger).
-- Kindtabellen (copilot_conversation_turns, workflow_execution_steps,
-- workflow_session_documents) hängen per Fremdschlüssel an ihrer Elternzeile
-- und erben die Trennung über deren Policies.
--
-- Idempotent; im Supabase SQL Editor oder per Bun-SQL-Skript ausführen.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Trigger-Funktion: school_id aus der Mitgliedschaft des Zeileneigentümers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_school_id_from_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_col text := TG_ARGV[0];
  _owner     uuid;
BEGIN
  IF NEW.school_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  _owner := (to_jsonb(NEW) ->> _owner_col)::uuid;
  IF _owner IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT m.school_id INTO NEW.school_id
    FROM public.school_members m
   WHERE m.user_id = _owner AND m.status = 'aktiv'
   LIMIT 1;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Spalte, Index, Trigger, Rückwirkende Zuordnung - je Tabelle
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('copilot_conversations',      'user_id'),
      ('workflow_execution_sessions','user_id'),
      ('case_documents',             'created_by'),
      ('case_files',                 'owner_id'),
      ('pilot_survey_responses',     'user_id'),
      ('case_feedback_reports',      'user_id'),
      ('favorites',                  'user_id')
    ) AS v(tbl, owner_col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id uuid NULL REFERENCES public.schools (id) ON DELETE RESTRICT', t.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (school_id)', t.tbl || '_school_idx', t.tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.tbl || '_set_school', t.tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_school_id_from_owner(%L)',
                   t.tbl || '_set_school', t.tbl, t.owner_col);
    -- Bestand: Zeilen aktiver Mitglieder ihrer Schule zuordnen.
    EXECUTE format('UPDATE public.%I x SET school_id = m.school_id FROM public.school_members m WHERE x.school_id IS NULL AND m.status = ''aktiv'' AND m.user_id = x.%I',
                   t.tbl, t.owner_col);
  END LOOP;
END $$;

COMMENT ON COLUMN public.copilot_conversations.school_id IS
  'Mandant der Person zum Zeitpunkt der Anlage (Trigger). Grundlage für Löschung, Export und Auswertung je Schule.';

-- ---------------------------------------------------------------------------
-- 2. RESTRICTIVE-Policies: Schulprüfung zusätzlich zur Eigentümerregel
-- ---------------------------------------------------------------------------
-- Ausdruck: Zeile gehört zur Schule der angemeldeten Person (beide NULL zählt
-- als gleich: Betreiber-Admins ohne Schule sehen ihre eigenen, schullosen Zeilen).
-- Redaktion/Betreiber-Admin werden durchgelassen, wo ihnen die permissiven
-- Regeln heute Zugriff geben (case_documents, case_feedback_reports: Editor;
-- workflow_execution_sessions: Admin). Für Copilot-Gespräche gibt es keine
-- Redaktionsausnahme: Inhalte sind nur per Service-Rolle (Skript) erreichbar.

-- copilot_conversations: nur eigene Schule.
DROP POLICY IF EXISTS copilot_conversations_same_school ON public.copilot_conversations;
CREATE POLICY copilot_conversations_same_school ON public.copilot_conversations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NOT DISTINCT FROM public.current_school_id())
  WITH CHECK (school_id IS NOT DISTINCT FROM public.current_school_id());

-- workflow_execution_sessions: eigene Schule oder Betreiber-Admin (wie heute).
DROP POLICY IF EXISTS workflow_execution_sessions_same_school ON public.workflow_execution_sessions;
CREATE POLICY workflow_execution_sessions_same_school ON public.workflow_execution_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NOT DISTINCT FROM public.current_school_id() OR public.is_admin())
  WITH CHECK (school_id IS NOT DISTINCT FROM public.current_school_id() OR public.is_admin());

-- case_documents: eigene Schule oder Redaktion (wie heute).
DROP POLICY IF EXISTS case_documents_same_school ON public.case_documents;
CREATE POLICY case_documents_same_school ON public.case_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NOT DISTINCT FROM public.current_school_id() OR public.is_editor() OR public.is_admin())
  WITH CHECK (school_id IS NOT DISTINCT FROM public.current_school_id() OR public.is_editor() OR public.is_admin());

-- case_files: nur eigene Schule (heute reine Eigentümerregel).
DROP POLICY IF EXISTS case_files_same_school ON public.case_files;
CREATE POLICY case_files_same_school ON public.case_files
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NOT DISTINCT FROM public.current_school_id())
  WITH CHECK (school_id IS NOT DISTINCT FROM public.current_school_id());

-- pilot_survey_responses: nur eigene Schule.
DROP POLICY IF EXISTS pilot_survey_responses_same_school ON public.pilot_survey_responses;
CREATE POLICY pilot_survey_responses_same_school ON public.pilot_survey_responses
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NOT DISTINCT FROM public.current_school_id())
  WITH CHECK (school_id IS NOT DISTINCT FROM public.current_school_id());

-- case_feedback_reports: Redaktion liest alle (wie heute); Lehrkräfte haben
-- heute keine Leseregel, daher nur die Schulprüfung für künftige Regeln.
DROP POLICY IF EXISTS case_feedback_reports_same_school ON public.case_feedback_reports;
CREATE POLICY case_feedback_reports_same_school ON public.case_feedback_reports
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NOT DISTINCT FROM public.current_school_id() OR public.is_editor() OR public.is_admin())
  WITH CHECK (school_id IS NOT DISTINCT FROM public.current_school_id() OR public.is_editor() OR public.is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ---------------------------------------------------------------------------
-- Prüfung (separat, ändert nichts):
--   select 'copilot' as t, count(*) filter (where school_id is not null) as mit_schule, count(*) as gesamt from public.copilot_conversations
--   union all select 'vorgaenge', count(*) filter (where school_id is not null), count(*) from public.workflow_execution_sessions
--   union all select 'dokumente', count(*) filter (where school_id is not null), count(*) from public.case_documents
--   union all select 'dateien', count(*) filter (where school_id is not null), count(*) from public.case_files
--   union all select 'umfrage', count(*) filter (where school_id is not null), count(*) from public.pilot_survey_responses;
-- ---------------------------------------------------------------------------
