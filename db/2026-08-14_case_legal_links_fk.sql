-- Fund 2026-08-14: case_legal_links.legal_section_id hat nie einen echten
-- Fremdschlüssel-Constraint bekommen (nur die alte, inzwischen komplett
-- ungenutzte section_id-Spalte hat einen). Dadurch kann PostgREST den
-- automatischen "legal_sections(...)"-Embed in .select()-Aufrufen nicht
-- auflösen und liefert überall legal_sections: null zurück - betraf u.a.
-- die öffentliche Falldetailseite (Rechtsgrundlagen wurden dort nie
-- angezeigt) sowie mehrere Admin-Ansichten.
--
-- Diese Migration ist der eigentliche Root-Cause-Fix (einmalig, wirkt an
-- allen Stellen gleichzeitig). Bis sie ausgeführt ist, funktioniert die App
-- trotzdem korrekt, da alle betroffenen Stellen im Anwendungscode auf eine
-- zweistufige Abfrage umgestellt wurden, die nicht auf den Auto-Embed
-- angewiesen ist.
--
-- Voraussetzung (bereits verifiziert 2026-08-14): keine verwaisten
-- legal_section_id-Werte vorhanden.
select count(*) as orphaned_rows
from public.case_legal_links cll
where cll.legal_section_id is not null
  and not exists (
    select 1 from public.legal_sections ls where ls.id = cll.legal_section_id
  );
-- Erwartung: 0. Falls > 0, zuerst die betroffenen Zeilen bereinigen, bevor
-- der Constraint unten hinzugefügt wird (der sonst fehlschlägt).

alter table public.case_legal_links
  add constraint case_legal_links_legal_section_id_fkey
  foreign key (legal_section_id) references public.legal_sections(id) on delete cascade;

-- Nach Ausführung: PostgREST-Schema-Cache neu laden, damit der neue
-- Fremdschlüssel für Embeds sofort verfügbar ist.
notify pgrst, 'reload schema';
