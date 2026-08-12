-- ============================================================
-- Import-Job-System für Rechtsquellen (Pilot-Policies)
-- ------------------------------------------------------------
-- Legt import_jobs + import_job_items an und ergänzt
-- legal_sections.import_job_id.
--
-- Pilot: offene Policies (USING true / WITH CHECK true), RLS
-- aktiv. Später durch echte Rollenrechte ersetzen.
--
-- Idempotent. Im Supabase SQL-Editor ausführen, danach
-- `bun run schema:update && bun run schema:check`.
-- ============================================================

-- 1) Tabelle import_jobs -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid REFERENCES public.legal_sources(id) ON DELETE SET NULL,
  source_url        text,
  status            text NOT NULL DEFAULT 'running',   -- running | succeeded | failed | cancelled
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  duration_ms       integer,
  detected_count    integer NOT NULL DEFAULT 0,
  imported_count    integer NOT NULL DEFAULT 0,
  updated_count     integer NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  enriched_count    integer NOT NULL DEFAULT 0,
  error_count       integer NOT NULL DEFAULT 0,
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 2) Tabelle import_job_items -------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_job_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  section_number text,
  title          text,
  section_id     uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  action         text NOT NULL,   -- inserted | updated | skipped | failed | enriched
  error          text,
  source_hash    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3) legal_sections: import_job_id nachrüsten ---------------------------
ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS import_job_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'legal_sections'
      AND constraint_name = 'legal_sections_import_job_id_fkey'
  ) THEN
    ALTER TABLE public.legal_sections
      ADD CONSTRAINT legal_sections_import_job_id_fkey
      FOREIGN KEY (import_job_id) REFERENCES public.import_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_legal_sections_import_job_id
  ON public.legal_sections(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_job_items_job_id
  ON public.import_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_source_id
  ON public.import_jobs(source_id);

-- 4) Grants -------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_job_items TO anon, authenticated;
GRANT ALL ON public.import_jobs      TO service_role;
GRANT ALL ON public.import_job_items TO service_role;

-- 5) Row Level Security -------------------------------------------------
ALTER TABLE public.import_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_job_items ENABLE ROW LEVEL SECURITY;

-- Alte Admin-Policies entfernen, falls aus früherer Migration vorhanden
DROP POLICY IF EXISTS import_jobs_admin_all      ON public.import_jobs;
DROP POLICY IF EXISTS import_job_items_admin_all ON public.import_job_items;

-- Pilot-Policies: offen (später durch Rollenrechte ersetzen) ------------
DO $$
BEGIN
  -- import_jobs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_select_import_jobs') THEN
    CREATE POLICY pilot_select_import_jobs ON public.import_jobs
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_insert_import_jobs') THEN
    CREATE POLICY pilot_insert_import_jobs ON public.import_jobs
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_update_import_jobs') THEN
    CREATE POLICY pilot_update_import_jobs ON public.import_jobs
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_jobs' AND policyname='pilot_delete_import_jobs') THEN
    CREATE POLICY pilot_delete_import_jobs ON public.import_jobs
      FOR DELETE TO anon, authenticated USING (true);
  END IF;

  -- import_job_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_select_import_job_items') THEN
    CREATE POLICY pilot_select_import_job_items ON public.import_job_items
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_insert_import_job_items') THEN
    CREATE POLICY pilot_insert_import_job_items ON public.import_job_items
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_update_import_job_items') THEN
    CREATE POLICY pilot_update_import_job_items ON public.import_job_items
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_job_items' AND policyname='pilot_delete_import_job_items') THEN
    CREATE POLICY pilot_delete_import_job_items ON public.import_job_items
      FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE  public.import_jobs      IS 'Import-Job-Manager: ein Datensatz je Rechtsquellen-Import. Pilot-Policies offen.';
COMMENT ON TABLE  public.import_job_items IS 'Detailprotokoll pro Abschnitt eines Import-Jobs. Pilot-Policies offen.';
COMMENT ON COLUMN public.legal_sections.import_job_id
  IS 'Referenz auf import_jobs.id. Nur importierte Abschnitte tragen einen Wert; manuell gepflegte bleiben NULL.';

NOTIFY pgrst, 'reload schema';
