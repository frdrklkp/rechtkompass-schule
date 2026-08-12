-- ============================================================
-- Editorial fields for public.legal_sections
-- ------------------------------------------------------------
-- Idempotent. Ergänzt die im Rechtsquellen-Manager verwendeten
-- redaktionellen Felder und lädt den PostgREST-Schema-Cache neu.
--
-- Ausführen im Supabase SQL-Editor (Projekt mabbwunovhjaopnmzpfv).
-- Anschließend:  bun run schema:update && bun run schema:check
-- ============================================================

ALTER TABLE public.legal_sections
  ADD COLUMN IF NOT EXISTS summary             text,
  ADD COLUMN IF NOT EXISTS practice_relevance  text,
  ADD COLUMN IF NOT EXISTS recommendation      text,
  ADD COLUMN IF NOT EXISTS common_mistakes     text,
  ADD COLUMN IF NOT EXISTS related_section_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_reviewed_at    date;

COMMENT ON COLUMN public.legal_sections.summary             IS 'Kurzbeschreibung der Rechtsnorm (redaktionell).';
COMMENT ON COLUMN public.legal_sections.practice_relevance  IS 'Praxisbedeutung für Schulleitungen (redaktionell).';
COMMENT ON COLUMN public.legal_sections.recommendation      IS 'Handlungsempfehlung – keine Rechtsberatung.';
COMMENT ON COLUMN public.legal_sections.common_mistakes     IS 'Typische Fehler / Fallstricke (redaktionell).';
COMMENT ON COLUMN public.legal_sections.related_section_ids IS 'Verknüpfte legal_sections (Array von UUIDs).';
COMMENT ON COLUMN public.legal_sections.last_reviewed_at    IS 'Datum der letzten fachlichen Prüfung.';

-- PostgREST Schema-Cache neu laden.
NOTIFY pgrst, 'reload schema';
