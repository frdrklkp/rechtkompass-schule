-- Folge-Fix zu 2026-08-14_case_legal_links_fk.sql: der neue Fremdschlüssel
-- auf legal_section_id wurde korrekt gesetzt, aber die alte, komplett
-- ungenutzte section_id-Spalte hat ebenfalls noch einen Fremdschlüssel zu
-- legal_sections. Zwei gültige Fremdschlüssel zwischen denselben zwei
-- Tabellen machen "legal_sections(...)"-Embeds in .select()-Aufrufen
-- mehrdeutig - PostgREST bricht dann mit PGRST201 hart ab, statt (wie
-- vorher) still null zu liefern. Betrifft aktuell keinen Live-Code (alle
-- Stellen wurden bereits auf zweistufige Abfragen umgestellt), soll aber
-- verhindern, dass künftiger Code versehentlich in dieselbe Falle läuft.
--
-- section_id ist zu 100% ungenutzt (verifiziert 2026-08-14: null bei jeder
-- einzelnen der 634 Zeilen) - der alte Fremdschlüssel kann daher gefahrlos
-- entfernt werden. Die Spalte selbst bleibt bestehen (nur der Constraint
-- fällt weg), falls sie irgendwo noch gelesen wird.

alter table public.case_legal_links
  drop constraint if exists case_legal_links_section_id_fkey;

notify pgrst, 'reload schema';
