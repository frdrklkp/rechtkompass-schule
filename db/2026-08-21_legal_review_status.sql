-- Legal Export Quality Gate: speichert das Gesamturteil des neuen
-- Claim-Validierungsschritts (src/routes/api/ai-validate-legal-claims.ts)
-- direkt am Fall. Bewusst eine NEUE Spalte statt Wiederverwendung von
-- practice_cases.quality_grade - jene Spalte ist per CHECK-Constraint auf
-- 'A'|'B'|'C'|'D' festgelegt (db/2026-07-25_editorial_schema.sql, ein
-- völlig anderes, nie automatisiertes Score-Konzept) und würde durch
-- Zweckentfremdung nur Verwirrung stiften.
-- Idempotent.

BEGIN;

alter table public.practice_cases
  add column if not exists legal_review_status text;

alter table public.practice_cases
  drop constraint if exists practice_cases_legal_review_status_chk;

alter table public.practice_cases
  add constraint practice_cases_legal_review_status_chk
  check (legal_review_status is null or legal_review_status in ('gruen', 'gelb', 'rot'));

alter table public.practice_cases
  add column if not exists legal_review_reasoning text;

COMMIT;

notify pgrst, 'reload schema';
