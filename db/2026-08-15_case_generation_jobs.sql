-- Sprint 4.6K: Automatische Fallgenerierung durch Lehrkräfte.
-- Job-Tabelle für den asynchronen Hintergrundprozess hinter
-- /api/case-generation-jobs. Idempotent: darf mehrfach ausgeführt werden.

create table if not exists public.case_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  sketch text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  phase text not null default 'queued',
  case_id uuid references public.practice_cases(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_generation_jobs_requested_by_created_at_idx
  on public.case_generation_jobs (requested_by, created_at desc);

alter table public.case_generation_jobs enable row level security;

-- SELECT: eigener Ersteller oder Redaktion (editor/reviewer/admin).
drop policy if exists "case_generation_jobs: select own or editor" on public.case_generation_jobs;
create policy "case_generation_jobs: select own or editor"
  on public.case_generation_jobs for select
  to authenticated
  using (
    requested_by = auth.uid()
    or public.is_editor()
    or public.is_reviewer()
    or public.is_admin()
  );

-- Alle Writes laufen ausschließlich über den Service-Role-Client im
-- serverseitigen Job-Prozess (siehe /api/case-generation-jobs). Direkte
-- Client-Schreibzugriffe sind bewusst blockiert, damit Status/Phase/Fehler
-- nicht manipuliert werden können.
drop policy if exists "case_generation_jobs: block client insert" on public.case_generation_jobs;
create policy "case_generation_jobs: block client insert"
  on public.case_generation_jobs for insert
  to authenticated
  with check (false);

drop policy if exists "case_generation_jobs: block client update" on public.case_generation_jobs;
create policy "case_generation_jobs: block client update"
  on public.case_generation_jobs for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "case_generation_jobs: block client delete" on public.case_generation_jobs;
create policy "case_generation_jobs: block client delete"
  on public.case_generation_jobs for delete
  to authenticated
  using (false);

grant select on public.case_generation_jobs to authenticated;
grant all on public.case_generation_jobs to service_role;

create or replace function public.touch_case_generation_jobs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_case_generation_jobs_updated_at on public.case_generation_jobs;
create trigger trg_case_generation_jobs_updated_at
  before update on public.case_generation_jobs
  for each row execute function public.touch_case_generation_jobs_updated_at();

notify pgrst, 'reload schema';
