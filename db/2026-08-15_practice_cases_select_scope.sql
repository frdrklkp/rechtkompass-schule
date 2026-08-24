-- Sprint 4.6K.2: practice_cases SELECT-RLS einschränken.
--
-- Bisherige Policy (Sprint 1.2, db/2026-07-24_sprint_1_2_role_based_rls.sql,
-- __apply_role_rls mit _select_anon=true) ließ ALLE Zeilen für anon UND
-- authenticated lesbar (USING (true)) - dokumentiert als bewusste
-- Entscheidung "öffentlicher Referenzbestand", gefiltert bislang nur
-- clientseitig auf status='published' (fetchPublishedCases/fetchCaseById in
-- src/lib/casesFromDb.ts).
--
-- Sprint 4.6K führte automatisierte Fallgenerierung durch Lehrkräfte ein, die
-- der anfragenden Person einen echten, funktionierenden Link auf ihren
-- eigenen, noch nicht redaktionell geprüften KI-Entwurf gibt - dafür reicht
-- reine Client-Filterung nicht mehr aus (Fund beim Live-Test: eine
-- unbeteiligte zweite Lehrkraft konnte über denselben Mechanismus ebenfalls
-- jeden fremden, unveröffentlichten Fall lesen).
--
-- Ersetzt die eine blanket-Policy durch zwei enger gefasste und ersetzt
-- zugleich die Zwischenlösung aus
-- db/2026-08-15_case_generation_own_visibility.sql (deren Bedingung ist jetzt
-- Teil der authenticated-Policy). service_role (Reindex, Admin-Batches) ist
-- von RLS ohnehin nicht betroffen. Idempotent.

drop policy if exists practice_cases_role_select on public.practice_cases;
drop policy if exists "practice_cases: own generation-requested case visible" on public.practice_cases;

create policy "practice_cases: anon reads published"
  on public.practice_cases for select
  to anon
  using (status = 'published');

create policy "practice_cases: authenticated reads published, own or editor"
  on public.practice_cases for select
  to authenticated
  using (
    status = 'published'
    or public.is_editor()
    or exists (
      select 1 from public.case_generation_jobs j
      where j.case_id = practice_cases.id
        and j.requested_by = auth.uid()
    )
  );

notify pgrst, 'reload schema';
