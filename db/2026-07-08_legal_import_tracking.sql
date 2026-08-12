-- ============================================================
-- Import-Tracking für offizielle Rechtsquellen
-- ------------------------------------------------------------
-- Ergänzt legal_sections um Felder, die den Ursprung eines
-- importierten Abschnitts nachvollziehbar machen.
--
-- Idempotent. Bitte im Supabase SQL-Editor ausführen und
-- anschließend `bun run schema:update && bun run schema:check`.
-- ============================================================

ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS import_url  text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_hash text;

COMMENT ON COLUMN public.legal_sections.import_url  IS 'URL, aus der dieser Abschnitt zuletzt importiert wurde.';
COMMENT ON COLUMN public.legal_sections.imported_at IS 'Zeitpunkt des letzten Imports aus der offiziellen Quelle.';
COMMENT ON COLUMN public.legal_sections.source_hash IS 'Kurzer Hash über den offiziellen Volltext (zur Änderungserkennung beim Re-Import).';

NOTIFY pgrst, 'reload schema';
