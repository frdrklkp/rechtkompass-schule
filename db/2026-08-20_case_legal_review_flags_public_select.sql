-- Erlaubt öffentliches Lesen von case_legal_review_flags für veröffentlichte
-- Fälle. Die Tabelle (db/2026-07-25_editorial_schema.sql) hat RLS aktiviert,
-- aber bislang KEINE Policy - ohne Policy bleibt der Zugriff für anon/
-- authenticated standardmäßig verweigert (service_role umgeht RLS ohnehin).
--
-- Fund 2026-08-20: die neue "Offene Rechtsfragen"-Anzeige auf der
-- öffentlichen Falldetailseite (src/routes/faelle.$id.tsx) und im
-- PDF-Export (buildPracticeCaseSummaryMarkdown) laufen beide über den
-- anon-Client, nicht über eine privilegierte Admin-Session - ohne diese
-- Policy blieben die Flags für Lehrkräfte unsichtbar, obwohl sie genau für
-- diese Zielgruppe gedacht sind (Transparenz über unbelegte Aussagen).
--
-- Bewusst nur SELECT, nur für Fälle mit status = 'published' (identische
-- Bedingung wie die bestehende practice_cases-Policy, siehe
-- db/2026-08-15_practice_cases_select_scope.sql) - Entwürfe/unveröffentlichte
-- Fälle bleiben für die Öffentlichkeit unsichtbar, auch ihre Review-Flags.
--
-- Nachtrag 2026-08-21: RLS-Policies allein reichen nicht - Postgres prüft
-- zuerst die tabellenweite GRANT-Berechtigung der Rolle, erst danach die
-- Policy. case_legal_review_flags hatte nie ein GRANT SELECT für
-- anon/authenticated (Fehler beim Testen: "permission denied for table
-- case_legal_review_flags", SQLSTATE 42501). Beide Ebenen jetzt gesetzt.
-- Idempotent.

grant select on public.case_legal_review_flags to anon, authenticated;

drop policy if exists "case_legal_review_flags: public reads for published cases" on public.case_legal_review_flags;

create policy "case_legal_review_flags: public reads for published cases"
  on public.case_legal_review_flags for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.practice_cases p
      where p.id = case_legal_review_flags.case_id
        and p.status = 'published'
    )
  );

notify pgrst, 'reload schema';
