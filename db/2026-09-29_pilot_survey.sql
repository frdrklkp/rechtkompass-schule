-- 2026-09-29: Kurz-Umfrage für Pilot-Kolleg:innen (Route /umfrage).
--
-- Eine Zeile pro Nutzer (unique user_id): erneutes Absenden aktualisiert
-- die eigene Antwort statt Duplikate zu erzeugen. Antworten als flache
-- Spalten (nicht jsonb), damit die Auswertung per SQL trivial bleibt.
--
-- RLS: Nur freigeschaltete Pilot-Nutzer (is_pilot_approved) schreiben,
-- jede:r sieht nur die eigene Antwort. Auswertung läuft über die
-- Service-Rolle (Redaktion), anon bleibt ausgesperrt.
--
-- Idempotent; im Supabase SQL Editor ausführen.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pilot_survey_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL UNIQUE DEFAULT auth.uid(),
  nutzung        text NOT NULL CHECK (nutzung IN ('mehrmals_woche', 'woechentlich', 'selten', 'noch_nicht')),
  hilfreich      integer NOT NULL CHECK (hilfreich BETWEEN 1 AND 5),
  top_funktion   text NOT NULL CHECK (top_funktion IN ('fallsuche', 'entscheidungsassistent', 'dokumente', 'pdf_export', 'rueckfragen_copilot', 'noch_keine')),
  empfehlung     text NOT NULL CHECK (empfehlung IN ('ja', 'eher_ja', 'eher_nein', 'nein')),
  fehlendes_thema text NULL,
  verbesserung    text NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pilot_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pilot_survey_insert_own ON public.pilot_survey_responses;
CREATE POLICY pilot_survey_insert_own
  ON public.pilot_survey_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_pilot_approved());

DROP POLICY IF EXISTS pilot_survey_update_own ON public.pilot_survey_responses;
CREATE POLICY pilot_survey_update_own
  ON public.pilot_survey_responses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.is_pilot_approved());

DROP POLICY IF EXISTS pilot_survey_select_own ON public.pilot_survey_responses;
CREATE POLICY pilot_survey_select_own
  ON public.pilot_survey_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMIT;
