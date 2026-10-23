-- 2026-10-23: Löschfristen scharfschalten (DSGVO-Audit vom 01.10.2026, Nachtrag).
--
-- Abgleich Datenschutzerklärung <-> Datenbank am 23.10.2026 ergab drei Lücken:
--
-- 1. Fallgenerierung: Die Schilderung einer Lehrkraft ("Passenden Praxisfall
--    erstellen lassen") liegt mit Kontobezug unbefristet in
--    case_generation_jobs.sketch. Neu: 30 Tage nach Abschluss des Auftrags
--    werden Schilderung und Kontobezug entfernt (Nutzerentscheidung 23.10.2026).
--    Der Auftrag selbst bleibt als Zeile ohne Personenbezug stehen (Status,
--    Phase, erzeugter Fall), damit die Redaktion den Verlauf nachvollziehen kann.
--
-- 2. Copilot-Gespräche: purge_copilot_conversations(90) gab es seit 04.10.,
--    sie lief aber nie automatisch. Die Datenschutzerklärung verspricht die
--    Löschung nach 90 Tagen; ältestes Gespräch 29.09.2026 -> Frist 28.12.2026.
--
-- 3. Fehlermeldungen: Die Erklärung sagt "bis zur Erledigung durch die
--    Redaktion, danach ohne Kontobezug". Neu: Beim Wechsel auf "resolved" oder
--    "rejected" entfernt ein Trigger die user_id; bereits erledigte Meldungen
--    werden einmalig nachgezogen.
--
-- Zeitplan (pg_cron, täglich nachts, UTC):
--   03:17 copilot-retention              purge_copilot_conversations(90)
--   03:27 generation-sketch-retention    purge_case_generation_sketches(30)
--
-- Prüfen, was ein Lauf jeweils träfe (ändert nichts):
--   select count(*) from public.copilot_conversations where updated_at < now() - interval '90 days';
--   select count(*) from public.case_generation_jobs
--    where sketch is not null and status in ('succeeded','failed') and updated_at < now() - interval '30 days';
--
-- Idempotent; im Supabase SQL Editor ausführbar.

BEGIN;

-- 1. Fallgenerierung -------------------------------------------------------

ALTER TABLE public.case_generation_jobs ALTER COLUMN sketch DROP NOT NULL;
ALTER TABLE public.case_generation_jobs ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE public.case_generation_jobs ADD COLUMN IF NOT EXISTS sketch_purged_at timestamptz;

CREATE OR REPLACE FUNCTION public.purge_case_generation_sketches(retention_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purged_count integer;
BEGIN
  IF retention_days IS NULL OR retention_days < 7 THEN
    RAISE EXCEPTION 'retention_days muss mindestens 7 sein (war: %)', retention_days;
  END IF;

  WITH gone AS (
    UPDATE public.case_generation_jobs
       SET sketch = NULL,
           requested_by = NULL,
           sketch_purged_at = now(),
           -- ohne Schilderung kann ein liegengebliebener Auftrag nie mehr laufen
           status = CASE WHEN status IN ('pending', 'running') THEN 'failed' ELSE status END,
           error = CASE WHEN status IN ('pending', 'running')
                        THEN 'Nach Ablauf der Löschfrist ohne Bearbeitung geschlossen.' ELSE error END
     WHERE sketch IS NOT NULL
       AND (
         -- abgeschlossene Aufträge: Frist ab Abschluss
         (status IN ('succeeded', 'failed') AND updated_at < now() - make_interval(days => retention_days))
         -- hängengebliebene Aufträge: spätestens Frist + 30 Tage nach Anlage
         OR created_at < now() - make_interval(days => retention_days + 30)
       )
    RETURNING 1
  )
  SELECT count(*) INTO purged_count FROM gone;

  RETURN purged_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_case_generation_sketches(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_case_generation_sketches(integer) TO service_role;

-- 3. Fehlermeldungen ohne Kontobezug nach Erledigung ------------------------

CREATE OR REPLACE FUNCTION public.feedback_reports_drop_user_on_close()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('resolved', 'rejected') THEN
    NEW.user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_reports_drop_user_on_close ON public.case_feedback_reports;
CREATE TRIGGER feedback_reports_drop_user_on_close
  BEFORE INSERT OR UPDATE OF status ON public.case_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.feedback_reports_drop_user_on_close();

UPDATE public.case_feedback_reports
   SET user_id = NULL
 WHERE status IN ('resolved', 'rejected') AND user_id IS NOT NULL;

-- 2. Zeitplan ---------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobname IN ('copilot-retention', 'generation-sketch-retention');

SELECT cron.schedule('copilot-retention', '17 3 * * *',
  $$select public.purge_copilot_conversations(90)$$);
SELECT cron.schedule('generation-sketch-retention', '27 3 * * *',
  $$select public.purge_case_generation_sketches(30)$$);

COMMIT;
