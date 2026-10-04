-- 2026-10-03: Rot bewertete Fälle für Nutzer ausblenden (Phase 1, Paket C).
--
-- Entscheidung des Betreibers 03.10.2026: Veröffentlichte Fälle mit
-- legal_review_status = 'rot' (168 Stück) sind für Nutzer bis zur Sanierung
-- unsichtbar; Redaktion (Editor/Reviewer) und Admin sehen weiterhin alles.
--
-- Technik: RESTRICTIVE-Policies werden mit allen vorhandenen (permissiven)
-- SELECT-Policies per UND verknüpft. Damit greift die Regel unabhängig davon,
-- über welche Policy ein Nutzer sonst Zugriff bekäme (Sprint-3.2-/4.6K-
-- Policies). Der Service-Role-Zugriff (Skripte, Pipeline) ist nicht betroffen.
--
-- Zwei Policies, weil die Rolle anon keine EXECUTE-Rechte auf is_editor()/
-- is_admin() hat - eine Funktion in einer anon-Policy würde jede anonyme
-- Abfrage mit "permission denied" abbrechen lassen.
--
-- Rückgängig machen:
--   DROP POLICY IF EXISTS practice_cases_hide_red_anon ON public.practice_cases;
--   DROP POLICY IF EXISTS practice_cases_hide_red_auth ON public.practice_cases;
--
-- Idempotent; im Supabase SQL Editor ausführen.

BEGIN;

DROP POLICY IF EXISTS practice_cases_hide_red_anon ON public.practice_cases;
CREATE POLICY practice_cases_hide_red_anon
  ON public.practice_cases
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (legal_review_status IS DISTINCT FROM 'rot');

DROP POLICY IF EXISTS practice_cases_hide_red_auth ON public.practice_cases;
CREATE POLICY practice_cases_hide_red_auth
  ON public.practice_cases
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    legal_review_status IS DISTINCT FROM 'rot'
    OR public.is_editor()
    OR public.is_admin()
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Prüfung (separat ausführen, ändert nichts):
--
-- 1) Welche Policies sind aktiv?
--    select policyname, permissive, roles, cmd from pg_policies
--     where tablename = 'practice_cases' order by policyname;
--    Erwartet u. a.: practice_cases_hide_red_anon / _auth mit permissive = RESTRICTIVE.
--
-- 2) Sicht eines Lehrkraft-Kontos simulieren (UUID einer Lehrkraft einsetzen,
--    z. B. aus: select id from public.user_profiles where role = 'teacher' limit 1):
--
--    begin;
--    set local role authenticated;
--    select set_config('request.jwt.claims',
--      json_build_object('sub', '<UUID-EINER-LEHRKRAFT>', 'role', 'authenticated')::text, true);
--    select count(*) as gesamt,
--           count(*) filter (where legal_review_status = 'rot') as rot_sichtbar
--      from public.practice_cases where status = 'published';
--    rollback;
--
--    Erwartet: rot_sichtbar = 0 (vorher 168).
-- ---------------------------------------------------------------------------
