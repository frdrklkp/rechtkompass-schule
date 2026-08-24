-- KRITISCH: Bereinigt sechs verwaiste RLS-Policies auf public.practice_cases,
-- die aus alten Pilot-/Zwischenständen stammen und nie entfernt wurden.
-- Fund per __debug_practice_cases_policies() (2026-08-15) beim Verifizieren
-- der Sichtbarkeits-Policies aus Sprint 4.6K:
--
--   _role_select        SELECT  anon, authenticated   USING (true)
--   _role_insert_editor INSERT  authenticated          WITH CHECK is_editor()  [harmlos, engt ein]
--   _role_update_editor UPDATE  authenticated          USING/CHECK is_editor() [harmlos, engt ein]
--   _role_delete_admin  DELETE  authenticated          USING is_admin()        [harmlos, engt ein]
--   "cases read all"    SELECT  public                 USING (true)
--   "cases write pilot" ALL     public                 USING (true) WITH CHECK (true)
--
-- Postgres verknüpft mehrere Policies für denselben Befehl/dieselbe Rolle mit
-- OR - jede USING(true)-Policy hebelt sämtliche später hinzugefügten,
-- korrekt eingegrenzten Policies (Sprint 3.2 "practice_cases_select_*",
-- Sprint 4.6K "practice_cases: ...") vollständig aus, unabhängig davon wie
-- eng diese gefasst sind.
--
-- "cases write pilot" ist der schwerwiegendste Fund: FOR ALL TO public
-- USING(true) WITH CHECK(true) erlaubte JEDEM, auch unauthentifizierten
-- Aufrufern, beliebige Zeilen in practice_cases per Data API einzufügen,
-- zu ändern oder zu löschen - unabhängig von Rolle oder Anmeldung.
--
-- Die vier "_role_*"-Policies (ohne "practice_cases"-Präfix) sind vermutlich
-- Artefakte eines fehlerhaften/älteren Aufrufs von __apply_role_rls (Sprint
-- 1.2 löschte gezielt "practice_cases_role_select" - ein anderer Name, der
-- diese hier nie traf). INSERT/UPDATE/DELETE-Varianten sind für sich selbst
-- betrachtet nicht offen (sie prüfen is_editor()/is_admin()), werden aber
-- trotzdem entfernt, da sie reine Duplikate der bereits vorhandenen
-- "practice_cases_insert_editor" / "_update_editor" / "_delete_admin"
-- Policies aus Sprint 3.2 sind.
--
-- Ergebnis nach dieser Migration: nur noch die Sprint-3.2-Policies
-- (practice_cases_select_public/editor/admin, _insert_editor, _update_editor,
-- _delete_admin) sowie die Sprint-4.6K-Policies (practice_cases: anon reads
-- published / authenticated reads published, own or editor) sind aktiv.

drop policy if exists "_role_select"        on public.practice_cases;
drop policy if exists "_role_insert_editor" on public.practice_cases;
drop policy if exists "_role_update_editor" on public.practice_cases;
drop policy if exists "_role_delete_admin"  on public.practice_cases;
drop policy if exists "cases read all"      on public.practice_cases;
drop policy if exists "cases write pilot"   on public.practice_cases;

notify pgrst, 'reload schema';
