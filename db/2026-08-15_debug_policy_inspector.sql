-- Einmalige Diagnosefunktion: listet die tatsächlich aktiven RLS-Policies auf
-- public.practice_cases auf (pg_policies ist über die Data API sonst nicht
-- abfragbar). Wird nach der Diagnose wieder entfernt.
create or replace function public.__debug_practice_cases_policies()
returns table(policyname text, cmd text, roles text[], qual text, with_check text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select policyname, cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename = 'practice_cases'
$$;

grant execute on function public.__debug_practice_cases_policies() to authenticated, anon;

notify pgrst, 'reload schema';
