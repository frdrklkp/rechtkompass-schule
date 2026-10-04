-- 2026-10-04: Löschfrist für Copilot-Gespräche (Phase 1, Paket D - Datenschutz).
--
-- Rückfragen an den Copilot sind Freitext von Lehrkräften und können
-- unbeabsichtigt personenbezogene Angaben enthalten. Datenminimierung
-- (Art. 5 Abs. 1 lit. e DSGVO) verlangt eine feste Speicherdauer.
--
-- ENTWURF: 90 Tage nach der letzten Aktivität einer Sitzung. Die Frist ist ein
-- Vorschlag und gehört in das Löschkonzept des Datenschutz-Dossiers - vor dem
-- Scharfschalten mit dem Datenschutzbeauftragten abstimmen. Der Wert wird
-- unten NUR an einer Stelle gesetzt (Parameter von purge_copilot_conversations).
--
-- Diese Migration legt nur die Funktion an. Sie löscht NICHTS von allein.
--
-- Prüfen, was eine Ausführung löschen würde (ändert nichts):
--   select count(*) from public.copilot_conversations
--    where updated_at < now() - interval '90 days';
--
-- Löschen (manuell, einmalig):
--   select public.purge_copilot_conversations(90);
--
-- Dauerhaft täglich (erst nach Freigabe der Frist): pg_cron im Supabase-Dashboard
-- unter Database > Extensions aktivieren, dann:
--   select cron.schedule('copilot-retention', '17 3 * * *',
--     $$select public.purge_copilot_conversations(90)$$);
--
-- Die Antwort-Turns (copilot_conversation_turns) hängen per ON DELETE CASCADE
-- an der Sitzung und werden mitgelöscht.
--
-- Idempotent; im Supabase SQL Editor ausführen.

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_copilot_conversations(retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF retention_days IS NULL OR retention_days < 7 THEN
    RAISE EXCEPTION 'retention_days muss mindestens 7 sein (war: %)', retention_days;
  END IF;

  WITH gone AS (
    DELETE FROM public.copilot_conversations
     WHERE updated_at < now() - make_interval(days => retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM gone;

  RETURN deleted_count;
END;
$$;

-- Nur Service-Rolle bzw. Datenbank-Admin darf löschen; Nutzer nie.
REVOKE ALL ON FUNCTION public.purge_copilot_conversations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_copilot_conversations(integer) TO service_role;

COMMIT;
