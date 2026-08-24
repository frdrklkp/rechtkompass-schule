-- Sprint 4.6K: Lehrkräfte sollen den von ihnen automatisch angelegten Fall
-- bereits während der redaktionellen Prüfung einsehen können (noch nicht
-- published, workflow_status='in_review'). practice_cases hat keine eigene
-- "erstellt von"-Spalte; die Zuordnung läuft über case_generation_jobs.
--
-- Additive Policy: Postgres verknüpft mehrere SELECT-Policies für dieselbe
-- Rolle mit OR, die bestehende Policy "status = 'published' OR is_editor()"
-- (db/2026-07-24_sprint_1_2_role_based_rls.sql) bleibt unverändert bestehen.
-- Idempotent: darf mehrfach ausgeführt werden.

drop policy if exists "practice_cases: own generation-requested case visible" on public.practice_cases;
create policy "practice_cases: own generation-requested case visible"
  on public.practice_cases for select
  to authenticated
  using (
    exists (
      select 1 from public.case_generation_jobs j
      where j.case_id = practice_cases.id
        and j.requested_by = auth.uid()
    )
  );

notify pgrst, 'reload schema';
