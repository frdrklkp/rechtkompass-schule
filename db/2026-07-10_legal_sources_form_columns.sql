-- ============================================================
-- Rechtsquellen-Formular: fehlende Spalten idempotent ergänzen
-- ------------------------------------------------------------
-- Das Formular "Neue Rechtsquelle" (Core Builder) schreibt
-- Kurzname (name), Rechtsgebiet, Geltungsbereich, Beschreibung.
-- Im Live-Schema fehlten description, legal_area, scope,
-- short_name sowie die Datumsfelder. Ausserdem ist source_type
-- NOT NULL, das Formular liefert es aber nicht.
--
-- Diese Migration ergaenzt die Spalten ohne bestehende Daten
-- zu beruehren und laedt den PostgREST Schema-Cache neu.
-- ============================================================

ALTER TABLE public.legal_sources
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS legal_area text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS last_reviewed_at date;

-- source_type ist bislang NOT NULL. Das Formular liefert keinen
-- Wert. Wir setzen einen sinnvollen Default und lockern NOT NULL,
-- damit Bestandslogik unveraendert weiterlaeuft.
ALTER TABLE public.legal_sources
  ALTER COLUMN source_type DROP NOT NULL,
  ALTER COLUMN source_type SET DEFAULT 'law';

NOTIFY pgrst, 'reload schema';
