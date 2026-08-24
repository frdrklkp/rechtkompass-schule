-- Entfernt die temporäre Diagnosefunktion aus
-- db/2026-08-15_debug_policy_inspector.sql wieder (diente nur der einmaligen
-- Prüfung der aktiven practice_cases-Policies).
drop function if exists public.__debug_practice_cases_policies();

notify pgrst, 'reload schema';
